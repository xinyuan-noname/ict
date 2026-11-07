package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/port"
)

type memSportStore struct {
	mu sync.Mutex
	tx map[string]*port.SportTx
}

func newMemSportStore() *memSportStore {
	return &memSportStore{tx: map[string]*port.SportTx{}}
}

func (m *memSportStore) txFor(userID string) *port.SportTx {
	tx, ok := m.tx[userID]
	if !ok {
		tx = &port.SportTx{
			Records: map[string]domain.SportRecord{}, Evidence: map[string]domain.AchievementEvidence{},
			Tombstones: map[string]domain.SportTombstone{},
		}
		m.tx[userID] = tx
	}
	return tx
}

func (m *memSportStore) Do(_ context.Context, userID string, fn func(*port.SportTx) error) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return fn(m.txFor(userID))
}

func (m *memSportStore) View(_ context.Context, userID string, fn func(*port.SportTx) error) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return fn(m.txFor(userID))
}

type memRewardStore struct {
	mu   sync.Mutex
	tx   map[string]*port.RewardTx
	fail bool
}

func newMemRewardStore() *memRewardStore {
	return &memRewardStore{tx: map[string]*port.RewardTx{}}
}

func (m *memRewardStore) txFor(userID string) *port.RewardTx {
	tx, ok := m.tx[userID]
	if !ok {
		tx = &port.RewardTx{
			Account: domain.PointsAccount{UserID: userID}, CheckIns: map[string]domain.CheckInRecord{},
			Owned: map[string]domain.OwnedFrame{}, Orders: map[string]domain.RedeemOrder{},
			Idempotency: map[string]string{},
		}
		m.tx[userID] = tx
	}
	return tx
}

func (m *memRewardStore) Do(_ context.Context, userID string, fn func(*port.RewardTx) error) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.fail {
		return errors.New("reward store unavailable")
	}
	return fn(m.txFor(userID))
}

func (m *memRewardStore) View(_ context.Context, userID string, fn func(*port.RewardTx) error) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return fn(m.txFor(userID))
}

func fullProfile() domain.HealthProfile {
	return domain.HealthProfile{HeightCM: 175, WeightG: 70000, Gender: domain.GenderMale, Age: 30}
}

func newSportTest(t *testing.T) (*SportService, *memSportStore, *memRewardStore) {
	t.Helper()
	sportStore := newMemSportStore()
	rewardStore := newMemRewardStore()
	rewards := &RewardService{Store: rewardStore, Clock: &fakeClock{t: time.Date(2026, 11, 7, 8, 0, 0, 0, time.UTC)}}
	svc := &SportService{
		Store: sportStore, Rewards: rewards, Clock: &fakeClock{t: time.Date(2026, 11, 7, 8, 0, 0, 0, time.UTC)},
		Profile: func(context.Context, string) (domain.HealthProfile, error) { return fullProfile(), nil },
	}
	return svc, sportStore, rewardStore
}

func walkRecord() AddRecordInput {
	return AddRecordInput{
		RecordID: "rec_walk_1", Type: "walking", Day: "2026-11-07",
		DistanceM: 8000, DurationS: 3600, Steps: 15000, Continuous: true,
	}
}

// ACH-01：首次达标即结算，余额与流水同步增长。
func TestSportAddRecordGrantsOnce(t *testing.T) {
	svc, _, _ := newSportTest(t)
	view, err := svc.AddRecord(context.Background(), "u1", walkRecord())
	if err != nil {
		t.Fatalf("AddRecord: %v", err)
	}
	if view.EarnedPoints != 25 {
		t.Fatalf("earned=%d, want 25", view.EarnedPoints)
	}
	if view.PointsBalance != 25 {
		t.Fatalf("balance=%d, want 25", view.PointsBalance)
	}
	if len(view.Unlocked) != 2 {
		t.Fatalf("unlocked=%d, want 2", len(view.Unlocked))
	}
	for _, a := range view.Unlocked {
		if a.Status != "granted" {
			t.Fatalf("%s status=%s, want granted", a.AchievementID, a.Status)
		}
	}
}

// ACH-02：同一记录重复提交只入账一次。
func TestSportAddRecordReplayDoesNotGrantAgain(t *testing.T) {
	svc, _, _ := newSportTest(t)
	if _, err := svc.AddRecord(context.Background(), "u1", walkRecord()); err != nil {
		t.Fatalf("first: %v", err)
	}
	view, err := svc.AddRecord(context.Background(), "u1", walkRecord())
	if err != nil {
		t.Fatalf("replay: %v", err)
	}
	if !view.Replayed {
		t.Fatal("expected replay flag")
	}
	if view.EarnedPoints != 0 || view.PointsBalance != 25 {
		t.Fatalf("earned=%d balance=%d, want 0/25", view.EarnedPoints, view.PointsBalance)
	}
}

// ACH-06：删除记录后状态回退，但已发放积分不追回。
func TestSportDeleteRevokesWithoutRefund(t *testing.T) {
	svc, _, _ := newSportTest(t)
	if _, err := svc.AddRecord(context.Background(), "u1", walkRecord()); err != nil {
		t.Fatalf("add: %v", err)
	}
	view, err := svc.DeleteRecord(context.Background(), "u1", "rec_walk_1")
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	if !view.Deleted {
		t.Fatal("expected deleted")
	}
	if view.PointsBalance != 25 {
		t.Fatalf("balance=%d, want 25 (no refund)", view.PointsBalance)
	}
	for _, a := range view.Achievements {
		if a.AchievementID == "walk_10k" && a.Status != "locked" {
			t.Fatalf("walk_10k status=%s, want locked", a.Status)
		}
	}
}

// ACH-03：结算失败进入待补发；存储恢复后快照修复为已发放。
func TestSportGrantFailureQueuesAndRepairs(t *testing.T) {
	svc, _, rewardStore := newSportTest(t)
	rewardStore.fail = true

	view, err := svc.AddRecord(context.Background(), "u1", walkRecord())
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	if len(view.Unlocked) != 0 {
		t.Fatalf("unlocked=%d, want 0 while store down", len(view.Unlocked))
	}
	if svc.Stats()["sport_grant_failure_total"] == 0 {
		t.Fatal("expected failure metric")
	}

	rewardStore.fail = false
	snapshot, err := svc.Achievements(context.Background(), "u1")
	if err != nil {
		t.Fatalf("achievements: %v", err)
	}
	if snapshot.PointsBalance != 25 {
		t.Fatalf("balance=%d, want 25 after repair", snapshot.PointsBalance)
	}
	for _, a := range snapshot.Achievements {
		if a.AchievementID == "walk_10k" && a.Status != "granted" {
			t.Fatalf("walk_10k status=%s, want granted", a.Status)
		}
	}
}