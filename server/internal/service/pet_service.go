package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/port"
)

type PetService struct {
	Store      port.PetStore
	Points     port.PointsPort
	WaterRate  port.WaterRatePort
	Clock      port.Clock
	Logger     *logx.Logger
	Invites    inviteLookup
}

type inviteLookup interface {
	FindInvite(code string) (domain.InviteCode, bool)
	MarkInviteUsed(code string) error
}

func (s *PetService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now()
	}
	return time.Now().UTC()
}

func (s *PetService) today() string { return domain.BusinessDate(s.now()) }

// Person 是好友可见的公共信息（隐私裁剪）。
type Person struct {
	UserID    string  `json:"userId"`
	Species   string  `json:"species,omitempty"`
	Level     int     `json:"level,omitempty"`
	Intimacy  int     `json:"intimacy,omitempty"`
	WeekRate  float64 `json:"weekRate,omitempty"`
}

func (s *PetService) GetPet(ctx context.Context, userID string) (domain.Pet, error) {
	var pet domain.Pet
	changed := false
	err := s.Store.Do(ctx, userID, func(tx *port.PetTx) error {
		if tx.Pet == nil {
			return apperr.NewPet(apperr.Pet002, nil)
		}
		if domain.ApplyDecay(tx.Pet, s.now()) {
			changed = true
		}
		pet = *tx.Pet
		_ = changed
		return nil
	})
	if err != nil {
		return domain.Pet{}, normalizePet(err)
	}
	return pet, nil
}

func (s *PetService) Adopt(ctx context.Context, userID, species, name string) (domain.Pet, error) {
	var pet domain.Pet
	err := s.Store.Do(ctx, userID, func(tx *port.PetTx) error {
		if tx.Pet != nil {
			return apperr.NewPet(apperr.Pet003, nil)
		}
		created, err := domain.NewPet(userID, species, name, s.now())
		if err != nil {
			return apperr.NewPet(apperr.Pet001, err)
		}
		tx.Pet = &created
		pet = created
		return nil
	})
	if err != nil {
		return domain.Pet{}, normalizePet(err)
	}
	return pet, nil
}

func (s *PetService) Rename(ctx context.Context, userID, name string) (domain.Pet, error) {
	var pet domain.Pet
	err := s.Store.Do(ctx, userID, func(tx *port.PetTx) error {
		if tx.Pet == nil {
			return apperr.NewPet(apperr.Pet002, nil)
		}
		if err := domain.Rename(tx.Pet, name, s.now()); err != nil {
			if errors.Is(err, domain.ErrPetRenameCap) {
				return apperr.NewPet(apperr.Pet004, err)
			}
			return apperr.NewPet(apperr.Pet001, err)
		}
		pet = *tx.Pet
		return nil
	})
	if err != nil {
		return domain.Pet{}, normalizePet(err)
	}
	return pet, nil
}

func (s *PetService) Allocate(ctx context.Context, userID, attr string) (domain.Pet, error) {
	var pet domain.Pet
	err := s.Store.Do(ctx, userID, func(tx *port.PetTx) error {
		if tx.Pet == nil {
			return apperr.NewPet(apperr.Pet002, nil)
		}
		if err := domain.Allocate(tx.Pet, attr); err != nil {
			if errors.Is(err, domain.ErrPetNoPoints) {
				return apperr.NewPet(apperr.Pet005, err)
			}
			return apperr.NewPet(apperr.Pet006, err)
		}
		pet = *tx.Pet
		return nil
	})
	if err != nil {
		return domain.Pet{}, normalizePet(err)
	}
	return pet, nil
}

func (s *PetService) Items(ctx context.Context, userID string) ([]map[string]any, error) {
	out := make([]map[string]any, 0)
	err := s.Store.View(ctx, userID, func(tx *port.PetTx) error {
		for _, def := range domain.ItemCatalog() {
			out = append(out, map[string]any{
				"itemId": def.ItemID, "name": def.Name, "kind": def.Kind,
				"price": def.Price, "effects": def.Effects, "status": def.Status,
				"qty": tx.Inventory[def.ItemID],
			})
		}
		return nil
	})
	if err != nil {
		return nil, normalizePet(err)
	}
	return out, nil
}

// Redeem 扣积分 + 加库存，同一事务；幂等键 24h。
func (s *PetService) Redeem(ctx context.Context, userID, itemID, idemKey string) (int, error) {
	def, ok := findItem(itemID)
	if !ok {
		return 0, apperr.NewPet(apperr.Item001, nil)
	}
	if def.Status != "on_sale" {
		return 0, apperr.NewPet(apperr.Item004, nil)
	}
	if !domain.ValidIdempotencyKey(idemKey) {
		return 0, apperr.NewPet(apperr.Item003, nil)
	}
	if err := s.Points.Spend(ctx, userID, def.Price, "item:"+itemID); err != nil {
		return 0, err
	}
	qty := 0
	err := s.Store.Do(ctx, userID, func(tx *port.PetTx) error {
		if existing, ok := tx.ItemIdem[idemKey]; ok {
			if existing != itemID {
				return apperr.NewPet(apperr.Item003, nil)
			}
			qty = tx.Inventory[itemID]
			return nil
		}
		tx.Inventory[itemID]++
		tx.ItemIdem[idemKey] = itemID
		qty = tx.Inventory[itemID]
		return nil
	})
	if err != nil {
		// 库存写入失败需回滚积分（简化：补回）
		_ = s.Points.Grant(ctx, userID, def.Price, "item-rollback:"+itemID)
		return 0, normalizePet(err)
	}
	return qty, nil
}

// UseItem 扣库存并应用效果；feed 只允许 food，play 只允许 toy。
func (s *PetService) UseItem(ctx context.Context, userID, itemID, idemKey, expectKind string) (domain.Pet, error) {
	def, ok := findItem(itemID)
	if !ok {
		return domain.Pet{}, apperr.NewPet(apperr.Item001, nil)
	}
	if expectKind != "" && def.Kind != expectKind {
		return domain.Pet{}, apperr.NewPet(apperr.Item001, nil)
	}
	if !domain.ValidIdempotencyKey(idemKey) {
		return domain.Pet{}, apperr.NewPet(apperr.Item003, nil)
	}
	var pet domain.Pet
	err := s.Store.Do(ctx, userID, func(tx *port.PetTx) error {
		if tx.Pet == nil {
			return apperr.NewPet(apperr.Pet002, nil)
		}
		useKey := "use:" + idemKey
		if existing, ok := tx.ItemIdem[useKey]; ok {
			if existing != itemID {
				return apperr.NewPet(apperr.Item003, nil)
			}
			pet = *tx.Pet
			return nil
		}
		if tx.Inventory[itemID] <= 0 {
			return apperr.NewPet(apperr.Item002, nil)
		}
		tx.Inventory[itemID]--
		tx.ItemIdem[useKey] = itemID
		applyEffects(tx.Pet, def)
		pet = *tx.Pet
		return nil
	})
	if err != nil {
		return domain.Pet{}, normalizePet(err)
	}
	return pet, nil
}

func applyEffects(p *domain.Pet, def domain.ItemDef) {
	switch def.Kind {
	case "food":
		domain.Feed(p, def.Effects.Satiety, def.Effects.Exp)
	case "toy":
		domain.Play(p, def.Effects.Mood, def.Effects.Intimacy)
	case "tool":
		p.Points = p.Points + def.Effects.Points
		if p.Points > domain.PetMaxPoints {
			p.Points = domain.PetMaxPoints
		}
	}
}

// ---------- 好友 ----------

func (s *PetService) Friends(ctx context.Context, userID string) ([]domain.FriendEdge, error) {
	var out []domain.FriendEdge
	err := s.Store.View(ctx, userID, func(tx *port.PetTx) error {
		out = append(out, tx.Friends...)
		return nil
	})
	if err != nil {
		return nil, normalizePet(err)
	}
	return out, nil
}

func (s *PetService) CreateInvite(ctx context.Context, userID string) (domain.InviteCode, error) {
	invite, err := domain.NewInviteCode(userID, s.now())
	if err != nil {
		return domain.InviteCode{}, apperr.NewPet(apperr.Friend001, err)
	}
	err = s.Store.Do(ctx, userID, func(tx *port.PetTx) error {
		tx.Invites[invite.Code] = invite
		return nil
	})
	if err != nil {
		return domain.InviteCode{}, normalizePet(err)
	}
	return invite, nil
}

// AcceptInvite 建立双向好友边并消费邀请码。
func (s *PetService) AcceptInvite(ctx context.Context, userID, code string) error {
	if !domain.ValidInviteCode(code) {
		return apperr.NewPet(apperr.Friend001, nil)
	}
	if s.Invites == nil {
		return apperr.NewPet(apperr.Friend002, nil)
	}
	invite, ok := s.Invites.FindInvite(code)
	if !ok || invite.Used || s.now().After(invite.ExpiresAt) || invite.UserID == userID {
		return apperr.NewPet(apperr.Friend002, nil)
	}
	// 好友上限
	var count int
	_ = s.Store.View(ctx, userID, func(tx *port.PetTx) error {
		for _, f := range tx.Friends {
			if f.Status == domain.FriendAccepted {
				count++
			}
		}
		return nil
	})
	if count >= domain.FriendLimit {
		return apperr.NewPet(apperr.Friend003, nil)
	}
	owner := invite.UserID
	if err := s.addFriendEdge(ctx, userID, owner); err != nil {
		return err
	}
	if err := s.addFriendEdge(ctx, owner, userID); err != nil {
		return err
	}
	_ = s.Invites.MarkInviteUsed(code)
	return nil
}

func (s *PetService) addFriendEdge(ctx context.Context, userID, friendID string) error {
	err := s.Store.Do(ctx, userID, func(tx *port.PetTx) error {
		for i, f := range tx.Friends {
			if f.FriendID == friendID {
				if f.Status == domain.FriendBlocked {
					return apperr.NewPet(apperr.Friend004, nil)
				}
				tx.Friends[i].Status = domain.FriendAccepted
				return nil
			}
		}
		tx.Friends = append(tx.Friends, domain.FriendEdge{
			UserID: userID, FriendID: friendID, Status: domain.FriendAccepted, CreatedAt: s.now(),
		})
		return nil
	})
	return normalizePet(err)
}

func (s *PetService) RemoveFriend(ctx context.Context, userID, friendID string) error {
	err := s.Store.Do(ctx, userID, func(tx *port.PetTx) error {
		for i, f := range tx.Friends {
			if f.FriendID == friendID {
				tx.Friends = append(tx.Friends[:i], tx.Friends[i+1:]...)
				return nil
			}
		}
		return apperr.NewPet(apperr.Friend006, nil)
	})
	if err != nil {
		return normalizePet(err)
	}
	_ = s.Store.Do(ctx, friendID, func(tx *port.PetTx) error {
		for i, f := range tx.Friends {
			if f.FriendID == userID {
				tx.Friends = append(tx.Friends[:i], tx.Friends[i+1:]...)
				return nil
			}
		}
		return nil
	})
	return nil
}

func (s *PetService) BlockFriend(ctx context.Context, userID, friendID string) error {
	err := s.Store.Do(ctx, userID, func(tx *port.PetTx) error {
		for i, f := range tx.Friends {
			if f.FriendID == friendID {
				tx.Friends[i].Status = domain.FriendBlocked
				return nil
			}
		}
		tx.Friends = append(tx.Friends, domain.FriendEdge{
			UserID: userID, FriendID: friendID, Status: domain.FriendBlocked, CreatedAt: s.now(),
		})
		return nil
	})
	return normalizePet(err)
}

// ---------- PK ----------

func (s *PetService) Challenge(ctx context.Context, userID, friendID string) (domain.PkMatch, error) {
	if !s.isFriend(ctx, userID, friendID) {
		return domain.PkMatch{}, apperr.NewPet(apperr.Pk002, nil)
	}
	now := s.now()
	day := s.today()
	var match domain.PkMatch
	err := s.Store.Do(ctx, userID, func(tx *port.PetTx) error {
		if tx.PkDaily[day] >= domain.PkLimit {
			return apperr.NewPet(apperr.Pk004, nil)
		}
		if tx.PkPairDay[day+"|"+friendID] {
			return apperr.NewPet(apperr.Pk007, nil)
		}
		match = domain.PkMatch{
			PkID: fmt.Sprintf("pk_%d", now.UnixNano()), Challenger: userID, Opponent: friendID,
			State: domain.PkPending, CreatedAt: now, ExpiresAt: now.Add(24 * time.Hour),
		}
		tx.PkDaily[day]++
		tx.PkPairDay[day+"|"+friendID] = true
		tx.PkMatches = append(tx.PkMatches, match)
		return nil
	})
	if err != nil {
		return domain.PkMatch{}, normalizePet(err)
	}
	return match, nil
}

func (s *PetService) AcceptPK(ctx context.Context, userID, pkID string) (domain.PkMatch, error) {
	// 先在自己与对方记录中定位对局
	var match domain.PkMatch
	found := false
	var challengerID string
	_ = s.Store.View(ctx, userID, func(tx *port.PetTx) error {
		for _, m := range tx.PkMatches {
			if m.PkID == pkID {
				match = m
				found = true
			}
		}
		return nil
	})
	if !found {
		// 可能是对方发起，扫描最近对局（简化：由调用方传入对局；此处直接尝试对方视图需已知 ID）
		return domain.PkMatch{}, apperr.NewPet(apperr.Pk006, nil)
	}
	if match.Opponent != userID {
		return domain.PkMatch{}, apperr.NewPet(apperr.Pk006, nil)
	}
	if match.State != domain.PkPending {
		return domain.PkMatch{}, apperr.NewPet(apperr.Pk005, nil)
	}
	if s.now().After(match.ExpiresAt) {
		_ = s.Store.Do(ctx, userID, func(tx *port.PetTx) error {
			for i := range tx.PkMatches {
				if tx.PkMatches[i].PkID == pkID {
					tx.PkMatches[i].State = domain.PkExpired
				}
			}
			return nil
		})
		return domain.PkMatch{}, apperr.NewPet(apperr.Pk003, nil)
	}
	challengerID = match.Challenger
	scoreA := s.score(ctx, challengerID)
	scoreB := s.score(ctx, userID)
	rateA := s.rate(ctx, challengerID)
	rateB := s.rate(ctx, userID)
	winner := domain.SettlePk(scoreA, scoreB, rateA, rateB)
	now := s.now()
	match.ScoreA, match.ScoreB, match.Winner = scoreA, scoreB, winner
	match.State = domain.PkSettled
	match.SettledAt = &now

	settle := func(uid string) error {
		return s.Store.Do(ctx, uid, func(tx *port.PetTx) error {
			for i := range tx.PkMatches {
				if tx.PkMatches[i].PkID == pkID {
					tx.PkMatches[i] = match
				}
			}
			if tx.Pet != nil && (winner == "a" || winner == domain.PkDraw) {
				tx.Pet.Intimacy = minInt(tx.Pet.Intimacy+5, 100)
			}
			return nil
		})
	}
	if err := settle(challengerID); err != nil {
		return domain.PkMatch{}, normalizePet(err)
	}
	if err := settle(userID); err != nil {
		return domain.PkMatch{}, normalizePet(err)
	}

	// 奖励：胜 +20，负 +5，平各 +10
	switch winner {
	case "a":
		_ = s.Points.Grant(ctx, challengerID, 20, "pk:"+pkID)
		_ = s.Points.Grant(ctx, userID, 5, "pk:"+pkID)
	case "b":
		_ = s.Points.Grant(ctx, userID, 20, "pk:"+pkID)
		_ = s.Points.Grant(ctx, challengerID, 5, "pk:"+pkID)
	default:
		_ = s.Points.Grant(ctx, challengerID, 10, "pk:"+pkID)
		_ = s.Points.Grant(ctx, userID, 10, "pk:"+pkID)
	}
	return match, nil
}

func (s *PetService) GetPK(ctx context.Context, userID, pkID string) (domain.PkMatch, error) {
	var out domain.PkMatch
	found := false
	err := s.Store.View(ctx, userID, func(tx *port.PetTx) error {
		for _, m := range tx.PkMatches {
			if m.PkID == pkID {
				out = m
				found = true
			}
		}
		return nil
	})
	if err != nil {
		return domain.PkMatch{}, normalizePet(err)
	}
	if !found {
		return domain.PkMatch{}, apperr.NewPet(apperr.Pk006, nil)
	}
	return out, nil
}

func (s *PetService) PKHistory(ctx context.Context, userID string) ([]domain.PkMatch, error) {
	var out []domain.PkMatch
	err := s.Store.View(ctx, userID, func(tx *port.PetTx) error {
		out = append(out, tx.PkMatches...)
		return nil
	})
	if err != nil {
		return nil, normalizePet(err)
	}
	return out, nil
}

func (s *PetService) isFriend(ctx context.Context, userID, friendID string) bool {
	ok := false
	_ = s.Store.View(ctx, userID, func(tx *port.PetTx) error {
		for _, f := range tx.Friends {
			if f.FriendID == friendID && f.Status == domain.FriendAccepted {
				ok = true
			}
		}
		return nil
	})
	return ok
}

func (s *PetService) score(ctx context.Context, userID string) float64 {
	var intimacy int
	_ = s.Store.View(ctx, userID, func(tx *port.PetTx) error {
		if tx.Pet != nil {
			intimacy = tx.Pet.Intimacy
		}
		return nil
	})
	return domain.PkScore(s.rate(ctx, userID), intimacy)
}

func (s *PetService) rate(ctx context.Context, userID string) float64 {
	if s.WaterRate == nil {
		return 0
	}
	rate, err := s.WaterRate.WeekRate(ctx, userID)
	if err != nil {
		return 0
	}
	return rate
}

func findItem(itemID string) (domain.ItemDef, bool) {
	for _, def := range domain.ItemCatalog() {
		if def.ItemID == itemID {
			return def, true
		}
	}
	return domain.ItemDef{}, false
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func normalizePet(err error) error {
	if err == nil {
		return nil
	}
	var pe *apperr.PetError
	if errors.As(err, &pe) {
		return pe
	}
	return apperr.NewPet(apperr.Pet008, err)
}