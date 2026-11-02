package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/service"
)

type profileBody struct {
	HeightCM int    `json:"heightCm"`
	WeightG  int    `json:"weightG"`
	Age      int    `json:"age"`
	Gender   string `json:"gender"`
}

func (s *Server) checkProfile(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	view, err := s.Check.Profile(r.Context(), profile.UserID)
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"profile": view.Profile, "targetMl": view.TargetML, "complete": view.Complete, "traceId": tid,
	})
}

func (s *Server) checkPutProfile(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var body profileBody
	if err := decodeCheck(r, &body); err != nil {
		apperr.WriteCheck(w, apperr.Check001, tid, 0)
		return
	}
	gender, valid := domain.NormalizeGender(body.Gender)
	if !valid {
		apperr.WriteCheck(w, apperr.Check005, tid, 0)
		return
	}
	view, err := s.Check.PutProfile(r.Context(), profile.UserID, domain.HealthProfile{
		HeightCM: body.HeightCM, WeightG: body.WeightG, Age: body.Age, Gender: gender,
	})
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"profile": view.Profile, "targetMl": view.TargetML, "complete": true, "traceId": tid,
	})
}

func (s *Server) checkToday(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	view, err := s.Check.Today(r.Context(), profile.UserID)
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, todayBody(view, tid))
}

type addRecordBody struct {
	ML int `json:"ml"`
}

func (s *Server) checkAddRecord(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	var body addRecordBody
	if err := decodeCheck(r, &body); err != nil {
		apperr.WriteCheck(w, apperr.Check001, tid, 0)
		return
	}
	idem := r.Header.Get("Idempotency-Key")
	view, err := s.Check.AddRecord(r.Context(), profile.UserID, body.ML, idem)
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, todayBody(view, tid))
}

func (s *Server) checkDeleteRecord(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	view, err := s.Check.DeleteRecord(r.Context(), profile.UserID, r.PathValue("recordId"))
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, todayBody(view, tid))
}

func (s *Server) checkWeek(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	stats, err := s.Check.Week(r.Context(), profile.UserID, r.URL.Query().Get("weekStart"))
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{
		"weekStart": stats.WeekStart, "days": stats.Days, "averageMl": stats.AverageML,
		"totalMl": stats.TotalML, "achievedDays": stats.AchievedDays, "elapsedDays": stats.ElapsedDays,
		"achievementRate": stats.AchievementRate, "targetMl": stats.TargetML, "traceId": tid,
	})
}

func (s *Server) checkPreview(w http.ResponseWriter, r *http.Request) {
	tid := logx.TraceID(r.Context())
	q := r.URL.Query()
	height, _ := strconv.Atoi(q.Get("heightCm"))
	weight, _ := strconv.Atoi(q.Get("weightG"))
	age, _ := strconv.Atoi(q.Get("age"))
	gender, valid := domain.NormalizeGender(q.Get("gender"))
	if height <= 0 || weight <= 0 || age <= 0 || !valid {
		apperr.WriteCheck(w, apperr.Check005, tid, 0)
		return
	}
	ml, err := s.Check.Preview(domain.HealthProfile{HeightCM: height, WeightG: weight, Age: age, Gender: gender})
	if err != nil {
		apperr.WriteCheck(w, apperr.NormalizeCheck(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"targetMl": ml, "version": domain.WaterGoalVersion, "traceId": tid})
}

func (s *Server) checkList(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireUser(w, r); !ok {
		return
	}
	tid := logx.TraceID(r.Context())
	writeJSON(w, tid, http.StatusOK, map[string]any{"checklists": s.Check.List(), "traceId": tid})
}

func todayBody(view service.TodayView, tid string) map[string]any {
	records := make([]map[string]any, 0, len(view.Records))
	for _, rec := range view.Records {
		records = append(records, map[string]any{
			"recordId": rec.RecordID, "day": rec.Day, "ml": rec.ML,
			"createdAt": rec.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	return map[string]any{
		"day": view.Day, "targetMl": view.TargetML, "totalMl": view.TotalML,
		"achieved": view.Achieved, "cupMl": view.CupML, "cups": view.Cups,
		"streak": view.Streak, "records": records, "traceId": tid,
	}
}

func decodeCheck(r *http.Request, dst any) error {
	if r.Body == nil {
		return nil
	}
	dec := json.NewDecoder(io.LimitReader(r.Body, 4096))
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}