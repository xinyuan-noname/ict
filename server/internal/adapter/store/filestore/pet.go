package filestore

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"sync"

	"ict/server/internal/domain"
	"ict/server/internal/port"
)

// PetStore 使用独立子空间文件，与认证/奖励/清单隔离。
type PetStore struct {
	mu   sync.Mutex
	path string
	data petData
}

type petData struct {
	Namespace string                              `json:"namespace"`
	Mode      string                              `json:"mode"`
	Subspace  string                              `json:"subspace"`
	Pets      map[string]domain.Pet               `json:"pets"`
	Inventory map[string]map[string]int           `json:"inventory"`
	Friends   map[string][]domain.FriendEdge      `json:"friends"`
	Invites   map[string]domain.InviteCode        `json:"invites"`
	PkMatches map[string][]domain.PkMatch         `json:"pkMatches"`
	ItemIdem  map[string]map[string]string        `json:"itemIdem"`
	PkDaily   map[string]map[string]int           `json:"pkDaily"`
	PkPairDay map[string]map[string]bool          `json:"pkPairDay"`
}

func newPetData() petData {
	return petData{
		Pets: map[string]domain.Pet{}, Inventory: map[string]map[string]int{},
		Friends: map[string][]domain.FriendEdge{}, Invites: map[string]domain.InviteCode{},
		PkMatches: map[string][]domain.PkMatch{}, ItemIdem: map[string]map[string]string{},
		PkDaily: map[string]map[string]int{}, PkPairDay: map[string]map[string]bool{},
	}
}

func OpenPet(path string, opts Options) (*PetStore, error) {
	s := &PetStore{path: path, data: newPetData()}
	raw, err := os.ReadFile(path)
	if err == nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, &s.data); err != nil {
			return nil, err
		}
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if s.data.Pets == nil {
		s.data = newPetData()
	}
	switch {
	case s.data.Namespace == "" && s.data.Mode == "":
		s.data.Namespace = opts.Namespace
		s.data.Mode = opts.Mode
		s.data.Subspace = "pet"
		if err := s.flush(); err != nil {
			return nil, err
		}
	case s.data.Namespace != opts.Namespace || s.data.Mode != opts.Mode || s.data.Subspace != "pet":
		return nil, ErrNamespaceMismatch
	}
	return s, nil
}

func (s *PetStore) flush() error {
	raw, err := json.MarshalIndent(&s.data, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func (s *PetStore) Do(ctx context.Context, userID string, fn func(*port.PetTx) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	backup, err := s.snapshot()
	if err != nil {
		return err
	}
	tx := s.txFor(userID)
	if err := fn(tx); err != nil {
		s.data = backup
		return err
	}
	s.commit(userID, tx)
	return s.flush()
}

func (s *PetStore) View(ctx context.Context, userID string, fn func(*port.PetTx) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return fn(s.txFor(userID))
}

func (s *PetStore) snapshot() (petData, error) {
	raw, err := json.Marshal(&s.data)
	if err != nil {
		return petData{}, err
	}
	var out petData
	if err := json.Unmarshal(raw, &out); err != nil {
		return petData{}, err
	}
	return out, nil
}

func (s *PetStore) txFor(userID string) *port.PetTx {
	var pet *domain.Pet
	if p, ok := s.data.Pets[userID]; ok {
		copy := p
		pet = &copy
	}
	inv, ok := s.data.Inventory[userID]
	if !ok {
		inv = map[string]int{}
	}
	idem, ok := s.data.ItemIdem[userID]
	if !ok {
		idem = map[string]string{}
	}
	daily, ok := s.data.PkDaily[userID]
	if !ok {
		daily = map[string]int{}
	}
	pair, ok := s.data.PkPairDay[userID]
	if !ok {
		pair = map[string]bool{}
	}
	return &port.PetTx{
		Pet:       pet,
		Inventory: inv,
		Friends:   append([]domain.FriendEdge(nil), s.data.Friends[userID]...),
		Invites: func() map[string]domain.InviteCode {
			out := map[string]domain.InviteCode{}
			for k, v := range s.data.Invites {
				if v.UserID == userID {
					out[k] = v
				}
			}
			return out
		}(),
		PkMatches: append([]domain.PkMatch(nil), s.data.PkMatches[userID]...),
		ItemIdem:  idem,
		PkDaily:   daily,
		PkPairDay: pair,
	}
}

func (s *PetStore) commit(userID string, tx *port.PetTx) {
	if tx.Pet != nil {
		s.data.Pets[userID] = *tx.Pet
	}
	s.data.Inventory[userID] = tx.Inventory
	s.data.Friends[userID] = tx.Friends
	s.data.PkMatches[userID] = tx.PkMatches
	s.data.ItemIdem[userID] = tx.ItemIdem
	s.data.PkDaily[userID] = tx.PkDaily
	s.data.PkPairDay[userID] = tx.PkPairDay
	for code, invite := range tx.Invites {
		invite.UserID = userID
		s.data.Invites[code] = invite
	}
}

// FindInvite / MarkInviteUsed 供好友接受流程使用（跨用户读码）。
func (s *PetStore) FindInvite(code string) (domain.InviteCode, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	inv, ok := s.data.Invites[code]
	return inv, ok
}

func (s *PetStore) MarkInviteUsed(code string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	inv, ok := s.data.Invites[code]
	if !ok {
		return errors.New("invite missing")
	}
	inv.Used = true
	s.data.Invites[code] = inv
	return s.flush()
}

var _ port.PetStore = (*PetStore)(nil)