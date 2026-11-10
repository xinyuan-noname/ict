package handler

import (
	"net/http"
	"strings"

	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
)

type generatePlanBody struct {
	Need string `json:"need"`
}

func (s *Server) customPlanGenerate(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var body generatePlanBody
	if err := decodeCheck(r, &body); err != nil || strings.TrimSpace(body.Need) == "" {
		apperr.WriteCheck(w, apperr.Check001, tid, 0)
		return
	}
	if s.CustomPlans == nil {
		apperr.WriteCheck(w, apperr.Check008, tid, 0)
		return
	}
	plan, err := s.CustomPlans.Generate(r.Context(), body.Need)
	if err != nil {
		s.Log.Error(r.Context(), "custom plan generation failed", "event", "custom_plan_failed", "userId", profile.UserID, "reason", err.Error())
		apperr.WriteCheck(w, apperr.Check008, tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"plan": plan, "traceId": tid})
}
