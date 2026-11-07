package domain

import (
	"fmt"
	"math"
	"time"
)

type SportType string

const (
	SportWalking SportType = "walking"
	SportCycling SportType = "cycling"
	SportRunning SportType = "running"
)

type SportRecord struct {
	RecordID   string    `json:"recordId"`
	UserID     string    `json:"userId"`
	Type       SportType `json:"type"`
	Day        string    `json:"day"`
	DistanceM  int       `json:"distanceM"`
	DurationS  int       `json:"durationS"`
	Steps      int       `json:"steps"`
	Continuous bool      `json:"continuous"`
	CreatedAt  time.Time `json:"createdAt"`
}

func ValidSportType(t SportType) bool {
	return t == SportWalking || t == SportCycling || t == SportRunning
}

// PaceSecPerKm 返回平均配速（秒/公里）；距离不足返回 0。
func (r SportRecord) PaceSecPerKm() int {
	if r.DistanceM <= 0 || r.DurationS <= 0 {
		return 0
	}
	return int(math.Round(float64(r.DurationS) * 1000 / float64(r.DistanceM)))
}

func (r SportRecord) Fingerprint() string {
	return fmt.Sprintf("%s|%s|%d|%d|%d", r.Type, r.Day, r.DistanceM, r.DurationS, r.Steps)
}

// AthleteProfile 是配速极限估算输入。
type AthleteProfile struct {
	Gender   Gender
	Age      int
	WeightG  int
	HeightCM int
}

// PaceLimitSec 计算个人极限配速 PLP（秒/公里）= P0 × Ka × Kw。
func PaceLimitSec(p AthleteProfile) float64 {
	p0 := 260.0
	switch p.Gender {
	case GenderFemale:
		p0 = 290
	case GenderOther:
		p0 = 275
	}
	ka := 1.0
	if p.Age > 30 {
		ka += 0.005 * float64(p.Age-30)
	} else if p.Age < 30 {
		ka -= 0.0015 * float64(30-p.Age)
	}
	ka = clampFloat(ka, 0.93, 1.80)

	kw := 1.0
	if p.WeightG > 0 && p.HeightCM > 0 {
		h := float64(p.HeightCM) / 100
		bmi := float64(p.WeightG) / 1000 / (h * h)
		kw = 1 + 0.012*(bmi-22)
		kw = clampFloat(kw, 0.94, 1.35)
	}
	return p0 * ka * kw
}

// PaceScale 为阈值缩放系数：s = 1 + 0.5 × (PLP/260 − 1)，钳制 [0.92,1.12]。
func PaceScale(p AthleteProfile) float64 {
	s := 1 + 0.5*(PaceLimitSec(p)/260-1)
	return clampFloat(s, 0.92, 1.12)
}

// EffectivePaceThreshold 将标准阈值按个人系数缩放，并取整到 5 秒。
func EffectivePaceThreshold(stdSec int, p AthleteProfile) int {
	t := float64(stdSec) * PaceScale(p)
	return int(math.Round(t/5)) * 5
}

type AchievementDef struct {
	ID        string `json:"id"`
	Group     string `json:"group"`
	Name      string `json:"name"`
	Desc      string `json:"desc"`
	Icon      string `json:"icon"`
	Rule      string `json:"rule"`
	Threshold int    `json:"threshold"`
	Secondary int    `json:"secondary,omitempty"`
	Points    int    `json:"points"`
	StdPaceS  int    `json:"stdPaceS,omitempty"`
}

const (
	GroupWalking  = "walking"
	GroupCycling  = "cycling"
	GroupPace     = "pace"
	GroupDistance = "distance"
	GroupCombo    = "combo"
)

const (
	RuleSingleDaySteps  = "single_day_steps"
	RuleCumDaysSteps    = "cum_days_steps"
	RuleOnceDistance    = "once_distance"
	RuleCumCountDist    = "cum_count_distance"
	RulePaceThreshold   = "pace_threshold"
	RuleContinuousDist  = "continuous_distance"
	RuleCumDistance     = "cum_distance"
	RuleCombo           = "combo"
)

// AchievementDefs 返回 33 个成就定义（5 组）。
func AchievementDefs() []AchievementDef {
	defs := []AchievementDef{
		// 步行（9）
		{ID: "walk_10k", Group: GroupWalking, Name: "一万步", Desc: "某天步数 ≥ 10000", Icon: "🔓", Rule: RuleSingleDaySteps, Threshold: 10000, Points: 20},
		{ID: "walk_15k", Group: GroupWalking, Name: "一万五", Desc: "某天步数 ≥ 15000", Icon: "🔓", Rule: RuleSingleDaySteps, Threshold: 15000, Points: 30},
		{ID: "walk_15k_3d", Group: GroupWalking, Name: "累计 3 天一万五", Desc: "累计 3 天步数 ≥ 15000", Icon: "🏅", Rule: RuleCumDaysSteps, Threshold: 15000, Secondary: 3, Points: 40},
		{ID: "walk_15k_5d", Group: GroupWalking, Name: "累计 5 天一万五", Desc: "累计 5 天步数 ≥ 15000", Icon: "🏅", Rule: RuleCumDaysSteps, Threshold: 15000, Secondary: 5, Points: 50},
		{ID: "walk_15k_10d", Group: GroupWalking, Name: "累计 10 天一万五", Desc: "累计 10 天步数 ≥ 15000", Icon: "👑", Rule: RuleCumDaysSteps, Threshold: 15000, Secondary: 10, Points: 60},
		{ID: "walk_15k_15d", Group: GroupWalking, Name: "累计 15 天一万五", Desc: "累计 15 天步数 ≥ 15000", Icon: "👑", Rule: RuleCumDaysSteps, Threshold: 15000, Secondary: 15, Points: 70},
		{ID: "walk_15k_20d", Group: GroupWalking, Name: "累计 20 天一万五", Desc: "累计 20 天步数 ≥ 15000", Icon: "👑", Rule: RuleCumDaysSteps, Threshold: 15000, Secondary: 20, Points: 80},
		{ID: "walk_15k_25d", Group: GroupWalking, Name: "累计 25 天一万五", Desc: "累计 25 天步数 ≥ 15000", Icon: "👑", Rule: RuleCumDaysSteps, Threshold: 15000, Secondary: 25, Points: 90},
		{ID: "walk_15k_30d", Group: GroupWalking, Name: "累计 30 天一万五", Desc: "累计 30 天步数 ≥ 15000", Icon: "👑", Rule: RuleCumDaysSteps, Threshold: 15000, Secondary: 30, Points: 100},

		// 骑行（4）
		{ID: "cycle_5k", Group: GroupCycling, Name: "五公里", Desc: "某次骑行 ≥ 5km", Icon: "🔓", Rule: RuleOnceDistance, Threshold: 5000, Points: 30},
		{ID: "cycle_10k", Group: GroupCycling, Name: "十公里", Desc: "某次骑行 ≥ 10km", Icon: "🔓", Rule: RuleOnceDistance, Threshold: 10000, Points: 40},
		{ID: "cycle_10k_3", Group: GroupCycling, Name: "骑行者", Desc: "累计 3 次骑行 ≥ 10km", Icon: "🏅", Rule: RuleCumCountDist, Threshold: 10000, Secondary: 3, Points: 60},
		{ID: "cycle_10k_5", Group: GroupCycling, Name: "铁屁股", Desc: "累计 5 次骑行 ≥ 10km", Icon: "👑", Rule: RuleCumCountDist, Threshold: 10000, Secondary: 5, Points: 80},

		// 跑步配速（7，标准阈值秒）
		{ID: "pace_500", Group: GroupPace, Name: "五零零", Desc: "配速 ≤ 5:00/km", Icon: "🔓", Rule: RulePaceThreshold, StdPaceS: 300, Points: 30},
		{ID: "pace_440", Group: GroupPace, Name: "四四零", Desc: "配速 ≤ 4:40/km", Icon: "🔓", Rule: RulePaceThreshold, StdPaceS: 280, Points: 40},
		{ID: "pace_420", Group: GroupPace, Name: "四二零", Desc: "配速 ≤ 4:20/km", Icon: "🔓", Rule: RulePaceThreshold, StdPaceS: 260, Points: 50},
		{ID: "pace_400", Group: GroupPace, Name: "四分台", Desc: "配速 ≤ 4:00/km", Icon: "🏅", Rule: RulePaceThreshold, StdPaceS: 240, Points: 70},
		{ID: "pace_350", Group: GroupPace, Name: "三五零", Desc: "配速 ≤ 3:50/km", Icon: "🏅", Rule: RulePaceThreshold, StdPaceS: 230, Points: 90},
		{ID: "pace_340", Group: GroupPace, Name: "三四零", Desc: "配速 ≤ 3:40/km", Icon: "👑", Rule: RulePaceThreshold, StdPaceS: 220, Points: 120},
		{ID: "pace_330", Group: GroupPace, Name: "三三零", Desc: "配速 ≤ 3:30/km", Icon: "👑", Rule: RulePaceThreshold, StdPaceS: 210, Points: 150},

		// 跑步距离（7）
		{ID: "run_cont_1k", Group: GroupDistance, Name: "连续 1km", Desc: "连续跑完 1km，中间不停", Icon: "🔓", Rule: RuleContinuousDist, Threshold: 1000, Points: 20},
		{ID: "run_cont_3k", Group: GroupDistance, Name: "连续 3km", Desc: "连续跑完 3km，中间不停", Icon: "🔓", Rule: RuleContinuousDist, Threshold: 3000, Points: 40},
		{ID: "run_cont_5k", Group: GroupDistance, Name: "连续 5km", Desc: "连续跑完 5km，中间不停", Icon: "🏅", Rule: RuleContinuousDist, Threshold: 5000, Points: 70},
		{ID: "run_cont_10k", Group: GroupDistance, Name: "连续 10km", Desc: "连续跑完 10km，中间不停", Icon: "👑", Rule: RuleContinuousDist, Threshold: 10000, Points: 120},
		{ID: "run_total_10k", Group: GroupDistance, Name: "累计跑步 10km", Desc: "累计跑步总里程 ≥ 10km", Icon: "🏅", Rule: RuleCumDistance, Threshold: 10000, Points: 50},
		{ID: "run_total_50k", Group: GroupDistance, Name: "累计跑步 50km", Desc: "累计跑步总里程 ≥ 50km", Icon: "🏅", Rule: RuleCumDistance, Threshold: 50000, Points: 100},
		{ID: "run_total_100k", Group: GroupDistance, Name: "累计跑步 100km", Desc: "累计跑步总里程 ≥ 100km", Icon: "👑", Rule: RuleCumDistance, Threshold: 100000, Points: 160},

		// 速度+距离连击（6）
		{ID: "combo_3k_500", Group: GroupCombo, Name: "3km @ 5:00", Desc: "完成连续 3km，平均配速 ≤ 5:00/km", Icon: "🔥", Rule: RuleCombo, Threshold: 3000, StdPaceS: 300, Points: 60},
		{ID: "combo_3k_430", Group: GroupCombo, Name: "3km @ 4:30", Desc: "完成连续 3km，平均配速 ≤ 4:30/km", Icon: "🔥", Rule: RuleCombo, Threshold: 3000, StdPaceS: 270, Points: 80},
		{ID: "combo_3k_400", Group: GroupCombo, Name: "3km @ 4:00", Desc: "完成连续 3km，平均配速 ≤ 4:00/km", Icon: "🔥", Rule: RuleCombo, Threshold: 3000, StdPaceS: 240, Points: 110},
		{ID: "combo_5k_500", Group: GroupCombo, Name: "5km @ 5:00", Desc: "完成连续 5km，平均配速 ≤ 5:00/km", Icon: "🔥", Rule: RuleCombo, Threshold: 5000, StdPaceS: 300, Points: 90},
		{ID: "combo_5k_430", Group: GroupCombo, Name: "5km @ 4:30", Desc: "完成连续 5km，平均配速 ≤ 4:30/km", Icon: "🔥", Rule: RuleCombo, Threshold: 5000, StdPaceS: 270, Points: 120},
		{ID: "combo_5k_400", Group: GroupCombo, Name: "5km @ 4:00", Desc: "完成连续 5km，平均配速 ≤ 4:00/km", Icon: "🔥", Rule: RuleCombo, Threshold: 5000, StdPaceS: 240, Points: 160},
	}
	// 校准到规格约定的 33 成就总积分 1560。
	points := map[string]int{
		"walk_10k": 10, "walk_15k": 15, "walk_15k_3d": 20, "walk_15k_5d": 25,
		"walk_15k_10d": 30, "walk_15k_15d": 35, "walk_15k_20d": 40, "walk_15k_25d": 45, "walk_15k_30d": 50,
		"cycle_5k": 15, "cycle_10k": 20, "cycle_10k_3": 30, "cycle_10k_5": 40,
		"pace_500": 20, "pace_440": 25, "pace_420": 30, "pace_400": 40, "pace_350": 50, "pace_340": 60, "pace_330": 70,
		"run_cont_1k": 15, "run_cont_3k": 25, "run_cont_5k": 40, "run_cont_10k": 60,
		"run_total_10k": 30, "run_total_50k": 50, "run_total_100k": 70,
		"combo_3k_500": 60, "combo_3k_430": 90, "combo_3k_400": 120,
		"combo_5k_500": 80, "combo_5k_430": 110, "combo_5k_400": 140,
	}
	for i := range defs {
		if p, ok := points[defs[i].ID]; ok {
			defs[i].Points = p
		}
	}
	return defs
}

// AchievementState 是成就解锁结果（含证据日期）。
type AchievementState struct {
	DefID    string   `json:"defId"`
	Unlocked bool     `json:"unlocked"`
	Days     []string `json:"days,omitempty"`
	Progress int      `json:"progress"`
	Need     int      `json:"need"`
}

// Evaluate 判定单个成就；rules 见常量。
func Evaluate(records []SportRecord, def AchievementDef, profile AthleteProfile) AchievementState {
	state := AchievementState{DefID: def.ID, Need: def.Secondary}
	switch def.Rule {
	case RuleSingleDaySteps:
		seen := map[string]bool{}
		for _, r := range records {
			if r.Type != SportWalking {
				continue
			}
			if r.Steps >= def.Threshold && !seen[r.Day] {
				seen[r.Day] = true
				state.Days = append(state.Days, r.Day)
			}
		}
		state.Progress = len(state.Days)
		state.Unlocked = len(state.Days) > 0

	case RuleCumDaysSteps:
		seen := map[string]bool{}
		for _, r := range records {
			if r.Type != SportWalking {
				continue
			}
			if r.Steps >= def.Threshold && !seen[r.Day] {
				seen[r.Day] = true
				state.Days = append(state.Days, r.Day)
			}
		}
		state.Progress = len(state.Days)
		state.Need = def.Secondary
		state.Unlocked = len(state.Days) >= def.Secondary

	case RuleOnceDistance:
		for _, r := range records {
			if r.Type != SportCycling {
				continue
			}
			if r.DistanceM >= def.Threshold {
				state.Days = append(state.Days, r.Day)
			}
		}
		state.Progress = len(state.Days)
		state.Unlocked = len(state.Days) > 0

	case RuleCumCountDist:
		count := 0
		for _, r := range records {
			if r.Type != SportCycling {
				continue
			}
			if r.DistanceM >= def.Threshold {
				count++
				state.Days = append(state.Days, r.Day)
			}
		}
		state.Progress = count
		state.Need = def.Secondary
		state.Unlocked = count >= def.Secondary

	case RulePaceThreshold:
		limit := EffectivePaceThreshold(def.StdPaceS, profile)
		for _, r := range records {
			if r.Type != SportRunning {
				continue
			}
			if pace := r.PaceSecPerKm(); pace > 0 && pace <= limit {
				state.Days = append(state.Days, r.Day)
			}
		}
		state.Progress = len(state.Days)
		state.Unlocked = len(state.Days) > 0

	case RuleContinuousDist:
		for _, r := range records {
			if r.Type == SportRunning && r.DistanceM >= def.Threshold && (r.Continuous || r.DistanceM >= def.Threshold) {
				state.Days = append(state.Days, r.Day)
			}
		}
		state.Progress = len(state.Days)
		state.Unlocked = len(state.Days) > 0

	case RuleCumDistance:
		total := 0
		for _, r := range records {
			if r.Type == SportRunning {
				total += r.DistanceM
			}
		}
		state.Progress = total
		state.Unlocked = total >= def.Threshold

	case RuleCombo:
		limit := EffectivePaceThreshold(def.StdPaceS, profile)
		for _, r := range records {
			if r.Type != SportRunning || r.DistanceM < def.Threshold {
				continue
			}
			if pace := r.PaceSecPerKm(); pace > 0 && pace <= limit {
				state.Days = append(state.Days, r.Day)
			}
		}
		state.Progress = len(state.Days)
		state.Unlocked = len(state.Days) > 0
	}
	return state
}

// EvaluateAll 返回全部 33 个成就状态。
func EvaluateAll(records []SportRecord, profile AthleteProfile) []AchievementState {
	defs := AchievementDefs()
	out := make([]AchievementState, 0, len(defs))
	for _, def := range defs {
		out = append(out, Evaluate(records, def, profile))
	}
	return out
}

// TotalAchievementPoints 返回 33 个成就的积分总和。
func TotalAchievementPoints() int {
	total := 0
	for _, def := range AchievementDefs() {
		total += def.Points
	}
	return total
}

func clampFloat(v, low, high float64) float64 {
	if v < low {
		return low
	}
	if v > high {
		return high
	}
	return v
}