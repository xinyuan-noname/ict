package domain

import (
	"testing"
	"time"
)

func TestCheckInPointsBoundary(t *testing.T) {
	cases := map[int]int{1: 10, 2: 12, 3: 14, 11: 30, 30: 30, 365: 30}
	for streak, want := range cases {
		if got := CheckInPoints(streak); got != want {
			t.Errorf("streak %d: want %d, got %d", streak, want, got)
		}
	}
	if CheckInPoints(0) != 10 {
		t.Fatal("streak 0 must be treated as 1")
	}
}

func TestStreakAfter(t *testing.T) {
	if got := StreakAfter("", 0, "2026-11-02"); got != 1 {
		t.Fatalf("first ever: want 1, got %d", got)
	}
	if got := StreakAfter("2026-11-01", 3, "2026-11-02"); got != 4 {
		t.Fatalf("consecutive: want 4, got %d", got)
	}
	if got := StreakAfter("2026-10-31", 3, "2026-11-02"); got != 1 {
		t.Fatalf("missed day must reset: want 1, got %d", got)
	}
	if got := StreakAfter("2026-11-02", 3, "2026-11-02"); got != 3 {
		t.Fatalf("same day: want 3, got %d", got)
	}
	if got := StreakAfter("2026-11-01", 365, "2026-11-02"); got != 365 {
		t.Fatalf("streak cap: want 365, got %d", got)
	}
}

func TestBusinessDateUsesShanghai(t *testing.T) {
	utc := time.Date(2026, 11, 1, 17, 0, 0, 0, time.UTC) // 上海次日 01:00
	if got := BusinessDate(utc); got != "2026-11-02" {
		t.Fatalf("want 2026-11-02, got %s", got)
	}
	utc = time.Date(2026, 11, 1, 15, 59, 0, 0, time.UTC) // 上海 23:59
	if got := BusinessDate(utc); got != "2026-11-01" {
		t.Fatalf("want 2026-11-01, got %s", got)
	}
}

func TestApplyCap(t *testing.T) {
	if applied, capped := ApplyCap(0, 10); applied != 10 || capped {
		t.Fatalf("normal: %d %v", applied, capped)
	}
	if applied, capped := ApplyCap(PointsCap-5, 10); applied != 5 || !capped {
		t.Fatalf("cap: %d %v", applied, capped)
	}
	if applied, capped := ApplyCap(PointsCap, 10); applied != 0 || !capped {
		t.Fatalf("full: %d %v", applied, capped)
	}
	if applied, capped := ApplyCap(100, 0); applied != 0 || capped {
		t.Fatalf("zero gain: %d %v", applied, capped)
	}
}

func TestIdempotencyAndFrameIDValidation(t *testing.T) {
	valid := []string{"abcd1234", strings_Repeat("a", 64)}
	for _, v := range valid {
		if !ValidIdempotencyKey(v) {
			t.Errorf("%q should be valid", v)
		}
	}
	invalid := []string{"short", strings_Repeat("a", 65), "has space!", "中文abcdefgh"}
	for _, v := range invalid {
		if ValidIdempotencyKey(v) {
			t.Errorf("%q should be invalid", v)
		}
	}
	if !ValidFrameID("frame_pixel_cat") || ValidFrameID("cat") {
		t.Fatal("frame id validation mismatch")
	}
}

func strings_Repeat(s string, n int) string {
	out := make([]byte, 0, len(s)*n)
	for i := 0; i < n; i++ {
		out = append(out, s...)
	}
	return string(out)
}

func TestDefaultCatalog(t *testing.T) {
	catalog := DefaultCatalog()
	if len(catalog) != 6 {
		t.Fatalf("want 6 frames, got %d", len(catalog))
	}
	if catalog[0].Price != 0 {
		t.Fatal("first frame must be free")
	}
	if !ValidFrameID(catalog[0].ID) {
		t.Fatal("catalog frame id invalid")
	}
}