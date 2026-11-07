package service

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/port"
)

const (
	SyncScopeVersion      = "sync-v1"
	SyncBatchMax          = 100
	SyncSnapshotLimitMax  = 200
	syncRateLimitPerMin   = 5
)

// SyncService 负责游标分配、快照组装、批次编排与对账。
// 不新增鉴权，不写 rewards/check 文件（复用既有 Store 接口）。
type SyncService struct {
	Sport   *SportService
	Store   port.SportStore
	Rewards *RewardService
	Clock   port.Clock
	Logger  *logx.Logger

	mu   sync.Mutex
	hits map[string][]time.Time
}

type SyncCursorView struct {
	Cursor        string
	ServerTime    string
	ScopeVersion  string
}

type SyncSnapshotView struct {
	Cursor       string
	HasMore      bool
	Records      []domain.SportRecord
	Tombstones   []domain.SportTombstone
	Achievements []AchievementView
	PointsBalance int
	Entries      []LedgerItem
}

type SyncChange struct {
	ChangeID  string
	Entity    string
	Op        string
	Record    *AddRecordInput
	RecordID  string
	DeletedAt string
}

type SyncChangeResult struct {
	ChangeID string
	Status   string
	Code     string
	RecordID string
}

type SyncPushView struct {
	Results   []SyncChangeResult
	Retryable []string
	Cursor    string
	HasMore   bool
}

type ReconcileLocal struct {
	SportRecordCount   int
	SportRecordIDs     []string
	CachedBalance      *int
	CachedUnlockedCount int
}

type ReconcileDiff struct {
	Kind        string
	BusinessKey string
	Local       any
	Server      any
	Action      string
}

type ReconcileView struct {
	Consistent bool
	Diffs      []ReconcileDiff
	Cursor     string
}

func (s *SyncService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now()
	}
	return time.Now().UTC()
}

func formatCursor(seq int64) string { return "v1:" + strconv.FormatInt(seq, 10) }

func parseCursor(raw string) (int64, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, nil
	}
	if !strings.HasPrefix(raw, "v1:") {
		return 0, apperr.NewSport(apperr.Sport001, nil)
	}
	seq, err := strconv.ParseInt(strings.TrimPrefix(raw, "v1:"), 10, 64)
	if err != nil || seq < 0 {
		return 0, apperr.NewSport(apperr.Sport001, nil)
	}
	return seq, nil
}

func (s *SyncService) Cursor(ctx context.Context, userID string) (SyncCursorView, error) {
	var seq int64
	err := s.Store.View(ctx, userID, func(tx *port.SportTx) error {
		seq = tx.Seq
		return nil
	})
	if err != nil {
		return SyncCursorView{}, normalizeSport(err)
	}
	return SyncCursorView{
		Cursor: formatCursor(seq), ServerTime: s.now().UTC().Format(time.RFC3339),
		ScopeVersion: SyncScopeVersion,
	}, nil
}

// Snapshot 返回增量（records/tombstones）与全量（成就/积分）快照。
func (s *SyncService) Snapshot(ctx context.Context, userID, cursor string, limit int) (SyncSnapshotView, error) {
	if limit <= 0 {
		limit = SyncSnapshotLimitMax
	}
	if limit > SyncSnapshotLimitMax {
		limit = SyncSnapshotLimitMax
	}
	from, err := parseCursor(cursor)
	if err != nil {
		return SyncSnapshotView{}, err
	}
	profile, err := s.Sport.profile(ctx, userID)
	if err != nil {
		return SyncSnapshotView{}, err
	}
	var view SyncSnapshotView
	err = s.Store.View(ctx, userID, func(tx *port.SportTx) error {
		records := sortedRecords(tx.Records)
		for _, record := range records {
			if record.Seq > from && len(view.Records) < limit {
				view.Records = append(view.Records, record)
			}
		}
		tombs := make([]domain.SportTombstone, 0)
		for _, t := range tx.Tombstones {
			if t.Seq > from {
				tombs = append(tombs, t)
			}
		}
		if len(tombs) > limit {
			tombs = tombs[:limit]
		}
		view.Tombstones = tombs
		view.Achievements = s.Sport.viewAll(tx, profile)
		view.Cursor = formatCursor(tx.Seq)
		return nil
	})
	if err != nil {
		return SyncSnapshotView{}, normalizeSport(err)
	}
	balance, _ := s.Rewards.Balance(ctx, userID)
	view.PointsBalance = balance
	if ledger, lerr := s.Rewards.Ledger(ctx, userID, "", 20); lerr == nil {
		view.Entries = ledger.Items
	}
	return view, nil
}

// Push 逐条应用变更，不因单条失败回滚整批（SYNC-03）。
func (s *SyncService) Push(ctx context.Context, userID, batchID, baseCursor string, changes []SyncChange) (SyncPushView, error) {
	if strings.TrimSpace(batchID) == "" || len(changes) == 0 || len(changes) > SyncBatchMax {
		return SyncPushView{}, apperr.NewSport(apperr.Sport001, nil)
	}
	if _, err := parseCursor(baseCursor); err != nil {
		return SyncPushView{}, err
	}
	if !s.allow(userID) {
		return SyncPushView{}, apperr.NewSport(apperr.Sport006, nil)
	}
	var view SyncPushView
	for _, change := range changes {
		result := SyncChangeResult{ChangeID: change.ChangeID}
		if strings.TrimSpace(change.ChangeID) == "" {
			result.Status = "rejected"
			result.Code = string(apperr.Sport001)
			view.Results = append(view.Results, result)
			continue
		}
		if change.Entity != domain.TombstoneEntitySportRecord {
			result.Status = "rejected"
			result.Code = string(apperr.Sport001)
			view.Results = append(view.Results, result)
			continue
		}
		switch change.Op {
		case "upsert":
			if change.Record == nil {
				result.Status = "rejected"
				result.Code = string(apperr.Sport001)
				break
			}
			added, err := s.Sport.AddRecord(ctx, userID, *change.Record)
			if err != nil {
				code := apperr.NormalizeSport(err)
				result.Code = string(code)
				switch code {
				case apperr.Sport003:
					result.Status = "conflict"
				case apperr.Sport006, apperr.Sport007, apperr.Sport008, apperr.Sport012:
					result.Status = "retryable"
					view.Retryable = append(view.Retryable, change.ChangeID)
				default:
					result.Status = "rejected"
				}
				break
			}
			result.RecordID = added.Record.RecordID
			if added.Replayed {
				result.Status = "duplicate"
			} else {
				result.Status = "applied"
			}
		case "delete":
			deleted, err := s.Sport.DeleteRecord(ctx, userID, change.RecordID)
			if err != nil {
				code := apperr.NormalizeSport(err)
				result.Code = string(code)
				if code == apperr.Sport006 || code == apperr.Sport007 || code == apperr.Sport008 {
					result.Status = "retryable"
					view.Retryable = append(view.Retryable, change.ChangeID)
				} else {
					result.Status = "rejected"
				}
				break
			}
			result.RecordID = change.RecordID
			if deleted.Deleted {
				result.Status = "applied"
			} else {
				result.Status = "duplicate"
			}
		default:
			result.Status = "rejected"
			result.Code = string(apperr.Sport001)
		}
		view.Results = append(view.Results, result)
	}
	var seq int64
	_ = s.Store.View(ctx, userID, func(tx *port.SportTx) error {
		seq = tx.Seq
		return nil
	})
	view.Cursor = formatCursor(seq)
	return view, nil
}

// Reconcile 对比本地摘要与服务端权威视图，输出差异供客户端决定覆盖或重拉。
func (s *SyncService) Reconcile(ctx context.Context, userID string, local ReconcileLocal) (ReconcileView, error) {
	profile, err := s.Sport.profile(ctx, userID)
	if err != nil {
		return ReconcileView{}, err
	}
	var (
		serverIDs   = map[string]bool{}
		unlockedCnt int
		seq         int64
	)
	err = s.Store.View(ctx, userID, func(tx *port.SportTx) error {
		for id := range tx.Records {
			serverIDs[id] = true
		}
		for _, a := range s.Sport.viewAll(tx, profile) {
			if a.Status != "locked" {
				unlockedCnt++
			}
		}
		seq = tx.Seq
		return nil
	})
	if err != nil {
		return ReconcileView{}, normalizeSport(err)
	}
	var view ReconcileView
	for _, id := range local.SportRecordIDs {
		if !serverIDs[id] {
			view.Diffs = append(view.Diffs, ReconcileDiff{
				Kind: "missing_remote", BusinessKey: id, Action: "pull_again",
			})
		}
		delete(serverIDs, id)
	}
	for id := range serverIDs {
		view.Diffs = append(view.Diffs, ReconcileDiff{
			Kind: "extra_remote", BusinessKey: id, Action: "overwrite_local",
		})
	}
	balance, _ := s.Rewards.Balance(ctx, userID)
	if local.CachedBalance != nil && *local.CachedBalance != balance {
		view.Diffs = append(view.Diffs, ReconcileDiff{
			Kind: "balance_mismatch", Local: *local.CachedBalance, Server: balance, Action: "overwrite_local",
		})
	}
	if local.CachedUnlockedCount != unlockedCnt {
		view.Diffs = append(view.Diffs, ReconcileDiff{
			Kind: "achievement_mismatch", Local: local.CachedUnlockedCount, Server: unlockedCnt, Action: "pull_again",
		})
	}
	view.Consistent = len(view.Diffs) == 0
	view.Cursor = formatCursor(seq)
	return view, nil
}

// allow 是 5 次/分钟的滑动窗口限流（不依赖失败计数语义的 Limiter）。
func (s *SyncService) allow(userID string) bool {
	now := s.now()
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.hits == nil {
		s.hits = map[string][]time.Time{}
	}
	cutoff := now.Add(-time.Minute)
	hits := s.hits[userID][:0]
	for _, t := range s.hits[userID] {
		if t.After(cutoff) {
			hits = append(hits, t)
		}
	}
	if len(hits) >= syncRateLimitPerMin {
		s.hits[userID] = hits
		return false
	}
	s.hits[userID] = append(hits, now)
	return true
}