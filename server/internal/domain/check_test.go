package domain

import "testing"

func baseProfile() HealthProfile {
	return HealthProfile{UserID: "u1", HeightCM: 175, WeightG: 70000, Age: 30, Gender: GenderMale}
}

func TestWaterGoalBaseline(t *testing.T) {
	ml, err := WaterGoalML(baseProfile())
	if err != nil {
		t.Fatal(err)
	}
	if ml < 1200 || ml > 3500 || ml%50 != 0 {
		t.Fatalf("goal out of expected shape: %d", ml)
	}
}

func TestWaterGoalMonotonicWithWeight(t *testing.T) {
	light := baseProfile()
	light.WeightG = 55000
	heavy := baseProfile()
	heavy.WeightG = 95000
	a, _ := WaterGoalML(light)
	b, _ := WaterGoalML(heavy)
	if b <= a {
		t.Fatalf("heavier should need more water: %d vs %d", a, b)
	}
}

func TestWaterGoalGenderAndAge(t *testing.T) {
	male := baseProfile()
	female := baseProfile()
	female.Gender = GenderFemale
	m, _ := WaterGoalML(male)
	f, _ := WaterGoalML(female)
	if f > m {
		t.Fatalf("female coefficient should not exceed male: %d vs %d", f, m)
	}

	young := baseProfile()
	older := baseProfile()
	older.Age = 75
	y, _ := WaterGoalML(young)
	o, _ := WaterGoalML(older)
	if o > y {
		t.Fatalf("older coefficient should not exceed young: %d vs %d", o, y)
	}
}

func TestWaterGoalTeenBounds(t *testing.T) {
	teen := baseProfile()
	teen.Age = 15
	teen.HeightCM = 150
	teen.WeightG = 40000
	ml, err := WaterGoalML(teen)
	if err != nil {
		t.Fatal(err)
	}
	if ml < WaterMLMinTeen || ml > WaterMLMaxTeen {
		t.Fatalf("teen goal must be within 1000..3000, got %d", ml)
	}
}

func TestWaterGoalExtremesClamped(t *testing.T) {
	tall := baseProfile()
	tall.HeightCM = 250
	tall.WeightG = 300000
	tall.Age = 14
	ml, err := WaterGoalML(tall)
	if err != nil {
		t.Fatal(err)
	}
	if ml > WaterMLMaxTeen {
		t.Fatalf("should clamp to teen max, got %d", ml)
	}

	small := baseProfile()
	small.HeightCM = 100
	small.WeightG = 20000
	ml, err = WaterGoalML(small)
	if err != nil {
		t.Fatal(err)
	}
	if ml < WaterMLMinAdult {
		t.Fatalf("should clamp to adult min, got %d", ml)
	}
}

func TestWaterGoalValidation(t *testing.T) {
	cases := []HealthProfile{
		{},
		{HeightCM: 90, WeightG: 70000, Age: 30, Gender: GenderMale},
		{HeightCM: 175, WeightG: 5000, Age: 30, Gender: GenderMale},
		{HeightCM: 175, WeightG: 70000, Age: 10, Gender: GenderMale},
		{HeightCM: 175, WeightG: 70000, Age: 30, Gender: "unknown"},
	}
	for i, p := range cases {
		if _, err := WaterGoalML(p); err == nil {
			t.Errorf("case %d should fail", i)
		}
	}
}

func TestBuildWeekStatsUsesRecordedDays(t *testing.T) {
	days := []DaySummary{
		{Day: "2026-11-02", TotalML: 2000, TargetML: 2000, Achieved: true},
		{Day: "2026-11-03", TotalML: 1000, TargetML: 2000, Achieved: false},
		{Day: "2026-11-04", TotalML: 0, TargetML: 2000, Achieved: false},
	}
	stats := BuildWeekStats("2026-11-02", days, "2026-11-04")
	if stats.AverageML == nil || *stats.AverageML != 1500 {
		t.Fatalf("average must be recorded-day average 1500, got %v", stats.AverageML)
	}
	if stats.AchievedDays != 1 || stats.ElapsedDays != 3 {
		t.Fatalf("unexpected counts: %+v", stats)
	}
	if stats.AchievementRate < 0.33 || stats.AchievementRate > 0.34 {
		t.Fatalf("rate should be 1/3: %v", stats.AchievementRate)
	}
}

func TestBuildWeekStatsEmptyWeek(t *testing.T) {
	stats := BuildWeekStats("2026-11-02", []DaySummary{{Day: "2026-11-02", TargetML: 2000}}, "2026-11-02")
	if stats.AverageML != nil {
		t.Fatal("empty week average must be nil, not 0")
	}
}

func TestBuildDaySummary(t *testing.T) {
	records := []WaterRecord{
		{Day: "2026-11-02", ML: 250},
		{Day: "2026-11-02", ML: 500},
		{Day: "2026-11-01", ML: 100},
	}
	d := BuildDaySummary("2026-11-02", records, 2000)
	if d.TotalML != 750 || d.Achieved {
		t.Fatalf("unexpected day summary: %+v", d)
	}
}

func TestWeekStartOf(t *testing.T) {
	start, err := WeekStartOf("2026-11-04") // Wednesday
	if err != nil {
		t.Fatal(err)
	}
	if start != "2026-11-02" {
		t.Fatalf("want Monday 2026-11-02, got %s", start)
	}
	start, _ = WeekStartOf("2026-11-02")
	if start != "2026-11-02" {
		t.Fatalf("Monday should map to itself, got %s", start)
	}
}