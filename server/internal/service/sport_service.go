package service

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync/atomic"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/port"
)

// ProfileProvider 提供身体档案（由 check 域适配），缺失时返回 apperr.Check006。
type ProfileProvider func(ctx context.Context, userID string) (domain.HealthProfile, error)

// SportService 负责运动记录的校验、成就评估、证据推进与结算编排。
// 不直接修改积分余额（余额只由 RewardService 在奖励域事务内变更）。
type SportService struct {
	Store   port.SportStore
	Rewards *RewardService
	Profile ProfileProvider
	Clock   port.Clock
	Logger  *logx.Logger

	grantSuccess      int64
	grantFailure      int64
	grantCompensation int64
}

type AddRecordInput struct {
	RecordID   string
	Type       string
	Day        string
	DistanceM  int
	DurationS  int
	Steps      int
	Continuous bool
	ClientSeq  int
}

type AchievementView struct {
	AchievementID string
	RuleVersion   string
	Status        string
	Progress      int
	Need          int
	Points        int
	GrantedPoints int
	Capped        bool
	EvidenceDays  []string
	UnlockedAt    string
	UpdatedAt     string
}

type AddRecordView struct {
	Record        domain.SportRecord
	Unlocked      []AchievementView
	EarnedPoints  int
	PointsBalance int
	BalanceCapped bool
	RuleVersion   string
	Replayed      bool
}

type DeleteRecordView struct {
	Deleted       bool
	Achievements  []AchievementView
	PointsBalance int
}

type AchievementSnapshot struct {
	Achievements        []AchievementView
	UnlockedCount       int
	TotalCount          int
	TotalGrantedPoints  int
	PointsBalance       int
	RuleVersion         string
	ServerTime          string
}

func (s *SportService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now()
	}
	return time.Now().UTC()
}

// Stats 返回最小可观测指标（ACH-10）。
func (s *SportService) Stats() map[string]int64 {
	return map[string]int64{
		"sport_grant_success_total":      atomic.LoadInt64(&s.grantSuccess),
		"sport_grant_failure_total":      atomic.LoadInt64(&s.grantFailure),
		"sport_grant_compensation_total": atomic.LoadInt64(&s.grantCompensation),
	}
}

// AddRecord 写入记录并在运动域事务内评估成就，随后按幂等键结算积分。
func (s *SportService) AddRecord(ctx context.Context, userID string, in AddRecordInput) (AddRecordView, error) {
	record, err := s.validate(userID, in)
	if err != nil {
		return AddRecordView{}, err
	}
	profile, err := s.profile(ctx, userID)
	if err != nil {
		return AddRecordView{}, err
	}

	var (
		view      AddRecordView
		toGrant   []domain.AchievementEvidence
		replayed  bool
	)
	err = s.Store.Do(ctx, userID, func(tx *port.SportTx) error {
		if existing, ok := tx.Records[record.RecordID]; ok {
			if existing.Fingerprint() != record.Fingerprint() {
				return apperr.NewSport(apperr.Sport003, nil)
			}
			replayed = true
			view.Record = existing
			view.Replayed = true
			view.Unlocked = s.viewUnlocked(tx)
			return nil
		}
		tx.Records[record.RecordID] = record
		tx.Seq++
		records := sortedRecords(tx.Records)
		now := s.now()
		for _, state := range domain.EvaluateAll(records, toAthlete(profile)) {
			evidence := s.applyEvaluation(tx, state, now)
			if evidence.Status == domain.GrantUnlocked && evidence.GrantEntryID == "" {
				toGrant = append(toGrant, evidence)
			}
		}
		view.Record = record
		return nil
	})
	if err != nil {
		return AddRecordView{}, normalizeSport(err)
	}
	if replayed {
		balance, _ := s.Rewards.Balance(ctx, userID)
		view.PointsBalance = balance
		view.RuleVersion = domain.SportRuleVersion
		return view, nil
	}

	// 结算：每个新解锁按幂等键入账；失败进入待补发并立即补偿。
	earned := 0
	capped := false
	for _, ev := range toGrant {
		points := pointsFor(ev.AchievementID)
		result, failure := s.settleWithRetry(ctx, userID, ev.AchievementID, points)
		if failure != nil {
			s.markGranting(ctx, userID, ev.AchievementID, failure)
			continue
		}
		if result.Capped {
			capped = true
		}
		earned += result.Applied
		view.Unlocked = append(view.Unlocked, s.markGranted(ctx, userID, ev.AchievementID, result))
		s.log(ctx, "achievement_granted", userID, ev.AchievementID,
			"entryId", result.EntryID, "applied", result.Applied, "capped", result.Capped)
	}
	balance, _ := s.Rewards.Balance(ctx, userID)
	view.EarnedPoints = earned
	view.PointsBalance = balance
	view.BalanceCapped = capped
	view.RuleVersion = domain.SportRuleVersion
	return view, nil
}

// DeleteRecord 幂等删除：写墓碑、重算成就状态，积分不追回（ACH-06）。
func (s *SportService) DeleteRecord(ctx context.Context, userID, recordID string) (DeleteRecordView, error) {
	if strings.TrimSpace(recordID) == "" {
		return DeleteRecordView{}, apperr.NewSport(apperr.Sport001, nil)
	}
	profile, err := s.profile(ctx, userID)
	if err != nil {
		return DeleteRecordView{}, err
	}
	var view DeleteRecordView
	err = s.Store.Do(ctx, userID, func(tx *port.SportTx) error {
		if _, ok := tx.Records[recordID]; !ok {
			view.Deleted = false
			view.Achievements = s.viewAll(tx, profile)
			return nil
		}
		delete(tx.Records, recordID)
		tx.Seq++
		now := s.now()
		tx.Tombstones[recordID] = domain.SportTombstone{
			Entity: domain.TombstoneEntitySportRecord, BusinessKey: recordID, DeletedAt: now, Seq: tx.Seq,
		}
		records := sortedRecords(tx.Records)
		for _, state := range domain.EvaluateAll(records, toAthlete(profile)) {
			s.applyEvaluation(tx, state, now)
		}
		view.Deleted = true
		view.Achievements = s.viewAll(tx, profile)
		return nil
	})
	if err != nil {
		return DeleteRecordView{}, normalizeSport(err)
	}
	s.log(ctx, "achievement_revoked", userID, recordID, "reason", "delete")
	balance, _ := s.Rewards.Balance(ctx, userID)
	view.PointsBalance = balance
	return view, nil
}

// Achievements 返回成就快照；granting 状态用奖励域幂等键反查修复。
func (s *SportService) Achievements(ctx context.Context, userID string) (AchievementSnapshot, error) {
	profile, err := s.profile(ctx, userID)
	if err != nil {
		return AchievementSnapshot{}, err
	}
	var view AchievementSnapshot
	var pending []string
	err = s.Store.View(ctx, userID, func(tx *port.SportTx) error {
		for id, ev := range tx.Evidence {
			if ev.Status == domain.GrantGranting {
				pending = append(pending, id)
			}
		}
		return nil
	})
	if err != nil {
		return AchievementSnapshot{}, normalizeSport(err)
	}
	// 快照修复：待补发证据按幂等键重放，已入账则直接回写 granted（ACH-03）。
	for _, id := range pending {
		result, failure := s.settleWithRetry(ctx, userID, id, pointsFor(id))
		if failure != nil {
			continue
		}
		s.markGranted(ctx, userID, id, result)
		s.log(ctx, "achievement_granted", userID, id, "entryId", result.EntryID, "repair", true)
	}

	err = s.Store.View(ctx, userID, func(tx *port.SportTx) error {
		view.Achievements = s.viewAll(tx, profile)
		return nil
	})
	if err != nil {
		return AchievementSnapshot{}, normalizeSport(err)
	}
	view.RuleVersion = domain.SportRuleVersion
	view.ServerTime = s.now().UTC().Format(time.RFC3339)
	view.TotalCount = len(view.Achievements)
	for _, a := range view.Achievements {
		if a.Status == "unlocked" || a.Status == "granting" || a.Status == "granted" {
			view.UnlockedCount++
		}
		if a.Status == "granted" {
			view.TotalGrantedPoints += a.GrantedPoints
		}
	}
	balance, _ := s.Rewards.Balance(ctx, userID)
	view.PointsBalance = balance
	return view, nil
}

func (s *SportService) validate(userID string, in AddRecordInput) (domain.SportRecord, error) {
	recordID := strings.TrimSpace(in.RecordID)
	if recordID == "" || len(recordID) > 128 || strings.HasPrefix(recordID, "demo_") {
		return domain.SportRecord{}, apperr.NewSport(apperr.Sport001, nil)
	}
	kind := domain.SportType(strings.TrimSpace(in.Type))
	if !domain.ValidSportType(kind) {
		return domain.SportRecord{}, apperr.NewSport(apperr.Sport001, nil)
	}
	if _, err := domain.ParseBusinessDate(in.Day); err != nil {
		return domain.SportRecord{}, apperr.NewSport(apperr.Sport010, err)
	}
	if in.DistanceM < 0 || in.DistanceM > 300000 ||
		in.DurationS < 0 || in.DurationS > 86400 ||
		in.Steps < 0 || in.Steps > 100000 {
		return domain.SportRecord{}, apperr.NewSport(apperr.Sport004, nil)
	}
	return domain.SportRecord{
		RecordID: recordID, UserID: userID, Type: kind, Day: in.Day,
		DistanceM: in.DistanceM, DurationS: in.DurationS, Steps: in.Steps,
		Continuous: in.Continuous, CreatedAt: s.now().UTC(),
	}, nil
}

func (s *SportService) profile(ctx context.Context, userID string) (domain.HealthProfile, error) {
	if s.Profile == nil {
		return domain.HealthProfile{}, apperr.NewSport(apperr.Sport005, nil)
	}
	p, err := s.Profile(ctx, userID)
	if err != nil {
		return domain.HealthProfile{}, apperr.NewSport(apperr.Sport005, err)
	}
	if !p.Complete() {
		return domain.HealthProfile{}, apperr.NewSport(apperr.Sport005, nil)
	}
	return p, nil
}

// applyEvaluation 把一次评估结果写入证据；已发放状态不因重复达标改变。
func (s *SportService) applyEvaluation(tx *port.SportTx, state domain.AchievementState, now time.Time) domain.AchievementEvidence {
	ev := tx.Evidence[state.DefID]
	ev.AchievementID = state.DefID
	ev.RuleVersion = domain.SportRuleVersion
	ev.Progress = state.Progress
	ev.Need = state.Need
	if len(state.Days) > 0 {
		ev.EvidenceDays = mergeDays(ev.EvidenceDays, state.Days)
	}
	ev.UpdatedAt = now
	switch {
	case state.Unlocked:
		if ev.Status == "" || ev.Status == domain.GrantLocked {
			ev.Status = domain.GrantUnlocked
			if ev.UnlockedAt == nil {
				t := now
				ev.UnlockedAt = &t
			}
		}
	case ev.Status == domain.GrantGranted || ev.Status == domain.GrantGranting:
		// 已解锁后删除记录：状态回退，积分不追回。
		ev.Status = domain.GrantLocked
		t := now
		ev.RevokedAt = &t
	default:
		ev.Status = domain.GrantLocked
	}
	tx.Evidence[state.DefID] = ev
	return ev
}

func (s *SportService) settleWithRetry(
	ctx context.Context, userID, achievementID string, points int,
) (SettleResult, error) {
	var last error
	for attempt := 0; attempt <= domain.MaxGrantAttempts; attempt++ {
		if attempt > 0 {
			atomic.AddInt64(&s.grantCompensation, 1)
			select {
			case <-ctx.Done():
				return SettleResult{}, ctx.Err()
			case <-time.After(time.Duration(1<<uint(attempt-1)) * 50 * time.Millisecond):
			}
		}
		result, err := s.Rewards.SettleAchievement(ctx, userID, achievementID, points, domain.SportRuleVersion)
		if err == nil {
			atomic.AddInt64(&s.grantSuccess, 1)
			return result, nil
		}
		last = err
		atomic.AddInt64(&s.grantFailure, 1)
	}
	return SettleResult{}, last
}

func (s *SportService) markGranted(ctx context.Context, userID, achievementID string, r SettleResult) AchievementView {
	var out AchievementView
	_ = s.Store.Do(ctx, userID, func(tx *port.SportTx) error {
		ev := tx.Evidence[achievementID]
		ev.AchievementID = achievementID
		ev.RuleVersion = domain.SportRuleVersion
		ev.Status = domain.GrantGranted
		ev.GrantedPoints = r.Applied
		ev.Capped = r.Capped
		ev.GrantEntryID = r.EntryID
		ev.LastErrorCode = ""
		ev.UpdatedAt = s.now()
		tx.Evidence[achievementID] = ev
		out = toAchievementView(ev)
		return nil
	})
	return out
}

func (s *SportService) markGranting(ctx context.Context, userID, achievementID string, cause error) {
	_ = s.Store.Do(ctx, userID, func(tx *port.SportTx) error {
		ev := tx.Evidence[achievementID]
		ev.AchievementID = achievementID
		ev.RuleVersion = domain.SportRuleVersion
		ev.Status = domain.GrantGranting
		ev.Attempts = domain.MaxGrantAttempts
		ev.LastErrorCode = string(apperr.NormalizeSport(cause))
		ev.UpdatedAt = s.now()
		tx.Evidence[achievementID] = ev
		return nil
	})
	s.log(ctx, "achievement_grant_failed", userID, achievementID, "attempts", domain.MaxGrantAttempts)
}

func (s *SportService) viewAll(tx *port.SportTx, profile domain.HealthProfile) []AchievementView {
	defs := domain.AchievementDefs()
	records := sortedRecords(tx.Records)
	out := make([]AchievementView, 0, len(defs))
	for _, def := range defs {
		state := domain.Evaluate(records, def, toAthlete(profile))
		ev, ok := tx.Evidence[def.ID]
		view := AchievementView{
			AchievementID: def.ID, RuleVersion: domain.SportRuleVersion, Points: def.Points,
			Progress: state.Progress, Need: state.Need,
		}
		if view.Need == 0 {
			view.Need = def.Secondary
		}
		if ok {
			view.Status = domain.EvidenceViewStatus(ev.Status)
			view.GrantedPoints = ev.GrantedPoints
			view.Capped = ev.Capped
			view.EvidenceDays = ev.EvidenceDays
			if ev.UnlockedAt != nil {
				view.UnlockedAt = ev.UnlockedAt.UTC().Format(time.RFC3339)
			}
			view.UpdatedAt = ev.UpdatedAt.UTC().Format(time.RFC3339)
			if len(ev.EvidenceDays) > 0 && view.Progress < ev.Progress {
				view.Progress = ev.Progress
			}
		} else {
			view.Status = "locked"
			view.EvidenceDays = state.Days
		}
		out = append(out, view)
	}
	return out
}

func (s *SportService) viewUnlocked(tx *port.SportTx) []AchievementView {
	out := make([]AchievementView, 0)
	for _, ev := range tx.Evidence {
		if ev.Status == domain.GrantUnlocked {
			out = append(out, toAchievementView(ev))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].AchievementID < out[j].AchievementID })
	return out
}

func toAchievementView(ev domain.AchievementEvidence) AchievementView {
	view := AchievementView{
		AchievementID: ev.AchievementID, RuleVersion: ev.RuleVersion,
		Status: domain.EvidenceViewStatus(ev.Status), Progress: ev.Progress, Need: ev.Need,
		Points: pointsFor(ev.AchievementID), GrantedPoints: ev.GrantedPoints, Capped: ev.Capped,
		EvidenceDays: ev.EvidenceDays, UpdatedAt: ev.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if ev.UnlockedAt != nil {
		view.UnlockedAt = ev.UnlockedAt.UTC().Format(time.RFC3339)
	}
	return view
}

func (s *SportService) log(ctx context.Context, event, userID, ref string, kv ...any) {
	if s.Logger == nil {
		return
	}
	args := append([]any{"event", event, "userId", userID, "achievementId", ref}, kv...)
	s.Logger.Info(ctx, event, args...)
}

func pointsFor(achievementID string) int {
	for _, def := range domain.AchievementDefs() {
		if def.ID == achievementID {
			return def.Points
		}
	}
	return 0
}

func toAthlete(p domain.HealthProfile) domain.AthleteProfile {
	return domain.AthleteProfile{Gender: p.Gender, Age: p.Age, WeightG: p.WeightG, HeightCM: p.HeightCM}
}

func sortedRecords(records map[string]domain.SportRecord) []domain.SportRecord {
	out := make([]domain.SportRecord, 0, len(records))
	for _, r := range records {
		out = append(out, r)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].RecordID < out[j].RecordID })
	return out
}

func mergeDays(existing, add []string) []string {
	seen := make(map[string]bool, len(existing)+len(add))
	out := make([]string, 0, len(existing)+len(add))
	for _, d := range append(existing, add...) {
		if d == "" || seen[d] {
			continue
		}
		seen[d] = true
		out = append(out, d)
	}
	sort.Strings(out)
	return out
}

func normalizeSport(err error) error {
	if err == nil {
		return nil
	}
	var se *apperr.SportError
	if errors.As(err, &se) {
		return se
	}
	return apperr.NewSport(apperr.Sport008, err)
}