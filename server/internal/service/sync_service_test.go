package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
)

func newSyncTest(t *testing.T) (*SyncService, *SportService) {
	t.Helper()
	sport, sportStore, rewardStore := newSportTest(t)
	rewards := &RewardService{Store: rewardStore, Clock: &fakeClock{t: time.Date(2026, 11, 7, 8, 0, 0, 0, time.UTC)}}
	sync := &SyncService{
		Sport: sport, Store: sportStore, Rewards: rewards,
		Clock: &fakeClock{t: time.Date(2026, 11, 7, 8, 0, 0, 0, time.UTC)},
	}
	return sync, sport
}

func upsertChange(recordID string) SyncChange {
	input := walkRecord()
	input.RecordID = recordID
	return SyncChange{ChangeID: "c_" + recordID, Entity: domain.TombstoneEntitySportRecord, Op: "upsert", Record: &input}
}

// SYNC-03/08：批次逐条应用并推进游标。
func TestSyncPushAppliesAndAdvancesCursor(t *testing.T) {
	sync, _ := newSyncTest(t)
	view, err := sync.Push(context.Background(), "u1", "batch_1", "v1:0", []SyncChange{upsertChange("rec_1")})
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	if len(view.Results) != 1 || view.Results[0].Status != "applied" {
		t.Fatalf("results=%+v, want applied", view.Results)
	}
	if view.Cursor == "v1:0" {
		t.Fatalf("cursor not advanced: %s", view.Cursor)
	}
}

// SYNC-03：同记录重复上传返回 duplicate，不重复入账。
func TestSyncPushDuplicateIsIdempotent(t *testing.T) {
	sync, _ := newSyncTest(t)
	if _, err := sync.Push(context.Background(), "u1", "b1", "v1:0", []SyncChange{upsertChange("rec_1")}); err != nil {
		t.Fatalf("first: %v", err)
	}
	view, err := sync.Push(context.Background(), "u1", "b2", "v1:0", []SyncChange{upsertChange("rec_1")})
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if view.Results[0].Status != "duplicate" {
		t.Fatalf("status=%s, want duplicate", view.Results[0].Status)
	}
	balance, _ := sync.Rewards.Balance(context.Background(), "u1")
	if balance != 25 {
		t.Fatalf("balance=%d, want 25", balance)
	}
}

// SYNC-08：非运动实体一律拒绝（防伪造成就上行）。
func TestSyncPushRejectsUnknownEntity(t *testing.T) {
	sync, _ := newSyncTest(t)
	view, err := sync.Push(context.Background(), "u1", "b1", "v1:0", []SyncChange{
		{ChangeID: "c1", Entity: "achievement", Op: "upsert"},
	})
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	if view.Results[0].Status != "rejected" || view.Results[0].Code != string(apperr.Sport001) {
		t.Fatalf("result=%+v, want rejected SPORT_001", view.Results[0])
	}
}

// SYNC-12：单用户 5 次/分钟限流，第 6 次返回 SPORT_006。
func TestSyncPushRateLimit(t *testing.T) {
	sync, _ := newSyncTest(t)
	change := SyncChange{ChangeID: "c1", Entity: domain.TombstoneEntitySportRecord, Op: "delete", RecordID: "missing"}
	for i := 0; i < 5; i++ {
		if _, err := sync.Push(context.Background(), "u1", "b", "v1:0", []SyncChange{change}); err != nil {
			t.Fatalf("push %d: %v", i, err)
		}
	}
	_, err := sync.Push(context.Background(), "u1", "b", "v1:0", []SyncChange{change})
	var se *apperr.SportError
	if !errors.As(err, &se) || se.Code != apperr.Sport006 {
		t.Fatalf("err=%v, want SPORT_006", err)
	}
}

// SYNC-02：首次全量、后续按游标增量。
func TestSyncSnapshotIncremental(t *testing.T) {
	sync, _ := newSyncTest(t)
	if _, err := sync.Sport.AddRecord(context.Background(), "u1", walkRecord()); err != nil {
		t.Fatalf("add: %v", err)
	}
	first, err := sync.Snapshot(context.Background(), "u1", "", 200)
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	if len(first.Records) != 1 {
		t.Fatalf("records=%d, want 1", len(first.Records))
	}

	second, err := sync.Snapshot(context.Background(), "u1", first.Cursor, 200)
	if err != nil {
		t.Fatalf("incremental: %v", err)
	}
	if len(second.Records) != 0 {
		t.Fatalf("incremental records=%d, want 0", len(second.Records))
	}
}