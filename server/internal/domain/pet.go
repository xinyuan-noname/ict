package domain

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
)

const (
	SpeciesCat    = "cat"
	SpeciesDog    = "dog"
	SpeciesParrot = "parrot"

	PetMaxLevel    = 50
	PetMaxAttr     = 50
	PetMaxPoints   = 200
	PetRenameLimit = 3
)

type Pet struct {
	PetID       string    `json:"petId"`
	UserID      string    `json:"userId"`
	Species     string    `json:"species"`
	Name        string    `json:"name"`
	Level       int       `json:"level"`
	Exp         int       `json:"exp"`
	Satiety     int       `json:"satiety"`
	Mood        int       `json:"mood"`
	Intimacy    int       `json:"intimacy"`
	Points      int       `json:"points"`
	Str         int       `json:"str"`
	Agi         int       `json:"agi"`
	Wis         int       `json:"wis"`
	LastDecayDay string   `json:"lastDecayDay"`
	RenameDay   string    `json:"renameDay"`
	RenameCount int       `json:"renameCount"`
	CreatedAt   time.Time `json:"createdAt"`
}

var (
	ErrPetExists    = errors.New("pet already exists")
	ErrPetMissing   = errors.New("pet missing")
	ErrPetAttrCap   = errors.New("attribute cap")
	ErrPetNoPoints  = errors.New("no points")
	ErrPetRenameCap = errors.New("rename cap")
)

func ValidSpecies(s string) bool {
	return s == SpeciesCat || s == SpeciesDog || s == SpeciesParrot
}

func ValidPetName(name string) bool {
	r := []rune(strings.TrimSpace(name))
	if len(r) < 1 || len(r) > 12 {
		return false
	}
	for _, ch := range r {
		if ch < 0x20 {
			return false
		}
	}
	return true
}

// NewPet 创建初始属性（spec 3.2）。
func NewPet(userID, species, name string, now time.Time) (Pet, error) {
	if !ValidSpecies(species) || !ValidPetName(name) {
		return Pet{}, errors.New("invalid species or name")
	}
	day := BusinessDate(now)
	return Pet{
		PetID: fmt.Sprintf("pet_%d", now.UnixNano()), UserID: userID, Species: species,
		Name: strings.TrimSpace(name), Level: 1, Exp: 0, Satiety: 60, Mood: 60, Intimacy: 10,
		Points: 0, LastDecayDay: day, RenameDay: day, CreatedAt: now,
	}, nil
}

// ApplyDecay 惰性衰减：每过一天饱食度 -10；返回是否变化。
func ApplyDecay(p *Pet, now time.Time) bool {
	today := BusinessDate(now)
	if p.LastDecayDay == "" {
		p.LastDecayDay = today
		return true
	}
	start, err1 := ParseBusinessDate(p.LastDecayDay)
	end, err2 := ParseBusinessDate(today)
	if err1 != nil || err2 != nil || !end.After(start) {
		return false
	}
	days := int(end.Sub(start).Hours() / 24)
	if days <= 0 {
		return false
	}
	p.Satiety = clampInt(p.Satiety-days*10, 0, 100)
	p.LastDecayDay = today
	return true
}

// Feed 应用食物效果并可能升级。
func Feed(p *Pet, satietyDelta, expDelta int) (leveledUp bool) {
	p.Satiety = clampInt(p.Satiety+satietyDelta, 0, 100)
	p.Exp += expDelta
	for p.Exp >= 100 && p.Level < PetMaxLevel {
		p.Exp -= 100
		p.Level++
		leveledUp = true
	}
	if p.Level >= PetMaxLevel {
		p.Exp = clampInt(p.Exp, 0, 99)
	}
	p.Intimacy = clampInt(p.Intimacy+1, 0, 100)
	return leveledUp
}

// Play 应用玩具效果。
func Play(p *Pet, moodDelta, intimacyDelta int) {
	p.Mood = clampInt(p.Mood+moodDelta, 0, 100)
	p.Intimacy = clampInt(p.Intimacy+intimacyDelta, 0, 100)
}

// Allocate 分配 1 点到指定属性。
func Allocate(p *Pet, attr string) error {
	if p.Points <= 0 {
		return ErrPetNoPoints
	}
	switch attr {
	case "str":
		if p.Str >= PetMaxAttr {
			return ErrPetAttrCap
		}
		p.Str++
	case "agi":
		if p.Agi >= PetMaxAttr {
			return ErrPetAttrCap
		}
		p.Agi++
	case "wis":
		if p.Wis >= PetMaxAttr {
			return ErrPetAttrCap
		}
		p.Wis++
	default:
		return ErrPetAttrCap
	}
	p.Points--
	return nil
}

// Rename 改名，每业务日最多 3 次。
func Rename(p *Pet, name string, now time.Time) error {
	if !ValidPetName(name) {
		return errors.New("invalid name")
	}
	today := BusinessDate(now)
	if p.RenameDay != today {
		p.RenameDay = today
		p.RenameCount = 0
	}
	if p.RenameCount >= PetRenameLimit {
		return ErrPetRenameCap
	}
	p.Name = strings.TrimSpace(name)
	p.RenameCount++
	return nil
}

type ItemEffects struct {
	Satiety  int `json:"satiety,omitempty"`
	Mood     int `json:"mood,omitempty"`
	Exp      int `json:"exp,omitempty"`
	Intimacy int `json:"intimacy,omitempty"`
	Points   int `json:"points,omitempty"`
}

type ItemDef struct {
	ItemID  string      `json:"itemId"`
	Name    string      `json:"name"`
	Kind    string      `json:"kind"` // food|tool|toy
	Price   int         `json:"price"`
	Effects ItemEffects `json:"effects"`
	Status  string      `json:"status"`
}

func ItemCatalog() []ItemDef {
	return []ItemDef{
		{ItemID: "item_fish", Name: "小鱼干", Kind: "food", Price: 30, Effects: ItemEffects{Satiety: 20, Exp: 10, Points: 2}, Status: "on_sale"},
		{ItemID: "item_carrot", Name: "胡萝卜", Kind: "food", Price: 20, Effects: ItemEffects{Satiety: 15, Exp: 5, Points: 1}, Status: "on_sale"},
		{ItemID: "item_nut", Name: "坚果", Kind: "food", Price: 25, Effects: ItemEffects{Satiety: 15, Exp: 8, Points: 1}, Status: "on_sale"},
		{ItemID: "item_ball", Name: "毛线球", Kind: "toy", Price: 40, Effects: ItemEffects{Mood: 20, Intimacy: 3, Points: 1}, Status: "on_sale"},
		{ItemID: "item_whistle", Name: "训练哨", Kind: "toy", Price: 80, Effects: ItemEffects{Mood: 10, Intimacy: 8, Points: 2}, Status: "on_sale"},
	}
}

const (
	FriendPending  = "pending"
	FriendAccepted = "accepted"
	FriendBlocked  = "blocked"
	FriendLimit    = 50
)

type FriendEdge struct {
	UserID    string    `json:"userId"`
	FriendID  string    `json:"friendId"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type InviteCode struct {
	Code      string    `json:"code"`
	UserID    string    `json:"userId"`
	ExpiresAt time.Time `json:"expiresAt"`
	Used      bool      `json:"used"`
}

// NewInviteCode 生成 6 位大写字母数字，24h 有效。
func NewInviteCode(userID string, now time.Time) (InviteCode, error) {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return InviteCode{}, err
	}
	out := make([]byte, 6)
	for i, b := range buf {
		out[i] = alphabet[int(b)%len(alphabet)]
	}
	return InviteCode{Code: string(out), UserID: userID, ExpiresAt: now.Add(24 * time.Hour)}, nil
}

func ValidInviteCode(code string) bool {
	if len(code) != 6 {
		return false
	}
	for i := 0; i < len(code); i++ {
		c := code[i]
		if !(c >= 'A' && c <= 'Z' || c >= '0' && c <= '9') {
			return false
		}
	}
	return true
}

const (
	PkPending = "pending"
	PkSettled = "settled"
	PkExpired = "expired"
	PkDraw    = "draw"
	PkLimit   = 3
)

type PkMatch struct {
	PkID        string     `json:"pkId"`
	Challenger  string     `json:"challengerId"`
	Opponent    string     `json:"opponentId"`
	State       string     `json:"state"`
	ScoreA      float64    `json:"scoreA"`
	ScoreB      float64    `json:"scoreB"`
	Winner      string     `json:"winner"`
	CreatedAt   time.Time  `json:"createdAt"`
	ExpiresAt   time.Time  `json:"expiresAt"`
	SettledAt   *time.Time `json:"settledAt,omitempty"`
}

// PkScore 计分：达成率×60 + 亲密度×40，保留两位。
func PkScore(achievementRate float64, intimacy int) float64 {
	rate := math.Max(0, math.Min(1, achievementRate))
	rel := math.Max(0, math.Min(100, float64(intimacy))) / 100
	return math.Round((rate*60+rel*40)*100) / 100
}

// SettlePk 判定胜负：分数高者胜；同分比达成率；仍同则平局。
func SettlePk(scoreA, scoreB, rateA, rateB float64) string {
	if math.Abs(scoreA-scoreB) > 1e-9 {
		if scoreA > scoreB {
			return "a"
		}
		return "b"
	}
	if math.Abs(rateA-rateB) > 1e-9 {
		if rateA > rateB {
			return "a"
		}
		return "b"
	}
	return PkDraw
}

func clampInt(v, low, high int) int {
	if v < low {
		return low
	}
	if v > high {
		return high
	}
	return v
}