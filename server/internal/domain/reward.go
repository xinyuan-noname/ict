package domain

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

// 签到与积分规则版本。
const (
	RuleVersion     = "checkin-v1"
	BaseCheckIn     = 10
	StepPoints      = 2
	MaxCheckIn      = 30
	MaxStreakDays   = 365
	PointsCap       = 1_000_000
	BusinessTZName  = "Asia/Shanghai"
	FrameCanvas     = 96
	FrameGrid       = 24
	FramePaletteMax = 16
)

// BusinessZone 固定 +08:00（中国无夏令时，避免依赖系统 tzdata）。
var BusinessZone = time.FixedZone(BusinessTZName, 8*3600)

func BusinessDate(t time.Time) string { return t.In(BusinessZone).Format("2006-01-02") }

func ParseBusinessDate(date string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02", date, BusinessZone)
}

func PrevDate(date string) (string, error) {
	t, err := ParseBusinessDate(date)
	if err != nil {
		return "", err
	}
	return t.AddDate(0, 0, -1).Format("2006-01-02"), nil
}

// CheckInPoints 返回连续第 streak 天的积分：min(10+2*(streak-1), 30)。
func CheckInPoints(streak int) int {
	if streak < 1 {
		streak = 1
	}
	if streak > MaxStreakDays {
		streak = MaxStreakDays
	}
	points := BaseCheckIn + StepPoints*(streak-1)
	if points > MaxCheckIn {
		return MaxCheckIn
	}
	return points
}

// StreakAfter 计算“今日签到后”的连续天数。
func StreakAfter(lastDate string, lastStreak int, today string) int {
	if lastDate == "" {
		return 1
	}
	if lastDate == today {
		if lastStreak < 1 {
			return 1
		}
		return lastStreak
	}
	prev, err := PrevDate(today)
	if err == nil && lastDate == prev {
		if lastStreak >= MaxStreakDays {
			return MaxStreakDays
		}
		return lastStreak + 1
	}
	return 1
}

// ApplyCap 返回实际入账积分与是否被余额上限截断。
func ApplyCap(balance, gain int) (int, bool) {
	if balance < 0 {
		balance = 0
	}
	if gain < 0 {
		gain = 0
	}
	room := PointsCap - balance
	if room <= 0 {
		return 0, true
	}
	if gain > room {
		return room, true
	}
	return gain, false
}

type PointsAccount struct {
	UserID    string    `json:"userId"`
	Balance   int       `json:"balance"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type CheckInRecord struct {
	UserID    string    `json:"userId"`
	Date      string    `json:"checkInDate"`
	Streak    int       `json:"streakDays"`
	Points    int       `json:"points"`
	CreatedAt time.Time `json:"createdAt"`
}

type PointsEntry struct {
	EntryID      string    `json:"entryId"`
	UserID       string    `json:"userId"`
	Type         string    `json:"type"`
	Amount       int       `json:"amount"`
	// RequestedAmount 记录申请入账分值；余额截断时 Amount 可能为 0（ACH-07）。
	RequestedAmount int    `json:"requestedAmount,omitempty"`
	BalanceAfter int       `json:"balanceAfter"`
	OccurredAt   time.Time `json:"occurredAt"`
	RefID        string    `json:"refId,omitempty"`
	FrameID      string    `json:"frameId,omitempty"`
	RuleVersion  string    `json:"ruleVersion"`
}

const (
	EntryCheckInEarn      = "checkin_earn"
	EntryRewardSpend      = "reward_spend"
	EntryAchievementEarn  = "achievement_earn"
)

type FrameStatus string

const (
	FrameOnSale   FrameStatus = "on_sale"
	FrameOffShelf FrameStatus = "off_shelf"
)

type FrameDefinition struct {
	ID          string      `json:"frameId"`
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Price       int         `json:"price"`
	Status      FrameStatus `json:"status"`
	AssetPrefix string      `json:"assetPrefix"`
	CatalogVer  string      `json:"catalogVersion"`
}

func (f FrameDefinition) AssetURL() string { return "/assets/frames/" + f.ID + "-3x.png" }

type OwnedFrame struct {
	UserID     string    `json:"userId"`
	FrameID    string    `json:"frameId"`
	OrderID    string    `json:"orderId"`
	Price      int       `json:"price"`
	AcquiredAt time.Time `json:"acquiredAt"`
}

type RedeemOrder struct {
	OrderID       string    `json:"orderId"`
	UserID        string    `json:"userId"`
	FrameID       string    `json:"frameId"`
	Price         int       `json:"price"`
	IdempotencyKey string   `json:"idempotencyKey"`
	CreatedAt     time.Time `json:"createdAt"`
}

// DefaultCatalog 是首批 6 个像素头像框（价格与 spec 5.3 一致）。
func DefaultCatalog() []FrameDefinition {
	items := []struct {
		id, name, desc string
		price          int
	}{
		{"frame_pixel_cyan", "青岚光环", "免费像素光环", 0},
		{"frame_pixel_sakura", "樱瓣", "粉色樱瓣点缀", 100},
		{"frame_pixel_circuit", "电路", "青色电路纹理", 300},
		{"frame_pixel_dawn", "晨曦门扉", "橙金门扉边框", 500},
		{"frame_pixel_starnest", "星巢", "深蓝星点环", 800},
		{"frame_pixel_cat", "猫爪", "猫爪像素边框", 1200},
	}
	out := make([]FrameDefinition, 0, len(items))
	for _, it := range items {
		out = append(out, FrameDefinition{
			ID: it.id, Name: it.name, Description: it.desc, Price: it.price,
			Status: FrameOnSale, AssetPrefix: "/assets/frames/" + it.id, CatalogVer: "catalog-v1",
		})
	}
	return out
}

var idemPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)

func ValidIdempotencyKey(key string) bool { return idemPattern.MatchString(key) }

func ValidFrameID(id string) bool { return idemPattern.MatchString(id) && strings.HasPrefix(id, "frame_") }

func NewEntryID() string {
	return fmt.Sprintf("le_%d", time.Now().UTC().UnixNano())
}

func NewOrderID() string {
	return fmt.Sprintf("ord_%d", time.Now().UTC().UnixNano())
}