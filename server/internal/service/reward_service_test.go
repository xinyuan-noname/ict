package service

import (
	"context"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"ict/server/internal/adapter/store/filestore"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
)

type rewardClock struct{ t time.Time }

func (c *rewardClock) Now() time.Time { return c.t }
func (c *rewardClock) set(t time.Time) { c.t = t }

func newRewardService(t *testing.T) (*RewardService, *rewardClock) {
	t.Helper()
	store, err := filestore.OpenRewards(filepath.Join(t.TempDir(), "rewards.json"), filestore.Options{
		Namespace: "real", Mode: "real",
	})
	if err != nil {
		t.Fatal(err)
	}
	clock := &rewardClock{t: time.Date(2026, 11, 2, 1, 0, 0, 0, time.UTC)}
	return &RewardService{
		Store: store, Clock: clock, Logger: logx.New(discardWriter{}, "error"),
	}, clock
}

type discardWriter struct{}

func (discardWriter) Write(p []byte) (int, error) { return len(p), nil }

func TestCheckInFirstAndRepeat(t *testing.T) {
	svc, _ := newRewardService(t)
	ctx := context.Background()

	first, err := svc.CheckIn(ctx, "u1")
	if err != nil {
		t.Fatal(err)
	}
	if first.AlreadyCheckedIn || first.EarnedPoints != 10 || first.BalanceAfter != 10 || first.StreakDays != 1 {
		t.Fatalf("unexpected first check-in: %+v", first)
	}

	second, err := svc.CheckIn(ctx, "u1")
	if err != nil {
		t.Fatal(err)
	}
	if !second.AlreadyCheckedIn || second.EarnedPoints != 0 || second.BalanceAfter != 10 {
		t.Fatalf("repeat must be idempotent: %+v", second)
	}
}

func TestCheckInStreakAcrossDays(t *testing.T) {
	svc, clock := newRewardService(t)
	ctx := context.Background()
	want := []int{10, 12, 14}
	for i, expected := range want {
		view, err := svc.CheckIn(ctx, "u1")
		if err != nil {
			t.Fatal(err)
		}
		if view.EarnedPoints != expected || view.StreakDays != i+1 {
			t.Fatalf("day %d: got %+v", i+1, view)
		}
		clock.set(clock.t.AddDate(0, 0, 1))
	}

	// 漏签一天后重置
	clock.set(clock.t.AddDate(0, 0, 1))
	view, err := svc.CheckIn(ctx, "u1")
	if err != nil {
		t.Fatal(err)
	}
	if view.StreakDays != 1 || view.EarnedPoints != 10 {
		t.Fatalf("streak must reset after gap: %+v", view)
	}
}

func TestStatusDoesNotWrite(t *testing.T) {
	svc, _ := newRewardService(t)
	ctx := context.Background()
	view, err := svc.Status(ctx, "u1")
	if err != nil {
		t.Fatal(err)
	}
	if view.CheckedIn || !view.CanCheckIn || view.TodayReward != 10 || view.PointsBalance != 0 {
		t.Fatalf("unexpected status: %+v", view)
	}
	again, _ := svc.Status(ctx, "u1")
	if again.LastCheckInDate != "" {
		t.Fatal("status must not create check-in records")
	}
}

func TestRedeemFlow(t *testing.T) {
	svc, clock := newRewardService(t)
	ctx := context.Background()
	for i := 0; i < 30; i++ {
		if _, err := svc.CheckIn(ctx, "u1"); err != nil {
			t.Fatal(err)
		}
		clock.set(clock.t.AddDate(0, 0, 1))
	}

	// 余额 30*... 先充值到足够：连续签到 30 天累计 300+；直接兑换 100 的框
	view, err := svc.Redeem(ctx, "u1", "frame_pixel_sakura", "idem-key-0001", "catalog-v1")
	if err != nil {
		t.Fatal(err)
	}
	if view.Price != 100 || view.BalanceAfter <= 0 || view.Replayed {
		t.Fatalf("unexpected redeem: %+v", view)
	}

	replay, err := svc.Redeem(ctx, "u1", "frame_pixel_sakura", "idem-key-0001", "catalog-v1")
	if err != nil {
		t.Fatal(err)
	}
	if !replay.Replayed || replay.OrderID != view.OrderID {
		t.Fatalf("replay must return same order: %+v", replay)
	}

	// 新幂等键兑换已拥有
	if _, err := svc.Redeem(ctx, "u1", "frame_pixel_sakura", "idem-key-0002", "catalog-v1"); apperr.NormalizeReward(err) != apperr.Reward003 {
		t.Fatalf("want REWARD_003, got %v", err)
	}
}

func TestRedeemInsufficientAndInvalidKey(t *testing.T) {
	svc, _ := newRewardService(t)
	ctx := context.Background()
	_, err := svc.Redeem(ctx, "u1", "frame_pixel_cat", "idem-key-0001", "catalog-v1")
	if apperr.NormalizeReward(err) != apperr.Point002 {
		t.Fatalf("want POINT_002, got %v", err)
	}
	_, err = svc.Redeem(ctx, "u1", "frame_pixel_cat", "bad key!", "catalog-v1")
	if apperr.NormalizeReward(err) != apperr.Reward008 {
		t.Fatalf("want REWARD_008, got %v", err)
	}
	_, err = svc.Redeem(ctx, "u1", "frame_unknown", "idem-key-0003", "catalog-v1")
	if apperr.NormalizeReward(err) != apperr.Reward001 {
		t.Fatalf("want REWARD_001, got %v", err)
	}
}

func TestRedeemCatalogVersionMismatch(t *testing.T) {
	svc, _ := newRewardService(t)
	_, err := svc.Redeem(context.Background(), "u1", "frame_pixel_sakura", "idem-key-0001", "catalog-v0")
	if apperr.NormalizeReward(err) != apperr.Reward007 {
		t.Fatalf("want REWARD_007, got %v", err)
	}
}

func TestEquipRules(t *testing.T) {
	svc, clock := newRewardService(t)
	ctx := context.Background()
	for i := 0; i < 12; i++ {
		if _, err := svc.CheckIn(ctx, "u1"); err != nil {
			t.Fatal(err)
		}
		clock.set(clock.t.AddDate(0, 0, 1))
	}
	if _, err := svc.Redeem(ctx, "u1", "frame_pixel_cyan", "idem-key-0001", "catalog-v1"); err != nil {
		t.Fatal(err)
	}

	if _, err := svc.Equip(ctx, "u1", strPtr("frame_pixel_cat")); apperr.NormalizeReward(err) != apperr.Reward004 {
		t.Fatalf("want REWARD_004, got %v", err)
	}
	view, err := svc.Equip(ctx, "u1", strPtr("frame_pixel_cyan"))
	if err != nil || !view.Changed || view.EquippedFrame == nil {
		t.Fatalf("equip failed: %v %+v", err, view)
	}
	same, err := svc.Equip(ctx, "u1", strPtr("frame_pixel_cyan"))
	if err != nil || same.Changed {
		t.Fatalf("same equip must be idempotent: %v %+v", err, same)
	}
	off, err := svc.Equip(ctx, "u1", nil)
	if err != nil || !off.Changed || off.EquippedFrame != nil {
		t.Fatalf("unequip failed: %v %+v", err, off)
	}
}

func TestLedgerOrderAndPaging(t *testing.T) {
	svc, clock := newRewardService(t)
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		if _, err := svc.CheckIn(ctx, "u1"); err != nil {
			t.Fatal(err)
		}
		clock.set(clock.t.AddDate(0, 0, 1))
	}
	page, err := svc.Ledger(ctx, "u1", "", 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || !page.HasMore || page.NextCursor == "" {
		t.Fatalf("unexpected first page: %+v", page)
	}
	next, err := svc.Ledger(ctx, "u1", page.NextCursor, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(next.Items) != 2 || next.Items[0].EntryID == page.Items[1].EntryID {
		t.Fatalf("paging overlap: %+v", next)
	}
	if next.Items[0].Amount != 14 {
		t.Fatalf("must be descending: got %d", next.Items[0].Amount)
	}
}

func TestConcurrentCheckInSingleEarn(t *testing.T) {
	svc, _ := newRewardService(t)
	ctx := context.Background()
	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = svc.CheckIn(ctx, "u1")
		}()
	}
	wg.Wait()
	ledger, err := svc.Ledger(ctx, "u1", "", 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(ledger.Items) != 1 {
		t.Fatalf("concurrent check-in must earn once, got %d entries", len(ledger.Items))
	}
	status, _ := svc.Status(ctx, "u1")
	if status.PointsBalance != 10 {
		t.Fatalf("balance must be 10, got %d", status.PointsBalance)
	}
}

func TestUserIsolation(t *testing.T) {
	svc, _ := newRewardService(t)
	ctx := context.Background()
	if _, err := svc.CheckIn(ctx, "u1"); err != nil {
		t.Fatal(err)
	}
	other, _ := svc.Status(ctx, "u2")
	if other.PointsBalance != 0 || other.CheckedIn {
		t.Fatalf("user isolation broken: %+v", other)
	}
}

func strPtr(s string) *string { return &s }

var _ = strings.TrimSpace