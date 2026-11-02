package domain

import (
	"testing"
	"time"
)

func TestBuiltinUnits(t *testing.T) {
	units := BuiltinUnits("u1")
	if len(units) != 3 {
		t.Fatalf("want 3 builtin units, got %d", len(units))
	}
	if units[0].ML != 1 || units[1].ML != 250 || units[2].ML != 550 {
		t.Fatalf("unexpected capacities: %+v", units)
	}
	if units[2].Name != "农夫山泉" {
		t.Fatalf("bottle preset name mismatch: %s", units[2].Name)
	}
}

func TestUnitConvertAndDisplay(t *testing.T) {
	cup := Unit{Name: "杯", ML: 250}
	if ConvertToML(3, cup) != 750 {
		t.Fatalf("3 cups should be 750ml")
	}
	if DisplayAmount(750, cup) != 3 {
		t.Fatalf("750ml should be 3 cups")
	}
	if DisplayAmount(760, cup) != 3 {
		t.Fatalf("760ml with rounding should be 3 cups, got %d", DisplayAmount(760, cup))
	}
	bottle := Unit{Name: "农夫山泉", ML: 550}
	if DisplayAmount(1100, bottle) != 2 {
		t.Fatalf("1100ml should be 2 bottles")
	}
	if ConvertToML(0, cup) != 0 || ConvertToML(2, Unit{ML: 0}) != 0 {
		t.Fatal("invalid inputs must return 0")
	}
}

func TestUnitValidation(t *testing.T) {
	if !ValidUnitName("农夫山泉") || ValidUnitName("") || ValidUnitName("十二个字十二个字十二个字三") {
		t.Fatal("unit name validation mismatch")
	}
	if !ValidUnitCapacity(50) || !ValidUnitCapacity(2000) || ValidUnitCapacity(49) || ValidUnitCapacity(2001) {
		t.Fatal("unit capacity validation mismatch")
	}
}

func TestNormalizeSlots(t *testing.T) {
	slots, ok := NormalizeSlots([]string{"night", "morning", "morning"})
	if !ok || len(slots) != 2 || slots[0] != "morning" || slots[1] != "night" {
		t.Fatalf("normalize failed: %v %v", slots, ok)
	}
	if _, ok := NormalizeSlots([]string{"dawn"}); ok {
		t.Fatal("unknown slot must fail")
	}
	if _, ok := NormalizeSlots(nil); ok {
		t.Fatal("empty slots must fail")
	}
}

func TestBuildDoseViews(t *testing.T) {
	now := time.Date(2026, 11, 2, 3, 0, 0, 0, time.UTC) // 上海 11:00 → noon 之前
	items := []MedicationItem{{
		ItemID: "med_1", Name: "维生素D", Dosage: "1粒",
		Slots: []string{"morning", "noon"}, Status: MedActive, StartDay: "2026-11-01",
	}}
	doses := []MedDose{{DoseID: "dose_1", ItemID: "med_1", Day: "2026-11-02", Slot: "morning", TakenAt: now, Late: false}}

	views := BuildDoseViews(items, doses, "2026-11-02", now)
	if len(views) != 2 {
		t.Fatalf("want 2 views, got %d", len(views))
	}
	if views[0].Status != "taken" || views[0].DoseID != "dose_1" {
		t.Fatalf("morning should be taken: %+v", views[0])
	}
	if views[1].Status != "pending" {
		t.Fatalf("noon should be pending: %+v", views[1])
	}

	// 第 3 天回看：未打的时段应为 missed
	later := time.Date(2026, 11, 4, 9, 0, 0, 0, time.UTC)
	past := BuildDoseViews(items, doses, "2026-11-02", later)
	if past[1].Status != "missed" {
		t.Fatalf("past pending slot should be missed: %+v", past[1])
	}
	// 已停用条目不展示
	stopped := []MedicationItem{{ItemID: "med_2", Slots: []string{"morning"}, Status: MedStopped}}
	if len(BuildDoseViews(stopped, nil, "2026-11-02", now)) != 0 {
		t.Fatal("stopped item must not appear")
	}
}

func TestMedicationWeekRate(t *testing.T) {
	views := map[string][]DoseView{
		"2026-11-01": {{Status: "taken"}, {Status: "missed"}},
		"2026-11-02": {{Status: "taken"}, {Status: "taken"}},
		"2026-11-03": {},
	}
	rate := MedicationWeekRate(views)
	// (1/2 + 2/2) / 2 = 0.75，空日不参与
	if rate < 0.74 || rate > 0.76 {
		t.Fatalf("want 0.75, got %v", rate)
	}
	if MedicationWeekRate(map[string][]DoseView{}) != 0 {
		t.Fatal("empty week rate must be 0")
	}
}

func TestIsLate(t *testing.T) {
	now := time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC) // 上海 20:00 → night
	if !IsLate("2026-11-01", "morning", now) {
		t.Fatal("previous day should be late")
	}
	if !IsLate("2026-11-02", "morning", now) {
		t.Fatal("earlier slot same day should be late")
	}
	if IsLate("2026-11-02", "night", now) {
		t.Fatal("current slot should not be late")
	}
}