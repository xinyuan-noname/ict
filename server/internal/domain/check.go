package domain

import (
	"errors"
	"strings"
	"time"
)

const (
	WaterGoalVersion = "water-goal-v1"
	WaterMLMinAdult  = 1200
	WaterMLMaxAdult  = 3500
	WaterMLMinTeen   = 1000
	WaterMLMaxTeen   = 3000
	DefaultCupML     = 250
)

type Gender string

const (
	GenderMale   Gender = "male"
	GenderFemale Gender = "female"
	GenderOther  Gender = "other"
)

func ValidGender(g Gender) bool {
	return g == GenderMale || g == GenderFemale || g == GenderOther
}

// HealthProfile 是喝水目标的身体档案；变更次日生效。
type HealthProfile struct {
	UserID       string    `json:"userId"`
	HeightCM     int       `json:"heightCm"`
	WeightG      int       `json:"weightG"`
	Age          int       `json:"age"`
	Gender       Gender    `json:"gender"`
	UpdatedAt    time.Time `json:"updatedAt"`
	EffectiveDay string    `json:"effectiveDay"`
}

func (p HealthProfile) Complete() bool {
	return p.HeightCM > 0 && p.WeightG > 0 && p.Age > 0 && ValidGender(p.Gender)
}

var (
	ErrProfileIncomplete = errors.New("profile incomplete")
	ErrProfileOutOfRange = errors.New("profile out of range")
)

// WaterGoalML 用定点整数实现 water-goal-v1，避免浮点漂移。
// 公式：SBW=22*(h/100)^2，有效体重=0.7W+0.3SBW，基线 32ml/kg，
// 再乘年龄/性别系数，最后限幅并取整到 50ml。
func WaterGoalML(p HealthProfile) (int, error) {
	if !p.Complete() {
		return 0, ErrProfileIncomplete
	}
	if p.HeightCM < 100 || p.HeightCM > 250 {
		return 0, ErrProfileOutOfRange
	}
	if p.WeightG < 20000 || p.WeightG > 300000 {
		return 0, ErrProfileOutOfRange
	}
	if p.Age < 14 || p.Age > 120 {
		return 0, ErrProfileOutOfRange
	}
	// 定点：1e-6 kg / 1e-6 ml
	height := int64(p.HeightCM)
	sbwUKg := 22 * height * height * 100
	weightUKg := int64(p.WeightG) * 1000
	effUKg := (7*weightUKg + 3*sbwUKg) / 10
	mlMicro := effUKg * 32

	agePermille := int64(1000)
	switch {
	case p.Age < 30:
		agePermille = 1000
	case p.Age < 50:
		agePermille = 980
	case p.Age < 65:
		agePermille = 950
	case p.Age < 80:
		agePermille = 920
	default:
		agePermille = 900
	}
	genderPermille := int64(1000)
	switch p.Gender {
	case GenderFemale:
		genderPermille = 950
	case GenderOther:
		genderPermille = 975
	}
	mlMicro = mlMicro * agePermille / 1000
	mlMicro = mlMicro * genderPermille / 1000

	ml := int((mlMicro + 500_000) / 1_000_000)
	ml = ((ml + 25) / 50) * 50

	low, high := WaterMLMinAdult, WaterMLMaxAdult
	if p.Age < 18 {
		low, high = WaterMLMinTeen, WaterMLMaxTeen
	}
	if ml < low {
		ml = low
	}
	if ml > high {
		ml = high
	}
	return ml, nil
}

// 清单类型（定量式 / 完成式）。
type ChecklistType string

const (
	ChecklistQuantitative ChecklistType = "quantitative"
	ChecklistCompletion   ChecklistType = "completion"
)

type ChecklistDefinition struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Type      ChecklistType `json:"type"`
	Unit      string        `json:"unit"`
	Period    string        `json:"period"`
	Version   string        `json:"version"`
	TargetKey string        `json:"targetKey"`
}

// DefaultChecklists 返回首个喝水清单，并为后续清单预留注册位。
func DefaultChecklists() []ChecklistDefinition {
	return []ChecklistDefinition{{
		ID: "drink_water", Name: "喝水清单", Type: ChecklistQuantitative,
		Unit: "ml", Period: "daily", Version: WaterGoalVersion, TargetKey: "waterGoalMl",
	}}
}

type WaterRecord struct {
	RecordID       string    `json:"recordId"`
	UserID         string    `json:"userId"`
	Day            string    `json:"day"`
	ML             int       `json:"ml"`
	CreatedAt      time.Time `json:"createdAt"`
	IdempotencyKey string    `json:"idempotencyKey"`
}

type DaySummary struct {
	Day        string `json:"day"`
	TotalML    int    `json:"totalMl"`
	TargetML   int    `json:"targetMl"`
	Achieved   bool   `json:"achieved"`
	RecordCount int   `json:"recordCount"`
}

type WeekStats struct {
	WeekStart        string        `json:"weekStart"`
	Days             []DaySummary  `json:"days"`
	AverageML        *int          `json:"averageMl"`
	TotalML          int           `json:"totalMl"`
	AchievedDays     int           `json:"achievedDays"`
	ElapsedDays      int           `json:"elapsedDays"`
	AchievementRate  float64       `json:"achievementRate"`
	TargetML         int           `json:"targetMl"`
}

// BuildDaySummary 汇总单日记录。
func BuildDaySummary(day string, records []WaterRecord, targetML int) DaySummary {
	total := 0
	for _, r := range records {
		if r.Day == day {
			total += r.ML
		}
	}
	return DaySummary{
		Day: day, TotalML: total, TargetML: targetML,
		Achieved: targetML > 0 && total >= targetML,
		RecordCount: len(records),
	}
}

// BuildWeekStats 周平均 = 有记录日均值；达成率按已过天数计算。
func BuildWeekStats(weekStart string, days []DaySummary, today string) WeekStats {
	stats := WeekStats{WeekStart: weekStart, Days: days}
	recorded := 0
	for _, d := range days {
		stats.TotalML += d.TotalML
		if d.TotalML > 0 {
			recorded++
			stats.AverageML = nil
		}
		if d.Achieved {
			stats.AchievedDays++
		}
		if d.Day <= today {
			stats.ElapsedDays++
		}
		if d.TargetML > 0 {
			stats.TargetML = d.TargetML
		}
	}
	if recorded > 0 {
		avg := (stats.TotalML + recorded/2) / recorded
		stats.AverageML = &avg
	}
	if stats.ElapsedDays > 0 {
		stats.AchievementRate = float64(stats.AchievedDays) / float64(stats.ElapsedDays)
	}
	return stats
}

// WeekStartOf 返回业务日所在周的周一。
func WeekStartOf(day string) (string, error) {
	t, err := ParseBusinessDate(day)
	if err != nil {
		return "", err
	}
	weekday := int(t.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	return t.AddDate(0, 0, -(weekday - 1)).Format("2006-01-02"), nil
}

func WeekDays(weekStart string) ([]string, error) {
	t, err := ParseBusinessDate(weekStart)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, 7)
	for i := 0; i < 7; i++ {
		out = append(out, t.AddDate(0, 0, i).Format("2006-01-02"))
	}
	return out, nil
}

func NormalizeGender(raw string) (Gender, bool) {
	g := Gender(strings.ToLower(strings.TrimSpace(raw)))
	return g, ValidGender(g)
}