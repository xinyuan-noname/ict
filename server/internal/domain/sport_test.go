package domain

import (
	"math"
	"testing"
)

func profileA() AthleteProfile { return AthleteProfile{Gender: GenderMale, Age: 30, WeightG: 70000, HeightCM: 175} }
func profileB() AthleteProfile { return AthleteProfile{Gender: GenderFemale, Age: 45, WeightG: 60000, HeightCM: 165} }
func profileC() AthleteProfile { return AthleteProfile{Gender: GenderMale, Age: 20, WeightG: 85000, HeightCM: 178} }

func TestAchievementCatalog(t *testing.T) {
	defs := AchievementDefs()
	if len(defs) != 33 {
		t.Fatalf("want 33 achievements, got %d", len(defs))
	}
	groups := map[string]int{}
	for _, d := range defs {
		groups[d.Group]++
		if d.Name == "" || d.Desc == "" || d.Icon == "" {
			t.Fatalf("incomplete def: %+v", d)
		}
	}
	if groups[GroupWalking] != 9 || groups[GroupCycling] != 4 || groups[GroupPace] != 7 ||
		groups[GroupDistance] != 7 || groups[GroupCombo] != 6 {
		t.Fatalf("unexpected group counts: %v", groups)
	}
	if got := TotalAchievementPoints(); got != 1560 {
		t.Fatalf("total points must be 1560, got %d", got)
	}
}

func TestPaceLimit(t *testing.T) {
	a := math.Round(PaceLimitSec(profileA()))
	if a < 255 || a > 270 {
		t.Fatalf("A PLP out of range: %v", a)
	}
	// 女性基准更高（更慢），20 岁更年轻（更快）
	if PaceLimitSec(profileB()) <= PaceLimitSec(profileA()) {
		t.Fatal("female base pace should be slower (larger seconds)")
	}
	// 同体重同身高下，年轻人更快（秒数更小）
	young := profileA()
	young.Age = 20
	if PaceLimitSec(young) >= PaceLimitSec(profileA()) {
		t.Fatal("younger athlete should have faster limit with same body")
	}
	// 缩放系数钳制区间
	for _, p := range []AthleteProfile{profileA(), profileB(), profileC()} {
		s := PaceScale(p)
		if s < 0.92 || s > 1.12 {
			t.Fatalf("scale out of clamp: %v", s)
		}
	}
}

func TestEffectivePaceThresholdRoundsTo5s(t *testing.T) {
	for std := 210; std <= 300; std += 10 {
		got := EffectivePaceThreshold(std, profileA())
		if got%5 != 0 {
			t.Fatalf("threshold %d not multiple of 5", got)
		}
		if got < int(float64(std)*0.92)-5 || got > int(float64(std)*1.12)+5 {
			t.Fatalf("threshold %d out of clamp range", got)
		}
	}
}

func TestEvaluateWalkingAndCycling(t *testing.T) {
	records := []SportRecord{
		{Type: SportWalking, Day: "2026-08-30", Steps: 15000},
		{Type: SportWalking, Day: "2026-09-01", Steps: 15000},
		{Type: SportWalking, Day: "2026-09-01", Steps: 15000}, // 同日去重
		{Type: SportCycling, Day: "2026-09-02", DistanceM: 12000, DurationS: 2400},
	}
	defs := map[string]AchievementDef{}
	for _, d := range AchievementDefs() {
		defs[d.ID] = d
	}

	st := Evaluate(records, defs["walk_15k"], profileA())
	if !st.Unlocked || len(st.Days) != 2 {
		t.Fatalf("walk_15k: %+v", st)
	}
	st = Evaluate(records, defs["walk_15k_3d"], profileA())
	if st.Unlocked || st.Progress != 2 || st.Need != 3 {
		t.Fatalf("cum days should be 2/3 and locked: %+v", st)
	}
	st = Evaluate(records, defs["cycle_10k"], profileA())
	if !st.Unlocked {
		t.Fatalf("cycle 10k should unlock: %+v", st)
	}
}

func TestEvaluatePaceAndCombo(t *testing.T) {
	// 4'26" ≈ 266 秒/km，10km
	records := []SportRecord{
		{Type: SportRunning, Day: "2026-10-25", DistanceM: 10000, DurationS: 2660, Continuous: true},
	}
	defs := map[string]AchievementDef{}
	for _, d := range AchievementDefs() {
		defs[d.ID] = d
	}
	if st := Evaluate(records, defs["pace_440"], profileA()); !st.Unlocked {
		t.Fatalf("pace 4:40 should unlock: %+v", st)
	}
	// 4:26"（266 秒）在 A 组：4:40 阈值 280×1.005≈281 → 解锁；4:20 阈值 260 → 仍锁定
	if st := Evaluate(records, defs["pace_420"], profileA()); st.Unlocked {
		t.Fatalf("pace 4:20 should stay locked for 266s: %+v", st)
	}
	if st := Evaluate(records, defs["pace_400"], profileA()); st.Unlocked {
		t.Fatalf("pace 4:00 should stay locked: %+v", st)
	}
	if st := Evaluate(records, defs["run_cont_10k"], profileA()); !st.Unlocked {
		t.Fatalf("continuous 10k should unlock: %+v", st)
	}
	if st := Evaluate(records, defs["combo_5k_430"], profileA()); !st.Unlocked {
		t.Fatalf("combo 5k@4:30 should unlock: %+v", st)
	}
}

func TestEvaluateCumDistance(t *testing.T) {
	records := []SportRecord{
		{Type: SportRunning, Day: "2026-10-14", DistanceM: 4930, DurationS: 1500},
		{Type: SportRunning, Day: "2026-10-14", DistanceM: 8550, DurationS: 2600},
	}
	defs := map[string]AchievementDef{}
	for _, d := range AchievementDefs() {
		defs[d.ID] = d
	}
	st := Evaluate(records, defs["run_total_10k"], profileA())
	if !st.Unlocked || st.Progress != 13480 {
		t.Fatalf("cum distance: %+v", st)
	}
	if st := Evaluate(records, defs["run_total_50k"], profileA()); st.Unlocked {
		t.Fatal("50k must stay locked")
	}
}

func TestEvaluateAllCount(t *testing.T) {
	all := EvaluateAll(nil, profileA())
	if len(all) != 33 {
		t.Fatalf("want 33 states, got %d", len(all))
	}
	for _, st := range all {
		if st.Unlocked {
			t.Fatalf("empty records must not unlock %s", st.DefID)
		}
	}
}

func TestPaceSecPerKm(t *testing.T) {
	r := SportRecord{DistanceM: 5000, DurationS: 1500}
	if got := r.PaceSecPerKm(); got != 300 {
		t.Fatalf("want 300, got %d", got)
	}
	if (SportRecord{}).PaceSecPerKm() != 0 {
		t.Fatal("empty record pace must be 0")
	}
}