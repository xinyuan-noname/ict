package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/platform/ratelimit"
	"ict/server/internal/port"
)

type CheckService struct {
	Store   port.CheckStore
	Clock   port.Clock
	Logger  *logx.Logger
	Limiter *ratelimit.Limiter
}

type TodayView struct {
	Day       string
	TargetML  int
	TotalML   int
	Achieved  bool
	CupML     int
	Cups      int
	Streak    int
	Records   []domain.WaterRecord
	Profile   *domain.HealthProfile
}

type ProfileView struct {
	Profile   domain.HealthProfile
	TargetML  int
	Complete  bool
}

func (s *CheckService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now()
	}
	return time.Now().UTC()
}

func (s *CheckService) today() string { return domain.BusinessDate(s.now()) }

func (s *CheckService) allowed(userID string) bool {
	if s.Limiter == nil {
		return true
	}
	ok, _ := s.Limiter.Allow("check|" + userID)
	return ok
}

func (s *CheckService) Profile(ctx context.Context, userID string) (ProfileView, error) {
	var view ProfileView
	err := s.Store.View(ctx, userID, func(tx *port.CheckTx) error {
		if tx.Profile == nil {
			return apperr.NewCheck(apperr.Check006, nil)
		}
		target, err := targetFor(tx, s.today())
		if err != nil {
			return err
		}
		view = ProfileView{Profile: *tx.Profile, TargetML: target, Complete: tx.Profile.Complete()}
		return nil
	})
	if err != nil {
		return ProfileView{}, normalizeCheck(err)
	}
	return view, nil
}

// PutProfile 首次立即生效，变更次日生效。
func (s *CheckService) PutProfile(ctx context.Context, userID string, p domain.HealthProfile) (ProfileView, error) {
	p.UserID = userID
	if !p.Complete() {
		return ProfileView{}, apperr.NewCheck(apperr.Check006, nil)
	}
	goal, err := domain.WaterGoalML(p)
	if err != nil {
		return ProfileView{}, apperr.NewCheck(apperr.Check005, err)
	}
	now := s.now()
	day := domain.BusinessDate(now)
	var view ProfileView
	derr := s.Store.Do(ctx, userID, func(tx *port.CheckTx) error {
		effective := day
		if tx.Profile != nil {
			// 已有档案：变更次日生效。
			effective = nextDay(day)
		}
		tx.Goals[effective] = goal
		p.UpdatedAt = now
		p.EffectiveDay = effective
		tx.Profile = &p
		view = ProfileView{Profile: p, TargetML: goal, Complete: true}
		return nil
	})
	if derr != nil {
		return ProfileView{}, normalizeCheck(derr)
	}
	return view, nil
}

func (s *CheckService) Today(ctx context.Context, userID string) (TodayView, error) {
	day := s.today()
	var view TodayView
	err := s.Store.View(ctx, userID, func(tx *port.CheckTx) error {
		if tx.Profile == nil {
			return apperr.NewCheck(apperr.Check006, nil)
		}
		target, err := targetFor(tx, day)
		if err != nil {
			return err
		}
		records := recordsOn(tx.Records, day)
		total := 0
		for _, r := range records {
			total += r.ML
		}
		view = TodayView{
			Day: day, TargetML: target, TotalML: total, Achieved: total >= target,
			CupML: domain.DefaultCupML, Cups: total / domain.DefaultCupML,
			Records: records, Profile: tx.Profile,
		}
		view.Streak = streakDays(tx, day, target)
		return nil
	})
	if err != nil {
		return TodayView{}, normalizeCheck(err)
	}
	return view, nil
}

// AddRecord 幂等：同一 Idempotency-Key 返回同一记录。
func (s *CheckService) AddRecord(ctx context.Context, userID string, ml int, idemKey string) (TodayView, error) {
	if ml < 50 || ml > 2000 {
		return TodayView{}, apperr.NewCheck(apperr.Check001, errors.New("ml out of range"))
	}
	if !domain.ValidIdempotencyKey(idemKey) {
		return TodayView{}, apperr.NewCheck(apperr.Check001, errors.New("invalid idempotency key"))
	}
	if !s.allowed(userID) {
		return TodayView{}, apperr.NewCheck(apperr.Check007, nil)
	}
	day := s.today()
	now := s.now()
	err := s.Store.Do(ctx, userID, func(tx *port.CheckTx) error {
		if tx.Profile == nil {
			return apperr.NewCheck(apperr.Check006, nil)
		}
		if _, exists := tx.Idem[idemKey]; exists {
			return nil // 幂等重放
		}
		record := domain.WaterRecord{
			RecordID: fmt.Sprintf("wr_%d", now.UnixNano()), UserID: userID,
			Day: day, ML: ml, CreatedAt: now, IdempotencyKey: idemKey,
		}
		tx.Records = append(tx.Records, record)
		tx.Idem[idemKey] = record.RecordID
		return nil
	})
	if err != nil {
		return TodayView{}, normalizeCheck(err)
	}
	return s.Today(ctx, userID)
}

func (s *CheckService) DeleteRecord(ctx context.Context, userID, recordID string) (TodayView, error) {
	found := false
	err := s.Store.Do(ctx, userID, func(tx *port.CheckTx) error {
		for i, r := range tx.Records {
			if r.RecordID == recordID {
				tx.Records = append(tx.Records[:i], tx.Records[i+1:]...)
				delete(tx.Idem, r.IdempotencyKey)
				found = true
				return nil
			}
		}
		return apperr.NewCheck(apperr.Check002, nil)
	})
	if err != nil {
		return TodayView{}, normalizeCheck(err)
	}
	if !found {
		return TodayView{}, apperr.NewCheck(apperr.Check002, nil)
	}
	return s.Today(ctx, userID)
}

func (s *CheckService) Week(ctx context.Context, userID, weekStart string) (domain.WeekStats, error) {
	if weekStart == "" {
		start, err := domain.WeekStartOf(s.today())
		if err != nil {
			return domain.WeekStats{}, apperr.NewCheck(apperr.Check010, err)
		}
		weekStart = start
	}
	days, err := domain.WeekDays(weekStart)
	if err != nil {
		return domain.WeekStats{}, apperr.NewCheck(apperr.Check010, err)
	}
	var summaries []domain.DaySummary
	verr := s.Store.View(ctx, userID, func(tx *port.CheckTx) error {
		if tx.Profile == nil {
			return apperr.NewCheck(apperr.Check006, nil)
		}
		fallback, err := targetFor(tx, s.today())
		if err != nil {
			return err
		}
		for _, day := range days {
			target := fallback
			if v, ok := tx.Goals[day]; ok {
				target = v
			}
			records := recordsOn(tx.Records, day)
			total := 0
			for _, r := range records {
				total += r.ML
			}
			summaries = append(summaries, domain.DaySummary{
				Day: day, TotalML: total, TargetML: target,
				Achieved: target > 0 && total >= target, RecordCount: len(records),
			})
		}
		return nil
	})
	if verr != nil {
		return domain.WeekStats{}, normalizeCheck(verr)
	}
	return domain.BuildWeekStats(weekStart, summaries, s.today()), nil
}

// Preview 用未保存的档案计算目标，用于填写时实时预览。
func (s *CheckService) Preview(p domain.HealthProfile) (int, error) {
	ml, err := domain.WaterGoalML(p)
	if err != nil {
		return 0, apperr.NewCheck(apperr.Check005, err)
	}
	return ml, nil
}

func (s *CheckService) List() []domain.ChecklistDefinition { return domain.DefaultChecklists() }

func targetFor(tx *port.CheckTx, day string) (int, error) {
	if v, ok := tx.Goals[day]; ok {
		return v, nil
	}
	if tx.Profile == nil {
		return 0, apperr.NewCheck(apperr.Check006, nil)
	}
	ml, err := domain.WaterGoalML(*tx.Profile)
	if err != nil {
		return 0, apperr.NewCheck(apperr.Check005, err)
	}
	return ml, nil
}

func recordsOn(records []domain.WaterRecord, day string) []domain.WaterRecord {
	out := make([]domain.WaterRecord, 0, 4)
	for _, r := range records {
		if r.Day == day {
			out = append(out, r)
		}
	}
	return out
}

// streakDays 从今天往前统计连续达成天数。
func streakDays(tx *port.CheckTx, today string, target int) int {
	streak := 0
	day := today
	for i := 0; i < 365; i++ {
		t, err := domain.ParseBusinessDate(day)
		if err != nil {
			break
		}
		targetToday := target
		if v, ok := tx.Goals[day]; ok {
			targetToday = v
		}
		total := 0
		for _, r := range tx.Records {
			if r.Day == day {
				total += r.ML
			}
		}
		if targetToday > 0 && total >= targetToday {
			streak++
		} else {
			break
		}
		day = t.AddDate(0, 0, -1).Format("2006-01-02")
	}
	return streak
}

func nextDay(day string) string {
	t, err := domain.ParseBusinessDate(day)
	if err != nil {
		return day
	}
	return t.AddDate(0, 0, 1).Format("2006-01-02")
}

func normalizeCheck(err error) error {
	if err == nil {
		return nil
	}
	var ce *apperr.CheckError
	if errors.As(err, &ce) {
		return ce
	}
	if strings.Contains(err.Error(), "profile") {
		return apperr.NewCheck(apperr.Check006, err)
	}
	return apperr.NewCheck(apperr.Check009, err)
}