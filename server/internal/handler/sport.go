package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/service"
)

type addSportRecordRequest struct {
	RecordID   string `json:"recordId"`
	Type       string `json:"type"`
	Day        string `json:"day"`
	DistanceM  int    `json:"distanceM"`
	DurationS  int    `json:"durationS"`
	Steps      int    `json:"steps"`
	Continuous bool   `json:"continuous"`
	ClientSeq  int    `json:"clientSeq"`
}

func achievementJSON(v service.AchievementView) map[string]any {
	days := v.EvidenceDays
	if days == nil {
		days = []string{}
	}
	body := map[string]any{
		"achievementId": v.AchievementID, "ruleVersion": v.RuleVersion, "status": v.Status,
		"progress": v.Progress, "need": v.Need, "points": v.Points,
		"grantedPoints": v.GrantedPoints, "capped": v.Capped,
		"evidenceDays": days, "updatedAt": v.UpdatedAt,
	}
	if v.UnlockedAt != "" {
		body["unlockedAt"] = v.UnlockedAt
	}
	return body
}

func (s *Server) sportAddRecord(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	if !domain.ValidIdempotencyKey(r.Header.Get("Idempotency-Key")) {
		apperr.WriteSport(w, apperr.Sport001, tid, 0)
		return
	}
	var req addSportRecordRequest
	if err := decodeSportBody(r, &req); err != nil {
		apperr.WriteSport(w, apperr.Sport001, tid, 0)
		return
	}
	view, err := s.Sport.AddRecord(r.Context(), profile.UserID, service.AddRecordInput{
		RecordID: req.RecordID, Type: req.Type, Day: req.Day,
		DistanceM: req.DistanceM, DurationS: req.DurationS, Steps: req.Steps,
		Continuous: req.Continuous, ClientSeq: req.ClientSeq,
	})
	if err != nil {
		apperr.WriteSport(w, apperr.NormalizeSport(err), tid, 0)
		return
	}
	unlocked := make([]map[string]any, 0, len(view.Unlocked))
	for _, item := range view.Unlocked {
		unlocked = append(unlocked, achievementJSON(item))
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"record": map[string]any{
			"recordId": view.Record.RecordID, "type": string(view.Record.Type), "day": view.Record.Day,
			"distanceM": view.Record.DistanceM, "durationS": view.Record.DurationS,
			"steps": view.Record.Steps, "continuous": view.Record.Continuous,
			"createdAt": view.Record.CreatedAt.In(domain.BusinessZone).Format(time.RFC3339),
		},
		"unlocked":      unlocked,
		"earnedPoints":  view.EarnedPoints,
		"pointsBalance": view.PointsBalance,
		"balanceCapped": view.BalanceCapped,
		"ruleVersion":   view.RuleVersion,
		"replayed":      view.Replayed,
		"traceId":       tid,
	})
}

func (s *Server) sportDeleteRecord(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	view, err := s.Sport.DeleteRecord(r.Context(), profile.UserID, r.PathValue("recordId"))
	if err != nil {
		apperr.WriteSport(w, apperr.NormalizeSport(err), tid, 0)
		return
	}
	items := make([]map[string]any, 0, len(view.Achievements))
	for _, item := range view.Achievements {
		items = append(items, achievementJSON(item))
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"deleted": view.Deleted, "achievements": items,
		"pointsBalance": view.PointsBalance, "traceId": tid,
	})
}

func (s *Server) sportAchievements(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	view, err := s.Sport.Achievements(r.Context(), profile.UserID)
	if err != nil {
		apperr.WriteSport(w, apperr.NormalizeSport(err), tid, 0)
		return
	}
	items := make([]map[string]any, 0, len(view.Achievements))
	for _, item := range view.Achievements {
		items = append(items, achievementJSON(item))
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"achievements": items,
		"unlockedCount": view.UnlockedCount, "totalCount": view.TotalCount,
		"totalGrantedPoints": view.TotalGrantedPoints, "pointsBalance": view.PointsBalance,
		"ruleVersion": view.RuleVersion, "serverTime": view.ServerTime, "traceId": tid,
	})
}

func decodeSportBody(r *http.Request, dst any) error {
	if r.Body == nil {
		return errors.New("empty body")
	}
	dec := json.NewDecoder(io.LimitReader(r.Body, 64*1024))
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}