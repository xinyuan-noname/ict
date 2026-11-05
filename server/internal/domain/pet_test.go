package domain

import (
	"testing"
	"time"
)

func TestNewPetInitials(t *testing.T) {
	now := time.Date(2026, 11, 2, 3, 0, 0, 0, time.UTC)
	pet, err := NewPet("u1", SpeciesCat, "咪咪", now)
	if err != nil {
		t.Fatal(err)
	}
	if pet.Level != 1 || pet.Satiety != 60 || pet.Mood != 60 || pet.Intimacy != 10 {
		t.Fatalf("unexpected initials: %+v", pet)
	}
	if _, err := NewPet("u1", "dragon", "x", now); err == nil {
		t.Fatal("unknown species must fail")
	}
	if _, err := NewPet("u1", SpeciesDog, "", now); err == nil {
		t.Fatal("empty name must fail")
	}
}

func TestFeedAndLevelUp(t *testing.T) {
	pet, _ := NewPet("u1", SpeciesDog, "旺财", time.Now())
	for i := 0; i < 10; i++ {
		Feed(&pet, 20, 10)
	}
	if pet.Level < 2 {
		t.Fatalf("should level up after 100 exp, got level %d", pet.Level)
	}
	if pet.Satiety > 100 {
		t.Fatalf("satiety must clamp: %d", pet.Satiety)
	}
	pet.Level = PetMaxLevel
	pet.Exp = 99
	Feed(&pet, 0, 50)
	if pet.Level != PetMaxLevel || pet.Exp > 99 {
		t.Fatalf("max level must cap: L%d exp%d", pet.Level, pet.Exp)
	}
}

func TestDecay(t *testing.T) {
	now := time.Date(2026, 11, 2, 3, 0, 0, 0, time.UTC)
	pet, _ := NewPet("u1", SpeciesParrot, "小绿", now)
	pet.LastDecayDay = "2026-10-30"
	if !ApplyDecay(&pet, now) {
		t.Fatal("decay should apply")
	}
	if pet.Satiety != 30 { // 60 - 3*10（10-30 → 11-02 共 3 天）
		t.Fatalf("want 40, got %d", pet.Satiety)
	}
	if pet.LastDecayDay != "2026-11-02" {
		t.Fatalf("lastDecayDay must update: %s", pet.LastDecayDay)
	}
	if ApplyDecay(&pet, now) {
		t.Fatal("same day decay must be no-op")
	}
	pet.Satiety = 5
	pet.LastDecayDay = "2026-10-20"
	ApplyDecay(&pet, now)
	if pet.Satiety != 0 {
		t.Fatalf("satiety must clamp at 0, got %d", pet.Satiety)
	}
}

func TestAllocateAndRename(t *testing.T) {
	now := time.Date(2026, 11, 2, 3, 0, 0, 0, time.UTC)
	pet, _ := NewPet("u1", SpeciesCat, "咪咪", now)
	if err := Allocate(&pet, "str"); err != ErrPetNoPoints {
		t.Fatalf("want no points, got %v", err)
	}
	pet.Points = 2
	if err := Allocate(&pet, "str"); err != nil || pet.Str != 1 || pet.Points != 1 {
		t.Fatalf("allocate failed: %v %+v", err, pet)
	}
	pet.Str = PetMaxAttr
	pet.Points = 1
	if err := Allocate(&pet, "str"); err != ErrPetAttrCap {
		t.Fatalf("want attr cap, got %v", err)
	}

	if err := Rename(&pet, "新名字", now); err != nil {
		t.Fatal(err)
	}
	if err := Rename(&pet, "再改", now); err != nil {
		t.Fatal(err)
	}
	if err := Rename(&pet, "三改", now); err != nil {
		t.Fatal(err)
	}
	if err := Rename(&pet, "四次", now); err != ErrPetRenameCap {
		t.Fatalf("want rename cap, got %v", err)
	}
	next := now.AddDate(0, 0, 1)
	if err := Rename(&pet, "次日", next); err != nil {
		t.Fatalf("next day should reset counter: %v", err)
	}
}

func TestItemCatalog(t *testing.T) {
	items := ItemCatalog()
	if len(items) != 5 {
		t.Fatalf("want 5 items, got %d", len(items))
	}
	kinds := map[string]int{}
	for _, it := range items {
		kinds[it.Kind]++
		if it.Price <= 0 {
			t.Fatalf("price must be positive: %+v", it)
		}
		if it.Effects.Points <= 0 {
			t.Fatalf("every item should grant points now: %+v", it)
		}
	}
	if kinds["food"] != 3 || kinds["toy"] != 2 || kinds["tool"] != 0 {
		t.Fatalf("unexpected kinds: %v", kinds)
	}
}

func TestInviteCode(t *testing.T) {
	now := time.Now()
	invite, err := NewInviteCode("u1", now)
	if err != nil {
		t.Fatal(err)
	}
	if len(invite.Code) != 6 || !ValidInviteCode(invite.Code) {
		t.Fatalf("invalid code: %s", invite.Code)
	}
	if invite.ExpiresAt.Sub(now) != 24*time.Hour {
		t.Fatal("validity must be 24h")
	}
	if ValidInviteCode("abc") || ValidInviteCode("ABC-12") {
		t.Fatal("invalid codes must be rejected")
	}
}

func TestPkScoreAndSettle(t *testing.T) {
	if got := PkScore(1, 100); got != 100 {
		t.Fatalf("perfect score should be 100, got %v", got)
	}
	if got := PkScore(0, 0); got != 0 {
		t.Fatalf("zero score should be 0, got %v", got)
	}
	if got := PkScore(0.5, 50); got != 50 {
		t.Fatalf("half/half should be 50, got %v", got)
	}
	if got := PkScore(2, 200); got != 100 {
		t.Fatalf("clamp: got %v", got)
	}

	if SettlePk(80, 70, 1, 0.9) != "a" {
		t.Fatal("higher score wins")
	}
	if SettlePk(70, 80, 0.9, 1) != "b" {
		t.Fatal("higher score wins (b)")
	}
	if SettlePk(80, 80, 0.9, 0.95) != "b" {
		t.Fatal("tie on score should compare rate")
	}
	if SettlePk(80, 80, 0.9, 0.9) != PkDraw {
		t.Fatal("full tie should draw")
	}
}