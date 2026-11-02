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

// CheckStore 使用独立子空间文件，与认证/奖励存储隔离。
type CheckStore struct {
	mu   sync.Mutex
	path string
	data checkData
}

type checkData struct {
	Namespace string                          `json:"namespace"`
	Mode      string                          `json:"mode"`
	Subspace  string                          `json:"subspace"`
	Profiles  map[string]domain.HealthProfile `json:"profiles"`
	Goals     map[string]map[string]int       `json:"goals"`
	Records   map[string][]domain.WaterRecord `json:"records"`
	Idem      map[string]map[string]string    `json:"idem"`
}

func newCheckData() checkData {
	return checkData{
		Profiles: map[string]domain.HealthProfile{},
		Goals:    map[string]map[string]int{},
		Records:  map[string][]domain.WaterRecord{},
		Idem:     map[string]map[string]string{},
	}
}

func OpenCheck(path string, opts Options) (*CheckStore, error) {
	s := &CheckStore{path: path, data: newCheckData()}
	raw, err := os.ReadFile(path)
	if err == nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, &s.data); err != nil {
			return nil, err
		}
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if s.data.Profiles == nil {
		s.data = newCheckData()
	}
	switch {
	case s.data.Namespace == "" && s.data.Mode == "":
		s.data.Namespace = opts.Namespace
		s.data.Mode = opts.Mode
		s.data.Subspace = "check"
		if err := s.flush(); err != nil {
			return nil, err
		}
	case s.data.Namespace != opts.Namespace || s.data.Mode != opts.Mode || s.data.Subspace != "check":
		return nil, ErrNamespaceMismatch
	}
	return s, nil
}

func (s *CheckStore) flush() error {
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

func (s *CheckStore) Do(ctx context.Context, userID string, fn func(*port.CheckTx) error) error {
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

func (s *CheckStore) View(ctx context.Context, userID string, fn func(*port.CheckTx) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return fn(s.txFor(userID))
}

func (s *CheckStore) snapshot() (checkData, error) {
	raw, err := json.Marshal(&s.data)
	if err != nil {
		return checkData{}, err
	}
	var out checkData
	if err := json.Unmarshal(raw, &out); err != nil {
		return checkData{}, err
	}
	return out, nil
}

func (s *CheckStore) txFor(userID string) *port.CheckTx {
	var profile *domain.HealthProfile
	if p, ok := s.data.Profiles[userID]; ok {
		copy := p
		profile = &copy
	}
	goals, ok := s.data.Goals[userID]
	if !ok {
		goals = map[string]int{}
	}
	idem, ok := s.data.Idem[userID]
	if !ok {
		idem = map[string]string{}
	}
	return &port.CheckTx{
		Profile: profile,
		Goals:   goals,
		Records: append([]domain.WaterRecord(nil), s.data.Records[userID]...),
		Idem:    idem,
	}
}

func (s *CheckStore) commit(userID string, tx *port.CheckTx) {
	if tx.Profile != nil {
		s.data.Profiles[userID] = *tx.Profile
	} else {
		delete(s.data.Profiles, userID)
	}
	s.data.Goals[userID] = tx.Goals
	s.data.Records[userID] = tx.Records
	s.data.Idem[userID] = tx.Idem
}

var _ port.CheckStore = (*CheckStore)(nil)