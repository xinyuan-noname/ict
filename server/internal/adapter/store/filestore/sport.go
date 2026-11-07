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

// SportStore 使用独立子空间文件，与认证/奖励域隔离（design 1.4.4）。
type SportStore struct {
	mu   sync.Mutex
	path string
	data sportData
}

type sportData struct {
	Namespace  string                                                 `json:"namespace"`
	Mode       string                                                 `json:"mode"`
	Subspace   string                                                 `json:"subspace"`
	Records    map[string]map[string]domain.SportRecord               `json:"records"`
	Evidence   map[string]map[string]domain.AchievementEvidence       `json:"evidence"`
	Tombstones map[string]map[string]domain.SportTombstone            `json:"tombstones"`
	Seq        map[string]int64                                       `json:"seq"`
}

func newSportData() sportData {
	return sportData{
		Records:    map[string]map[string]domain.SportRecord{},
		Evidence:   map[string]map[string]domain.AchievementEvidence{},
		Tombstones: map[string]map[string]domain.SportTombstone{},
		Seq:        map[string]int64{},
	}
}

// OpenSport 打开子空间文件并校验 namespace/mode/subspace 文件头。
func OpenSport(path string, opts Options) (*SportStore, error) {
	s := &SportStore{path: path, data: newSportData()}
	raw, err := os.ReadFile(path)
	if err == nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, &s.data); err != nil {
			return nil, err
		}
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if s.data.Records == nil {
		s.data = newSportData()
	}
	switch {
	case s.data.Namespace == "" && s.data.Mode == "":
		s.data.Namespace = opts.Namespace
		s.data.Mode = opts.Mode
		s.data.Subspace = "sport"
		if err := s.flush(); err != nil {
			return nil, err
		}
	case s.data.Namespace != opts.Namespace || s.data.Mode != opts.Mode || s.data.Subspace != "sport":
		return nil, ErrNamespaceMismatch
	}
	return s, nil
}

func (s *SportStore) flush() error {
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

// Do 在锁内执行事务：失败时用快照回滚，保证记录与证据同生共死。
func (s *SportStore) Do(ctx context.Context, userID string, fn func(*port.SportTx) error) error {
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

func (s *SportStore) View(ctx context.Context, userID string, fn func(*port.SportTx) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return fn(s.txFor(userID))
}

func (s *SportStore) snapshot() (sportData, error) {
	raw, err := json.Marshal(&s.data)
	if err != nil {
		return sportData{}, err
	}
	var out sportData
	if err := json.Unmarshal(raw, &out); err != nil {
		return sportData{}, err
	}
	return out, nil
}

func (s *SportStore) txFor(userID string) *port.SportTx {
	records := s.data.Records[userID]
	if records == nil {
		records = map[string]domain.SportRecord{}
	}
	evidence := s.data.Evidence[userID]
	if evidence == nil {
		evidence = map[string]domain.AchievementEvidence{}
	}
	tombs := s.data.Tombstones[userID]
	if tombs == nil {
		tombs = map[string]domain.SportTombstone{}
	}
	return &port.SportTx{
		Records:    records,
		Evidence:   evidence,
		Tombstones: tombs,
		Seq:        s.data.Seq[userID],
	}
}

func (s *SportStore) commit(userID string, tx *port.SportTx) {
	s.data.Records[userID] = tx.Records
	s.data.Evidence[userID] = tx.Evidence
	s.data.Tombstones[userID] = tx.Tombstones
	s.data.Seq[userID] = tx.Seq
}

var _ port.SportStore = (*SportStore)(nil)