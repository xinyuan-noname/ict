package domain

import (
	"time"
)

// 单位状态与药物状态。
const (
	UnitActive   = "active"
	UnitDisabled = "disabled"
	MedActive    = "active"
	MedStopped   = "stopped"
)

// 药物四时段（顺序固定，用于展示与补打判定）。
var MedSlots = []string{"morning", "noon", "evening", "night"}

type Unit struct {
	UnitID  string `json:"unitId"`
	UserID  string `json:"userId"`
	Name    string `json:"name"`
	ML      int    `json:"ml"`
	Builtin bool   `json:"builtin"`
	Status  string `json:"status"`
}

// BuiltinUnits 返回内置单位；ml 为记账单位，容量 1。
func BuiltinUnits(userID string) []Unit {
	return []Unit{
		{UnitID: "unit_ml", UserID: userID, Name: "毫升", ML: 1, Builtin: true, Status: UnitActive},
		{UnitID: "unit_cup", UserID: userID, Name: "杯", ML: 250, Builtin: true, Status: UnitActive},
		{UnitID: "unit_bottle", UserID: userID, Name: "农夫山泉", ML: 550, Builtin: true, Status: UnitActive},
	}
}

func ValidUnitName(name string) bool {
	r := []rune(name)
	return len(r) >= 1 && len(r) <= 12
}

func ValidUnitCapacity(ml int) bool { return ml >= 50 && ml <= 2000 }

// ConvertToML：数量 × 单位容量，四舍五入到整数 ml。
func ConvertToML(amount int, unit Unit) int {
	if amount <= 0 || unit.ML <= 0 {
		return 0
	}
	return amount * unit.ML
}

// DisplayAmount：总量折算为显示单位，四舍五入。
func DisplayAmount(totalML int, unit Unit) int {
	if unit.ML <= 0 {
		return 0
	}
	return (totalML + unit.ML/2) / unit.ML
}

// 药物条目与打卡。
type MedicationItem struct {
	ItemID    string    `json:"itemId"`
	UserID    string    `json:"userId"`
	Name      string    `json:"name"`
	Dosage    string    `json:"dosage"`
	Slots     []string  `json:"slots"`
	StartDay  string    `json:"startDay"`
	EndDay    string    `json:"endDay,omitempty"`
	Status    string    `json:"status"`
	Revision  int       `json:"revision"`
	CreatedAt time.Time `json:"createdAt"`
}

type MedDose struct {
	DoseID  string    `json:"doseId"`
	UserID  string    `json:"userId"`
	ItemID  string    `json:"itemId"`
	Day     string    `json:"day"`
	Slot    string    `json:"slot"`
	TakenAt time.Time `json:"takenAt"`
	Late    bool      `json:"late"`
}

type DoseView struct {
	ItemID   string `json:"itemId"`
	Name     string `json:"name"`
	Dosage   string `json:"dosage"`
	Slot     string `json:"slot"`
	Status   string `json:"status"` // pending | taken | late | missed
	DoseID   string `json:"doseId,omitempty"`
	TakenAt  string `json:"takenAt,omitempty"`
}

func ValidMedName(s string) bool {
	r := []rune(s)
	return len(r) >= 1 && len(r) <= 40
}

func ValidDosage(s string) bool {
	r := []rune(s)
	return len(r) >= 1 && len(r) <= 20
}

// NormalizeSlots 去重并按固定顺序排序；非法或空集合返回 false。
func NormalizeSlots(slots []string) ([]string, bool) {
	seen := map[string]bool{}
	for _, s := range slots {
		valid := false
		for _, allowed := range MedSlots {
			if s == allowed {
				valid = true
				break
			}
		}
		if !valid {
			return nil, false
		}
		seen[s] = true
	}
	if len(seen) == 0 {
		return nil, false
	}
	out := make([]string, 0, len(seen))
	for _, s := range MedSlots {
		if seen[s] {
			out = append(out, s)
		}
	}
	return out, true
}

func SlotIndex(slot string) int {
	for i, s := range MedSlots {
		if s == slot {
			return i
		}
	}
	return -1
}

// BuildDoseViews 生成某日的待服视图：已打卡 → taken/late；未打卡且时段已过 → missed；否则 pending。
func BuildDoseViews(items []MedicationItem, doses []MedDose, day string, now time.Time) []DoseView {
	views := make([]DoseView, 0, len(items)*2)
	nowSlot := SlotIndex(slotOf(now))
	for _, item := range items {
		if item.Status != MedActive {
			continue
		}
		if item.StartDay != "" && day < item.StartDay {
			continue
		}
		if item.EndDay != "" && day > item.EndDay {
			continue
		}
		for _, slot := range item.Slots {
			view := DoseView{ItemID: item.ItemID, Name: item.Name, Dosage: item.Dosage, Slot: slot, Status: "pending"}
			for _, dose := range doses {
				if dose.ItemID == item.ItemID && dose.Day == day && dose.Slot == slot {
					view.Status = "taken"
					if dose.Late {
						view.Status = "late"
					}
					view.DoseID = dose.DoseID
					view.TakenAt = dose.TakenAt.In(BusinessZone).Format(time.RFC3339)
					break
				}
			}
			if view.Status == "pending" {
				idx := SlotIndex(slot)
				if day < BusinessDate(now) || (day == BusinessDate(now) && idx >= 0 && idx < nowSlot) {
					view.Status = "missed"
				}
			}
			views = append(views, view)
		}
	}
	return views
}

// slotOf 按业务时区把当前时间映射到四时段。
func slotOf(t time.Time) string {
	hour := t.In(BusinessZone).Hour()
	switch {
	case hour < 11:
		return "morning"
	case hour < 15:
		return "noon"
	case hour < 20:
		return "evening"
	default:
		return "night"
	}
}

// IsLate 判断补打是否晚于该时段（用于 late 标记）。
func IsLate(day, slot string, now time.Time) bool {
	if day < BusinessDate(now) {
		return true
	}
	if day > BusinessDate(now) {
		return false
	}
	return SlotIndex(slot) < SlotIndex(slotOf(now))
}

// MedicationWeekRate 按有记录日均值计算完成率。
func MedicationWeekRate(viewsByDay map[string][]DoseView) float64 {
	recorded := 0
	sum := 0.0
	for _, views := range viewsByDay {
		if len(views) == 0 {
			continue
		}
		taken := 0
		for _, v := range views {
			if v.Status == "taken" || v.Status == "late" {
				taken++
			}
		}
		sum += float64(taken) / float64(len(views))
		recorded++
	}
	if recorded == 0 {
		return 0
	}
	return sum / float64(recorded)
}