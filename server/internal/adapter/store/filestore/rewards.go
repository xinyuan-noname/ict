package filestore

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"

	"ict/server/internal/domain"
	"ict/server/internal/port"
)

// RewardStore 使用独立子空间文件，不改写认证存储布局（design 2.2）。
type RewardStore struct {
	mu   sync.Mutex
	path string
	data rewardData
}

type rewardData struct {
	Namespace string                          `json:"namespace"`
	Mode      string                          `json:"mode"`
	Subspace  string                          `json:"subspace"`
	Accounts  map[string]domain.PointsAccount `json:"accounts"`
	CheckIns  map[string]map[string]domain.CheckInRecord `json:"checkIns"`
	Entries   map[string][]domain.PointsEntry `json:"entries"`
	Owned     map[string]map[string]domain.OwnedFrame    `json:"owned"`
	Orders    map[string]domain.RedeemOrder   `json:"orders"`
	Equipped  map[string]string               `json:"equipped"`
	HighWater map[string]string               `json:"highWater"`
	// Idempotency: 幂等键 → 首次流水 entryId（成就入账）。
	Idempotency map[string]string `json:"idempotency"`
}

func newRewardData() rewardData {
	return rewardData{
		Accounts:  map[string]domain.PointsAccount{},
		CheckIns:  map[string]map[string]domain.CheckInRecord{},
		Entries:   map[string][]domain.PointsEntry{},
		Owned:     map[string]map[string]domain.OwnedFrame{},
		Orders:    map[string]domain.RedeemOrder{},
		Equipped:  map[string]string{},
		HighWater: map[string]string{},
		Idempotency: map[string]string{},
	}
}

// OpenRewards 打开子空间文件并校验 namespace/mode/subspace 文件头。
func OpenRewards(path string, opts Options) (*RewardStore, error) {
	s := &RewardStore{path: path, data: newRewardData()}
	raw, err := os.ReadFile(path)
	if err == nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, &s.data); err != nil {
			return nil, err
		}
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if s.data.Accounts == nil {
		s.data = newRewardData()
	}
	if s.data.Idempotency == nil {
		s.data.Idempotency = map[string]string{}
	}
	switch {
	case s.data.Namespace == "" && s.data.Mode == "":
		s.data.Namespace = opts.Namespace
		s.data.Mode = opts.Mode
		s.data.Subspace = "rewards"
		if err := s.flush(); err != nil {
			return nil, err
		}
	case s.data.Namespace != opts.Namespace || s.data.Mode != opts.Mode || s.data.Subspace != "rewards":
		return nil, ErrNamespaceMismatch
	}
	return s, nil
}

func (s *RewardStore) flush() error {
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

// Do 在锁内执行事务：失败时用快照回滚。
func (s *RewardStore) Do(ctx context.Context, userID string, fn func(*port.RewardTx) error) error {
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

func (s *RewardStore) View(ctx context.Context, userID string, fn func(*port.RewardTx) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return fn(s.txFor(userID))
}

func (s *RewardStore) snapshot() (rewardData, error) {
	raw, err := json.Marshal(&s.data)
	if err != nil {
		return rewardData{}, err
	}
	var out rewardData
	if err := json.Unmarshal(raw, &out); err != nil {
		return rewardData{}, err
	}
	return out, nil
}

// txFor 构造用户视图（浅拷贝切片头，事务内替换时通过 commit 写回）。
func (s *RewardStore) txFor(userID string) *port.RewardTx {
	account, ok := s.data.Accounts[userID]
	if !ok {
		account = domain.PointsAccount{UserID: userID}
	}
	checkIns, ok := s.data.CheckIns[userID]
	if !ok {
		checkIns = map[string]domain.CheckInRecord{}
	}
	owned, ok := s.data.Owned[userID]
	if !ok {
		owned = map[string]domain.OwnedFrame{}
	}
	orders := map[string]domain.RedeemOrder{}
	for key, order := range s.data.Orders {
		if order.UserID == userID {
			orders[key] = order
		}
	}
	idem := map[string]string{}
	prefix := "sport:" + userID + ":"
	for key, entryID := range s.data.Idempotency {
		if strings.HasPrefix(key, prefix) {
			idem[key] = entryID
		}
	}
	return &port.RewardTx{
		Account:     account,
		CheckIns:    checkIns,
		Entries:     append([]domain.PointsEntry(nil), s.data.Entries[userID]...),
		Owned:       owned,
		Orders:      orders,
		Equipped:    s.data.Equipped[userID],
		Idempotency: idem,
		HighWater:   s.data.HighWater[userID],
	}
}

func (s *RewardStore) commit(userID string, tx *port.RewardTx) {
	s.data.Accounts[userID] = tx.Account
	s.data.CheckIns[userID] = tx.CheckIns
	s.data.Entries[userID] = tx.Entries
	s.data.Owned[userID] = tx.Owned
	s.data.Equipped[userID] = tx.Equipped
	s.data.HighWater[userID] = tx.HighWater
	for key, entryID := range tx.Idempotency {
		s.data.Idempotency[key] = entryID
	}
	for key, order := range tx.Orders {
		s.data.Orders[key] = order
	}
}

var _ port.RewardStore = (*RewardStore)(nil)