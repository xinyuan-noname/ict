package service

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/platform/ratelimit"
	"ict/server/internal/port"
)

type RewardService struct {
	Store          port.RewardStore
	Catalog        []domain.FrameDefinition
	CatalogVersion string
	Clock          port.Clock
	Logger         *logx.Logger
	CheckInLimiter *ratelimit.Limiter
	RedeemLimiter  *ratelimit.Limiter
}

type StatusView struct {
	Today           string
	Timezone        string
	CanCheckIn      bool
	CheckedIn       bool
	StreakDays      int
	TodayReward     int
	NextReward      int
	PointsBalance   int
	LastCheckInDate string
	ServerTime      string
}

type CheckInView struct {
	CheckedIn        bool
	AlreadyCheckedIn bool
	CheckInDate      string
	StreakDays       int
	EarnedPoints     int
	BalanceAfter     int
	BalanceCapped    bool
	NextReward       int
	RuleVersion      string
}

type LedgerItem struct {
	EntryID      string
	Type         string
	Amount       int
	BalanceAfter int
	OccurredAt   string
	RefID        string
	FrameID      string
	RuleVersion  string
}

type LedgerView struct {
	Items      []LedgerItem
	NextCursor string
	HasMore    bool
}

type FrameView struct {
	FrameID     string
	Name        string
	Description string
	Price       int
	AssetURL    string
	Status      string
	Owned       bool
	Equipped    bool
	Purchasable bool
}

type FramesView struct {
	CatalogVersion string
	Frames         []FrameView
}

type RedeemView struct {
	OrderID      string
	FrameID      string
	Price        int
	BalanceAfter int
	RedeemedAt   string
	Replayed     bool
	Owned        bool
	Equipped     bool
}

type EquippedFrame struct {
	FrameID  string
	Name     string
	AssetURL string
}

type EquipView struct {
	EquippedFrame *EquippedFrame
	Changed       bool
}

func (s *RewardService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now()
	}
	return time.Now().UTC()
}

func (s *RewardService) frameCatalog() []domain.FrameDefinition {
	if len(s.Catalog) > 0 {
		return s.Catalog
	}
	return domain.DefaultCatalog()
}

func (s *RewardService) catalogVersion() string {
	if s.CatalogVersion != "" {
		return s.CatalogVersion
	}
	return "catalog-v1"
}

func (s *RewardService) findFrame(id string) (domain.FrameDefinition, bool) {
	for _, f := range s.frameCatalog() {
		if f.ID == id {
			return f, true
		}
	}
	return domain.FrameDefinition{}, false
}

// Status 纯查询，不写入任何记录。
func (s *RewardService) Status(ctx context.Context, userID string) (StatusView, error) {
	now := s.now()
	today := domain.BusinessDate(now)
	view := StatusView{
		Today: today, Timezone: domain.BusinessTZName, ServerTime: now.UTC().Format(time.RFC3339),
	}
	err := s.Store.View(ctx, userID, func(tx *port.RewardTx) error {
		lastDate, lastStreak := lastCheckIn(tx, today)
		record, checked := tx.CheckIns[today]
		view.PointsBalance = tx.Account.Balance
		view.CheckedIn = checked
		view.CanCheckIn = !checked
		view.LastCheckInDate = lastDate
		if checked {
			view.StreakDays = record.Streak
			view.TodayReward = 0
			view.NextReward = domain.CheckInPoints(domain.StreakAfter(today, record.Streak, nextDate(today)))
		} else {
			view.StreakDays = domain.StreakAfter(lastDate, lastStreak, today)
			view.TodayReward = domain.CheckInPoints(view.StreakDays)
			view.NextReward = domain.CheckInPoints(domain.StreakAfter(today, view.StreakDays, nextDate(today)))
		}
		return nil
	})
	if err != nil {
		return StatusView{}, apperr.NewReward(apperr.Point005, err)
	}
	return view, nil
}

// CheckIn 幂等：同一用户同一签到日的后续请求返回 alreadyCheckedIn。
func (s *RewardService) CheckIn(ctx context.Context, userID string) (CheckInView, error) {
	if ok, retry := s.checkInAllowed(userID); !ok {
		ae := apperr.NewReward(apperr.Point004, nil)
		ae.Cause = errors.New("retry")
		_ = retry
		return CheckInView{}, ae
	}
	now := s.now()
	today := domain.BusinessDate(now)
	var view CheckInView
	err := s.Store.Do(ctx, userID, func(tx *port.RewardTx) error {
		// 时钟回拨检测：已处理过未来日期则拒绝写入。
		if tx.HighWater != "" && tx.HighWater > today {
			return apperr.NewReward(apperr.Point005, errors.New("clock went backwards"))
		}
		if record, ok := tx.CheckIns[today]; ok {
			view = CheckInView{
				CheckedIn: true, AlreadyCheckedIn: true, CheckInDate: today,
				StreakDays: record.Streak, EarnedPoints: 0, BalanceAfter: tx.Account.Balance,
				NextReward: domain.CheckInPoints(domain.StreakAfter(today, record.Streak, nextDate(today))),
				RuleVersion: domain.RuleVersion,
			}
			return nil
		}
		lastDate, lastStreak := lastCheckIn(tx, today)
		streak := domain.StreakAfter(lastDate, lastStreak, today)
		points := domain.CheckInPoints(streak)
		applied, capped := domain.ApplyCap(tx.Account.Balance, points)
		tx.Account.Balance += applied
		tx.Account.UpdatedAt = now
		tx.CheckIns[today] = domain.CheckInRecord{
			UserID: userID, Date: today, Streak: streak, Points: applied, CreatedAt: now,
		}
		if applied > 0 {
			tx.Entries = append(tx.Entries, domain.PointsEntry{
				EntryID: domain.NewEntryID(), UserID: userID, Type: domain.EntryCheckInEarn,
				Amount: applied, BalanceAfter: tx.Account.Balance, OccurredAt: now,
				RefID: today, RuleVersion: domain.RuleVersion,
			})
		}
		tx.HighWater = today
		view = CheckInView{
			CheckedIn: true, AlreadyCheckedIn: false, CheckInDate: today, StreakDays: streak,
			EarnedPoints: applied, BalanceAfter: tx.Account.Balance, BalanceCapped: capped,
			NextReward: domain.CheckInPoints(domain.StreakAfter(today, streak, nextDate(today))),
			RuleVersion: domain.RuleVersion,
		}
		return nil
	})
	if err != nil {
		return CheckInView{}, normalizeReward(err)
	}
	if s.Logger != nil {
		s.Logger.Info(ctx, "checkin success", "event", "reward_checkin", "streak", view.StreakDays, "earned", view.EarnedPoints)
	}
	return view, nil
}

// Ledger 按 occurredAt/entryId 倒序返回，cursor 为上一页末条 entryId 的 base64。
func (s *RewardService) Ledger(ctx context.Context, userID, cursor string, limit int) (LedgerView, error) {
	if limit <= 0 || limit > 50 {
		return LedgerView{}, apperr.NewReward(apperr.Point001, nil)
	}
	var view LedgerView
	err := s.Store.View(ctx, userID, func(tx *port.RewardTx) error {
		entries := append([]domain.PointsEntry(nil), tx.Entries...)
		sort.SliceStable(entries, func(i, j int) bool {
			if entries[i].OccurredAt.Equal(entries[j].OccurredAt) {
				return entries[i].EntryID > entries[j].EntryID
			}
			return entries[i].OccurredAt.After(entries[j].OccurredAt)
		})
		start := 0
		if cursor != "" {
			decoded := decodeCursor(cursor)
			for i, e := range entries {
				if e.EntryID == decoded {
					start = i + 1
					break
				}
			}
			if start == 0 && decoded != "" {
				return apperr.NewReward(apperr.Point001, errors.New("unknown cursor"))
			}
		}
		end := start + limit
		if end > len(entries) {
			end = len(entries)
		}
		for _, e := range entries[start:end] {
			view.Items = append(view.Items, LedgerItem{
				EntryID: e.EntryID, Type: e.Type, Amount: e.Amount, BalanceAfter: e.BalanceAfter,
				OccurredAt: e.OccurredAt.In(domain.BusinessZone).Format(time.RFC3339),
				RefID: e.RefID, FrameID: e.FrameID, RuleVersion: e.RuleVersion,
			})
		}
		if end < len(entries) && end > start {
			view.NextCursor = encodeCursor(entries[end-1].EntryID)
			view.HasMore = true
		}
		return nil
	})
	if err != nil {
		return LedgerView{}, normalizeReward(err)
	}
	return view, nil
}

// Frames 返回目录；默认过滤未拥有的下架条目。
func (s *RewardService) Frames(ctx context.Context, userID, status string) (FramesView, error) {
	if status != "" && status != "on_sale" && status != "all" {
		return FramesView{}, apperr.NewReward(apperr.Reward008, nil)
	}
	view := FramesView{CatalogVersion: s.catalogVersion()}
	err := s.Store.View(ctx, userID, func(tx *port.RewardTx) error {
		for _, f := range s.frameCatalog() {
			owned := tx.Owned[f.ID].FrameID != ""
			equipped := tx.Equipped == f.ID
			if f.Status == domain.FrameOffShelf && !owned {
				continue
			}
			if status == "on_sale" && f.Status != domain.FrameOnSale {
				continue
			}
			view.Frames = append(view.Frames, FrameView{
				FrameID: f.ID, Name: f.Name, Description: f.Description, Price: f.Price,
				AssetURL: f.AssetURL(), Status: string(f.Status), Owned: owned, Equipped: equipped,
				Purchasable: f.Status == domain.FrameOnSale && !owned,
			})
		}
		return nil
	})
	if err != nil {
		return FramesView{}, normalizeReward(err)
	}
	return view, nil
}

// Redeem 扣减、流水、拥有关系与订单必须原子完成。
func (s *RewardService) Redeem(ctx context.Context, userID, frameID, idemKey, catalogVersion string) (RedeemView, error) {
	if !domain.ValidFrameID(frameID) || !domain.ValidIdempotencyKey(idemKey) {
		return RedeemView{}, apperr.NewReward(apperr.Reward008, nil)
	}
	if ok, _ := s.redeemAllowed(userID); !ok {
		return RedeemView{}, apperr.NewReward(apperr.Point004, nil)
	}
	if catalogVersion != "" && catalogVersion != s.catalogVersion() {
		return RedeemView{}, apperr.NewReward(apperr.Reward007, nil)
	}
	frame, ok := s.findFrame(frameID)
	if !ok {
		return RedeemView{}, apperr.NewReward(apperr.Reward001, nil)
	}
	now := s.now()
	var view RedeemView
	err := s.Store.Do(ctx, userID, func(tx *port.RewardTx) error {
		orderKey := userID + "|" + idemKey
		if existing, ok := tx.Orders[orderKey]; ok {
			if existing.FrameID != frame.ID {
				return apperr.NewReward(apperr.Reward006, nil)
			}
			view = RedeemView{
				OrderID: existing.OrderID, FrameID: existing.FrameID, Price: existing.Price,
				BalanceAfter: tx.Account.Balance,
				RedeemedAt: existing.CreatedAt.In(domain.BusinessZone).Format(time.RFC3339),
				Replayed: true, Owned: true, Equipped: tx.Equipped == frame.ID,
			}
			return nil
		}
		if _, owned := tx.Owned[frame.ID]; owned {
			return apperr.NewReward(apperr.Reward003, nil)
		}
		if frame.Status != domain.FrameOnSale {
			return apperr.NewReward(apperr.Reward002, nil)
		}
		if tx.Account.Balance < frame.Price {
			return apperr.NewReward(apperr.Point002, nil)
		}
		tx.Account.Balance -= frame.Price
		tx.Account.UpdatedAt = now
		orderID := domain.NewOrderID()
		tx.Owned[frame.ID] = domain.OwnedFrame{
			UserID: userID, FrameID: frame.ID, OrderID: orderID, Price: frame.Price, AcquiredAt: now,
		}
		tx.Orders[orderKey] = domain.RedeemOrder{
			OrderID: orderID, UserID: userID, FrameID: frame.ID, Price: frame.Price,
			IdempotencyKey: idemKey, CreatedAt: now,
		}
		// 免费头像框不产生 amount=0 的流水（spec 7.4 语义 2）。
		if frame.Price > 0 {
			tx.Entries = append(tx.Entries, domain.PointsEntry{
				EntryID: domain.NewEntryID(), UserID: userID, Type: domain.EntryRewardSpend,
				Amount: -frame.Price, BalanceAfter: tx.Account.Balance, OccurredAt: now,
				RefID: orderID, FrameID: frame.ID, RuleVersion: domain.RuleVersion,
			})
		}
		view = RedeemView{
			OrderID: orderID, FrameID: frame.ID, Price: frame.Price, BalanceAfter: tx.Account.Balance,
			RedeemedAt: now.In(domain.BusinessZone).Format(time.RFC3339), Replayed: false,
			Owned: true, Equipped: tx.Equipped == frame.ID,
		}
		return nil
	})
	if err != nil {
		return RedeemView{}, normalizeReward(err)
	}
	return view, nil
}

// Equip 装备/切换/卸下；同值重复为幂等成功。
func (s *RewardService) Equip(ctx context.Context, userID string, frameID *string) (EquipView, error) {
	var view EquipView
	err := s.Store.Do(ctx, userID, func(tx *port.RewardTx) error {
		previous := tx.Equipped
		if frameID == nil || strings.TrimSpace(*frameID) == "" {
			tx.Equipped = ""
			view.Changed = previous != ""
			view.EquippedFrame = nil
			return nil
		}
		id := strings.TrimSpace(*frameID)
		if !domain.ValidFrameID(id) {
			return apperr.NewReward(apperr.Reward008, nil)
		}
		frame, ok := s.findFrame(id)
		if !ok {
			return apperr.NewReward(apperr.Reward001, nil)
		}
		if _, owned := tx.Owned[id]; !owned {
			return apperr.NewReward(apperr.Reward004, nil)
		}
		tx.Equipped = id
		view.Changed = previous != id
		view.EquippedFrame = &EquippedFrame{FrameID: frame.ID, Name: frame.Name, AssetURL: frame.AssetURL()}
		return nil
	})
	if err != nil {
		return EquipView{}, normalizeReward(err)
	}
	return view, nil
}

func (s *RewardService) checkInAllowed(userID string) (bool, int) {
	if s.CheckInLimiter == nil {
		return true, 0
	}
	return s.CheckInLimiter.Allow("checkin|" + userID)
}

func (s *RewardService) redeemAllowed(userID string) (bool, int) {
	if s.RedeemLimiter == nil {
		return true, 0
	}
	return s.RedeemLimiter.Allow("redeem|" + userID)
}

// lastCheckIn 返回今日之前最近的签到日与连续天数。
func lastCheckIn(tx *port.RewardTx, today string) (string, int) {
	lastDate := ""
	lastStreak := 0
	for date, record := range tx.CheckIns {
		if date >= today {
			continue
		}
		if date > lastDate {
			lastDate = date
			lastStreak = record.Streak
		}
	}
	return lastDate, lastStreak
}

func nextDate(date string) string {
	t, err := domain.ParseBusinessDate(date)
	if err != nil {
		return date
	}
	return t.AddDate(0, 0, 1).Format("2006-01-02")
}

func encodeCursor(entryID string) string {
	return "v1:" + entryID
}

func decodeCursor(cursor string) string {
	if strings.HasPrefix(cursor, "v1:") {
		return strings.TrimPrefix(cursor, "v1:")
	}
	return cursor
}

// SettleResult 是成就积分入账结果。
type SettleResult struct {
	EntryID      string
	Requested    int
	Applied      int
	Capped       bool
	Replayed     bool
	BalanceAfter int
}

// SettleAchievement 按幂等键入账成就积分：重复请求返回首次流水，余额只加一次。
// 成就流水始终写入（amount 可能为 0），供 ACH-07 追溯被截断的分值。
func (s *RewardService) SettleAchievement(
	ctx context.Context, userID, achievementID string, points int, ruleVersion string,
) (SettleResult, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(achievementID) == "" || points < 0 {
		return SettleResult{}, apperr.NewReward(apperr.Point001, nil)
	}
	key := domain.AchievementGrantKey(userID, achievementID)
	now := s.now()
	var out SettleResult
	err := s.Store.Do(ctx, userID, func(tx *port.RewardTx) error {
		if entryID, ok := tx.Idempotency[key]; ok {
			out = SettleResult{EntryID: entryID, Replayed: true, BalanceAfter: tx.Account.Balance}
			for _, e := range tx.Entries {
				if e.EntryID == entryID {
					out.Requested = e.RequestedAmount
					if out.Requested == 0 && e.Amount > 0 {
						out.Requested = e.Amount
					}
					out.Applied = e.Amount
					break
				}
			}
			return nil
		}
		applied, capped := domain.ApplyCap(tx.Account.Balance, points)
		tx.Account.Balance += applied
		tx.Account.UpdatedAt = now
		entryID := domain.NewEntryID()
		tx.Entries = append(tx.Entries, domain.PointsEntry{
			EntryID: entryID, UserID: userID, Type: domain.EntryAchievementEarn,
			Amount: applied, RequestedAmount: points, BalanceAfter: tx.Account.Balance,
			OccurredAt: now, RefID: achievementID, RuleVersion: ruleVersion,
		})
		tx.Idempotency[key] = entryID
		out = SettleResult{
			EntryID: entryID, Requested: points, Applied: applied, Capped: capped,
			BalanceAfter: tx.Account.Balance,
		}
		return nil
	})
	if err != nil {
		return SettleResult{}, normalizeReward(err)
	}
	return out, nil
}

// Balance 返回权威余额，供成就快照与对账使用。
func (s *RewardService) Balance(ctx context.Context, userID string) (int, error) {
	balance := 0
	err := s.Store.View(ctx, userID, func(tx *port.RewardTx) error {
		balance = tx.Account.Balance
		return nil
	})
	if err != nil {
		return 0, normalizeReward(err)
	}
	return balance, nil
}

// AchievementGrantedTotal 返回账本中成就类流水合计（实际入账，不含截断差额）。
func (s *RewardService) AchievementGrantedTotal(ctx context.Context, userID string) (int, error) {
	total := 0
	err := s.Store.View(ctx, userID, func(tx *port.RewardTx) error {
		for _, e := range tx.Entries {
			if e.Type == domain.EntryAchievementEarn {
				total += e.Amount
			}
		}
		return nil
	})
	if err != nil {
		return 0, normalizeReward(err)
	}
	return total, nil
}

func normalizeReward(err error) error {
	if err == nil {
		return nil
	}
	var re *apperr.RewardError
	if errors.As(err, &re) {
		return re
	}
	return apperr.NewReward(apperr.Point005, err)
}