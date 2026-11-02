package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/port"
)

type ListState struct {
	ListID  string `json:"listId"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	Enabled bool   `json:"enabled"`
}

type MedWeekView struct {
	Days          []domain.DoseView `json:"-"`
	DayViews      map[string][]domain.DoseView
	AverageRate   float64
	TotalTaken    int
	TotalExpected int
}

func (s *CheckService) Units(ctx context.Context, userID string) ([]domain.Unit, error) {
	out := domain.BuiltinUnits(userID)
	err := s.Store.View(ctx, userID, func(tx *port.CheckTx) error {
		for _, u := range tx.Units {
			out = append(out, u)
		}
		return nil
	})
	if err != nil {
		return nil, normalizeCheck(err)
	}
	return out, nil
}

func (s *CheckService) CreateUnit(ctx context.Context, userID, name string, ml int) (domain.Unit, error) {
	if !domain.ValidUnitName(name) || !domain.ValidUnitCapacity(ml) {
		return domain.Unit{}, apperr.NewCheck(apperr.Check013, nil)
	}
	var created domain.Unit
	err := s.Store.Do(ctx, userID, func(tx *port.CheckTx) error {
		total := len(domain.BuiltinUnits(userID)) + len(tx.Units)
		if total >= 20 {
			return apperr.NewCheck(apperr.Check013, errors.New("unit limit reached"))
		}
		for _, u := range tx.Units {
			if u.Name == name {
				return apperr.NewCheck(apperr.Check014, nil)
			}
		}
		created = domain.Unit{
			UnitID: fmt.Sprintf("unit_%d", s.now().UnixNano()), UserID: userID,
			Name: name, ML: ml, Builtin: false, Status: domain.UnitActive,
		}
		tx.Units = append(tx.Units, created)
		return nil
	})
	if err != nil {
		return domain.Unit{}, normalizeCheck(err)
	}
	return created, nil
}

func (s *CheckService) UpdateUnit(ctx context.Context, userID, unitID string, ml int, status string) (domain.Unit, error) {
	var updated domain.Unit
	err := s.Store.Do(ctx, userID, func(tx *port.CheckTx) error {
		for i, u := range tx.Units {
			if u.UnitID == unitID {
				if ml > 0 {
					if !domain.ValidUnitCapacity(ml) {
						return apperr.NewCheck(apperr.Check013, nil)
					}
					u.ML = ml
				}
				if status == domain.UnitActive || status == domain.UnitDisabled {
					u.Status = status
				}
				tx.Units[i] = u
				updated = u
				return nil
			}
		}
		return apperr.NewCheck(apperr.Check016, nil)
	})
	if err != nil {
		return domain.Unit{}, normalizeCheck(err)
	}
	return updated, nil
}

// DeleteUnit：被药物条目引用时只能停用。
func (s *CheckService) DeleteUnit(ctx context.Context, userID, unitID string) error {
	err := s.Store.Do(ctx, userID, func(tx *port.CheckTx) error {
		idx := -1
		var target domain.Unit
		for i, u := range tx.Units {
			if u.UnitID == unitID {
				idx = i
				target = u
				break
			}
		}
		if idx < 0 {
			return apperr.NewCheck(apperr.Check016, nil)
		}
		for _, item := range tx.MedItems {
			if item.Dosage == target.Name {
				tx.Units[idx].Status = domain.UnitDisabled
				return apperr.NewCheck(apperr.Check015, nil)
			}
		}
		tx.Units = append(tx.Units[:idx], tx.Units[idx+1:]...)
		return nil
	})
	if err != nil {
		return normalizeCheck(err)
	}
	return nil
}

func (s *CheckService) Lists(ctx context.Context, userID string) ([]ListState, error) {
	defaults := []ListState{
		{ListID: "water", Name: "喝水", Type: "quantitative", Enabled: true},
		{ListID: "medication", Name: "药物", Type: "completion", Enabled: true},
	}
	err := s.Store.View(ctx, userID, func(tx *port.CheckTx) error {
		for i, ls := range defaults {
			if v, ok := tx.ListStates[ls.ListID]; ok {
				defaults[i].Enabled = v
			}
		}
		return nil
	})
	if err != nil {
		return nil, normalizeCheck(err)
	}
	return defaults, nil
}

func (s *CheckService) SetList(ctx context.Context, userID, listID string, enabled bool) error {
	if listID != "water" && listID != "medication" {
		return apperr.NewCheck(apperr.Check001, nil)
	}
	if listID == "water" && !enabled {
		return apperr.NewCheck(apperr.Check001, errors.New("water list cannot be disabled"))
	}
	err := s.Store.Do(ctx, userID, func(tx *port.CheckTx) error {
		if tx.ListStates == nil {
			tx.ListStates = map[string]bool{}
		}
		tx.ListStates[listID] = enabled
		return nil
	})
	return normalizeCheck(err)
}

func (s *CheckService) MedItems(ctx context.Context, userID string) ([]domain.MedicationItem, error) {
	var out []domain.MedicationItem
	err := s.Store.View(ctx, userID, func(tx *port.CheckTx) error {
		out = append(out, tx.MedItems...)
		return nil
	})
	if err != nil {
		return nil, normalizeCheck(err)
	}
	return out, nil
}

func (s *CheckService) CreateMedItem(ctx context.Context, userID string, item domain.MedicationItem) (domain.MedicationItem, error) {
	slots, ok := domain.NormalizeSlots(item.Slots)
	if !domain.ValidMedName(item.Name) || !domain.ValidDosage(item.Dosage) || !ok {
		return domain.MedicationItem{}, apperr.NewCheck(apperr.Check018, nil)
	}
	if item.StartDay == "" {
		item.StartDay = s.today()
	}
	if _, err := domain.ParseBusinessDate(item.StartDay); err != nil {
		return domain.MedicationItem{}, apperr.NewCheck(apperr.Check018, err)
	}
	item.ItemID = fmt.Sprintf("med_%d", s.now().UnixNano())
	item.UserID = userID
	item.Slots = slots
	item.Status = domain.MedActive
	item.Revision = 1
	item.CreatedAt = s.now()
	err := s.Store.Do(ctx, userID, func(tx *port.CheckTx) error {
		tx.MedItems = append(tx.MedItems, item)
		return nil
	})
	if err != nil {
		return domain.MedicationItem{}, normalizeCheck(err)
	}
	return item, nil
}

func (s *CheckService) UpdateMedItem(ctx context.Context, userID, itemID string, patch domain.MedicationItem) (domain.MedicationItem, error) {
	var updated domain.MedicationItem
	err := s.Store.Do(ctx, userID, func(tx *port.CheckTx) error {
		for i, item := range tx.MedItems {
			if item.ItemID != itemID {
				continue
			}
			if patch.Name != "" {
				if !domain.ValidMedName(patch.Name) {
					return apperr.NewCheck(apperr.Check018, nil)
				}
				item.Name = patch.Name
			}
			if patch.Dosage != "" {
				if !domain.ValidDosage(patch.Dosage) {
					return apperr.NewCheck(apperr.Check018, nil)
				}
				item.Dosage = patch.Dosage
			}
			if len(patch.Slots) > 0 {
				slots, ok := domain.NormalizeSlots(patch.Slots)
				if !ok {
					return apperr.NewCheck(apperr.Check018, nil)
				}
				item.Slots = slots
			}
			if patch.EndDay != "" {
				item.EndDay = patch.EndDay
			}
			if patch.Status == domain.MedStopped {
				item.Status = domain.MedStopped
			}
			item.Revision++
			tx.MedItems[i] = item
			updated = item
			return nil
		}
		return apperr.NewCheck(apperr.Check019, nil)
	})
	if err != nil {
		return domain.MedicationItem{}, normalizeCheck(err)
	}
	return updated, nil
}

func (s *CheckService) DeleteMedItem(ctx context.Context, userID, itemID string) error {
	err := s.Store.Do(ctx, userID, func(tx *port.CheckTx) error {
		for i, item := range tx.MedItems {
			if item.ItemID == itemID {
				tx.MedItems = append(tx.MedItems[:i], tx.MedItems[i+1:]...)
				return nil
			}
		}
		return apperr.NewCheck(apperr.Check019, nil)
	})
	return normalizeCheck(err)
}

func (s *CheckService) MedToday(ctx context.Context, userID string) ([]domain.DoseView, error) {
	day := s.today()
	var views []domain.DoseView
	err := s.Store.View(ctx, userID, func(tx *port.CheckTx) error {
		if !listEnabled(tx, "medication") {
			return apperr.NewCheck(apperr.Check017, nil)
		}
		views = domain.BuildDoseViews(tx.MedItems, tx.MedDoses, day, s.now())
		return nil
	})
	if err != nil {
		return nil, normalizeCheck(err)
	}
	return views, nil
}

// TakeDose：同 item+day+slot 幂等；跨天补打允许并标记 late。
func (s *CheckService) TakeDose(ctx context.Context, userID, itemID, slot, day string) (domain.MedDose, error) {
	if domain.SlotIndex(slot) < 0 {
		return domain.MedDose{}, apperr.NewCheck(apperr.Check018, nil)
	}
	if day == "" {
		day = s.today()
	}
	if _, err := domain.ParseBusinessDate(day); err != nil {
		return domain.MedDose{}, apperr.NewCheck(apperr.Check010, err)
	}
	if day > s.today() {
		return domain.MedDose{}, apperr.NewCheck(apperr.Check021, nil)
	}
	var dose domain.MedDose
	err := s.Store.Do(ctx, userID, func(tx *port.CheckTx) error {
		if !listEnabled(tx, "medication") {
			return apperr.NewCheck(apperr.Check017, nil)
		}
		found := false
		for _, item := range tx.MedItems {
			if item.ItemID == itemID && item.Status == domain.MedActive {
				found = true
				break
			}
		}
		if !found {
			return apperr.NewCheck(apperr.Check019, nil)
		}
		for _, d := range tx.MedDoses {
			if d.ItemID == itemID && d.Day == day && d.Slot == slot {
				dose = d
				return nil // 幂等
			}
		}
		dose = domain.MedDose{
			DoseID: fmt.Sprintf("dose_%d", s.now().UnixNano()), UserID: userID,
			ItemID: itemID, Day: day, Slot: slot, TakenAt: s.now(),
			Late: domain.IsLate(day, slot, s.now()),
		}
		tx.MedDoses = append(tx.MedDoses, dose)
		return nil
	})
	if err != nil {
		return domain.MedDose{}, normalizeCheck(err)
	}
	return dose, nil
}

func (s *CheckService) CancelDose(ctx context.Context, userID, doseID string) error {
	err := s.Store.Do(ctx, userID, func(tx *port.CheckTx) error {
		for i, d := range tx.MedDoses {
			if d.DoseID == doseID {
				tx.MedDoses = append(tx.MedDoses[:i], tx.MedDoses[i+1:]...)
				return nil
			}
		}
		return apperr.NewCheck(apperr.Check019, nil)
	})
	return normalizeCheck(err)
}

// MedWeek：近 7 天，完成率取“有记录日均值”。
func (s *CheckService) MedWeek(ctx context.Context, userID string) (map[string]any, error) {
	days := make([]string, 0, 7)
	start := s.today()
	t, _ := domain.ParseBusinessDate(start)
	for i := 6; i >= 0; i-- {
		days = append(days, t.AddDate(0, 0, -i).Format("2006-01-02"))
	}
	result := map[string]any{}
	viewsByDay := map[string][]domain.DoseView{}
	err := s.Store.View(ctx, userID, func(tx *port.CheckTx) error {
		for _, day := range days {
			views := domain.BuildDoseViews(tx.MedItems, tx.MedDoses, day, s.now())
			viewsByDay[day] = views
		}
		return nil
	})
	if err != nil {
		return nil, normalizeCheck(err)
	}
	totalTaken, totalExpected := 0, 0
	for _, views := range viewsByDay {
		for _, v := range views {
			totalExpected++
			if v.Status == "taken" || v.Status == "late" {
				totalTaken++
			}
		}
	}
	result["days"] = days
	result["viewsByDay"] = viewsByDay
	result["averageRate"] = domain.MedicationWeekRate(viewsByDay)
	result["taken"] = totalTaken
	result["expected"] = totalExpected
	result["traceId"] = ""
	return result, nil
}

func listEnabled(tx *port.CheckTx, listID string) bool {
	if tx.ListStates == nil {
		return true
	}
	if v, ok := tx.ListStates[listID]; ok {
		return v
	}
	return true
}

var _ = time.Now

// Day 返回当前业务日（供 handler 展示）。
func (s *CheckService) Day() string { return s.today() }