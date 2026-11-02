package handler

import (
	"net/http"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
)

type unitBody struct {
	Name   string `json:"name"`
	ML     int    `json:"ml"`
	Status string `json:"status"`
}

func (s *Server) checkUnits(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	units, err := s.Check.Units(r.Context(), profile.UserID)
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"units": units, "traceId": tid})
}

func (s *Server) checkCreateUnit(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var body unitBody
	if err := decodeCheck(r, &body); err != nil {
		apperr.WriteCheck(w, apperr.Check001, tid, 0)
		return
	}
	unit, err := s.Check.CreateUnit(r.Context(), profile.UserID, body.Name, body.ML)
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"unit": unit, "traceId": tid})
}

func (s *Server) checkUpdateUnit(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var body unitBody
	if err := decodeCheck(r, &body); err != nil {
		apperr.WriteCheck(w, apperr.Check001, tid, 0)
		return
	}
	unit, err := s.Check.UpdateUnit(r.Context(), profile.UserID, r.PathValue("unitId"), body.ML, body.Status)
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"unit": unit, "traceId": tid})
}

func (s *Server) checkDeleteUnit(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	if err := s.Check.DeleteUnit(r.Context(), profile.UserID, r.PathValue("unitId")); err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"deleted": true, "traceId": tid})
}

func (s *Server) checkLists(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	lists, err := s.Check.Lists(r.Context(), profile.UserID)
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"lists": lists, "traceId": tid})
}

type listBody struct {
	Enabled *bool `json:"enabled"`
}

func (s *Server) checkSetList(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var body listBody
	if err := decodeCheck(r, &body); err != nil || body.Enabled == nil {
		apperr.WriteCheck(w, apperr.Check001, tid, 0)
		return
	}
	if err := s.Check.SetList(r.Context(), profile.UserID, r.PathValue("listId"), *body.Enabled); err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"enabled": *body.Enabled, "traceId": tid})
}

type medBody struct {
	Name     string   `json:"name"`
	Dosage   string   `json:"dosage"`
	Slots    []string `json:"slots"`
	StartDay string   `json:"startDay"`
	EndDay   string   `json:"endDay"`
	Status   string   `json:"status"`
}

func (s *Server) checkMedItems(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	items, err := s.Check.MedItems(r.Context(), profile.UserID)
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"items": items, "traceId": tid})
}

func (s *Server) checkCreateMedItem(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var body medBody
	if err := decodeCheck(r, &body); err != nil {
		apperr.WriteCheck(w, apperr.Check018, tid, 0)
		return
	}
	item, err := s.Check.CreateMedItem(r.Context(), profile.UserID, domain.MedicationItem{
		Name: body.Name, Dosage: body.Dosage, Slots: body.Slots,
		StartDay: body.StartDay, EndDay: body.EndDay,
	})
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"item": item, "traceId": tid})
}

func (s *Server) checkUpdateMedItem(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var body medBody
	if err := decodeCheck(r, &body); err != nil {
		apperr.WriteCheck(w, apperr.Check018, tid, 0)
		return
	}
	item, err := s.Check.UpdateMedItem(r.Context(), profile.UserID, r.PathValue("itemId"), domain.MedicationItem{
		Name: body.Name, Dosage: body.Dosage, Slots: body.Slots, EndDay: body.EndDay, Status: body.Status,
	})
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"item": item, "traceId": tid})
}

func (s *Server) checkDeleteMedItem(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	if err := s.Check.DeleteMedItem(r.Context(), profile.UserID, r.PathValue("itemId")); err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"deleted": true, "traceId": tid})
}

func (s *Server) checkMedToday(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	views, err := s.Check.MedToday(r.Context(), profile.UserID)
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	taken := 0
	for _, v := range views {
		if v.Status == "taken" || v.Status == "late" {
			taken++
		}
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"day": s.Check.Day(), "doses": views, "taken": taken, "expected": len(views), "traceId": tid,
	})
}

type doseBody struct {
	ItemID string `json:"itemId"`
	Slot   string `json:"slot"`
	Day    string `json:"day"`
}

func (s *Server) checkTakeDose(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var body doseBody
	if err := decodeCheck(r, &body); err != nil {
		apperr.WriteCheck(w, apperr.Check018, tid, 0)
		return
	}
	dose, err := s.Check.TakeDose(r.Context(), profile.UserID, body.ItemID, body.Slot, body.Day)
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"dose": dose, "traceId": tid})
}

func (s *Server) checkCancelDose(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	if err := s.Check.CancelDose(r.Context(), profile.UserID, r.PathValue("doseId")); err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"cancelled": true, "traceId": tid})
}

func (s *Server) checkMedWeek(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	result, err := s.Check.MedWeek(r.Context(), profile.UserID)
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	result["traceId"] = tid
	writeJSON(w, tid, http.StatusOK, result)
}