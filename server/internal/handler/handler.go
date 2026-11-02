package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"ict/server/internal/config"
	"ict/server/internal/domain"
	"ict/server/internal/middleware"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/service"
)

// Deps 是 handler 层的全部依赖；handler 只做协议转换，不含业务判断（任务 23.4）。
type Deps struct {
	Cfg       *config.Config
	Auth      *service.AuthService
	Reward    *service.RewardService
	Check     *service.CheckService
	Sessions  *service.SessionService
	Provider  interface{ Probe(context.Context) string }
	Storage   interface{ Ping(context.Context) error }
	Log       *logx.Logger
	StartedAt time.Time
}

type Server struct{ Deps }

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/auth/huawei/login", s.login)
	mux.HandleFunc("POST /v1/auth/session/validate", s.validate)
	mux.HandleFunc("POST /v1/auth/logout", s.logout)
	mux.HandleFunc("GET /v1/auth/me", s.me)
	mux.HandleFunc("GET /v1/health", s.health)
	mux.HandleFunc("GET /readyz", s.ready)

	// 奖励域：鉴权在 handler 内复用既有会话校验。
	mux.HandleFunc("GET /v1/rewards/checkin/status", s.rewardStatus)
	mux.HandleFunc("POST /v1/rewards/checkin", s.rewardCheckIn)
	mux.HandleFunc("GET /v1/rewards/points/ledger", s.rewardLedger)
	mux.HandleFunc("GET /v1/rewards/frames", s.rewardFrames)
	mux.HandleFunc("POST /v1/rewards/frames/{frameId}/redeem", s.rewardRedeem)
	mux.HandleFunc("PUT /v1/rewards/avatar-frame", s.rewardEquip)

	// 清单域（check）：喝水清单为定量式。
	mux.HandleFunc("GET /v1/check/profile", s.checkProfile)
	mux.HandleFunc("PUT /v1/check/profile", s.checkPutProfile)
	mux.HandleFunc("GET /v1/check/today", s.checkToday)
	mux.HandleFunc("POST /v1/check/water/records", s.checkAddRecord)
	mux.HandleFunc("DELETE /v1/check/water/records/{recordId}", s.checkDeleteRecord)
	mux.HandleFunc("GET /v1/check/water/week", s.checkWeek)
	mux.HandleFunc("GET /v1/check/goal/preview", s.checkPreview)
	mux.HandleFunc("GET /v1/check/list", s.checkList)

	// 像素头像框静态资源（开发/自托管；生产可由 CDN 覆盖）。
	frames := http.FileServer(http.Dir("assets/frames"))
	mux.Handle("GET /assets/frames/", http.StripPrefix("/assets/frames/", frames))
	return mux
}

type loginRequest struct {
	Platform      string `json:"platform"`
	AuthCode      string `json:"authCode"`
	RedirectURI   string `json:"redirectUri"`
	ClientVersion string `json:"clientVersion"`
	DeviceLabel   string `json:"deviceLabel"`
}

type userBrief struct {
	UserID      string `json:"userId"`
	DisplayName string `json:"displayName,omitempty"`
	AvatarURL   string `json:"avatarUrl,omitempty"`
}

type loginResponse struct {
	SessionToken string    `json:"sessionToken"`
	ExpiresAt    string    `json:"expiresAt"`
	User         userBrief `json:"user"`
	FirstLogin   bool      `json:"firstLogin"`
	TraceID      string    `json:"traceId"`
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	tid := logx.TraceID(r.Context())
	var req loginRequest
	if err := decode(r, &req); err != nil {
		apperr.Write(w, apperr.Auth006, tid, 0)
		return
	}
	ip := middleware.ClientIP(r, s.Cfg.TrustedProxies)
	out, err := s.Auth.Login(r.Context(), service.LoginInput{
		Platform: req.Platform, AuthCode: req.AuthCode, RedirectURI: req.RedirectURI,
		ClientVersion: req.ClientVersion, DeviceLabel: req.DeviceLabel, RemoteIP: ip,
	})
	if err != nil {
		apperr.Write(w, apperr.Normalize(err), tid, service.RetryAfter(err))
		return
	}
	writeJSON(w, tid, http.StatusOK, loginResponse{
		SessionToken: out.SessionToken,
		ExpiresAt:    out.ExpiresAt.UTC().Format(time.RFC3339),
		User:         brief(out.User),
		FirstLogin:   out.FirstLogin,
		TraceID:      tid,
	})
}

type validateRequest struct {
	SessionToken string `json:"sessionToken"`
}

type validateResponse struct {
	Valid        bool      `json:"valid"`
	User         userBrief `json:"user"`
	ExpiresAt    string    `json:"expiresAt"`
	SessionToken string    `json:"sessionToken,omitempty"`
	TraceID      string    `json:"traceId"`
}

func (s *Server) validate(w http.ResponseWriter, r *http.Request) {
	tid := logx.TraceID(r.Context())
	var req validateRequest
	_ = decode(r, &req)
	raw := strings.TrimSpace(req.SessionToken)
	if raw == "" {
		if bearer, ok := middleware.BearerToken(r); ok {
			raw = bearer
		}
	}
	ip := middleware.ClientIP(r, s.Cfg.TrustedProxies)
	_, profile, renewed, expires, err := s.Auth.Authenticate(r.Context(), raw, ip)
	if err != nil {
		apperr.Write(w, apperr.Normalize(err), tid, service.RetryAfter(err))
		return
	}
	writeJSON(w, tid, http.StatusOK, validateResponse{
		Valid: true, User: brief(profile), ExpiresAt: expires.UTC().Format(time.RFC3339),
		SessionToken: renewed, TraceID: tid,
	})
}

type logoutRequest struct {
	SessionToken string `json:"sessionToken"`
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	tid := logx.TraceID(r.Context())
	var req logoutRequest
	_ = decode(r, &req)
	raw := strings.TrimSpace(req.SessionToken)
	if raw == "" {
		if bearer, ok := middleware.BearerToken(r); ok {
			raw = bearer
		}
	}
	if _, err := s.Auth.Logout(r.Context(), raw); err != nil {
		apperr.Write(w, apperr.Normalize(err), tid, 0)
		return
	}
	writeJSON(w, tid, http.StatusOK, map[string]any{"success": true, "traceId": tid})
}

type meResponse struct {
	User      userBrief `json:"user"`
	Platform  string    `json:"platform"`
	ExpiresAt string    `json:"expiresAt"`
	TraceID   string    `json:"traceId"`
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	tid := logx.TraceID(r.Context())
	raw, ok := middleware.BearerToken(r)
	if !ok {
		apperr.Write(w, apperr.Auth004, tid, 0)
		return
	}
	ip := middleware.ClientIP(r, s.Cfg.TrustedProxies)
	sess, profile, _, expires, err := s.Auth.Authenticate(r.Context(), raw, ip)
	if err != nil {
		apperr.Write(w, apperr.Normalize(err), tid, service.RetryAfter(err))
		return
	}
	writeJSON(w, tid, http.StatusOK, meResponse{
		User: brief(profile), Platform: string(sess.Platform),
		ExpiresAt: expires.UTC().Format(time.RFC3339), TraceID: tid,
	})
}

type healthChecks struct {
	Config  string `json:"config"`
	Storage string `json:"storage"`
	Huawei  string `json:"huawei"`
}

type healthResponse struct {
	Status  string       `json:"status"`
	Version string       `json:"version"`
	Env     string       `json:"env"`
	Checks  healthChecks `json:"checks"`
	Time    string       `json:"time"`
	TraceID string       `json:"traceId,omitempty"`
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	tid := logx.TraceID(r.Context())
	storage := "ok"
	ctx, cancel := context.WithTimeout(r.Context(), 500*time.Millisecond)
	defer cancel()
	if err := s.Storage.Ping(ctx); err != nil {
		storage = "fail"
	}
	huawei := s.Provider.Probe(r.Context())
	status := "ok"
	code := http.StatusOK
	if storage == "fail" {
		status = "fail"
		code = http.StatusServiceUnavailable
	} else if huawei == "degraded" {
		status = "degraded"
	}
	writeJSON(w, tid, code, healthResponse{
		Status: status, Version: s.Cfg.Version, Env: s.Cfg.Env,
		Checks: healthChecks{Config: "ok", Storage: storage, Huawei: huawei},
		Time:   time.Now().UTC().Format(time.RFC3339), TraceID: tid,
	})
}

func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 500*time.Millisecond)
	defer cancel()
	if err := s.Storage.Ping(ctx); err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("not ready"))
		return
	}
	_, _ = w.Write([]byte("ready"))
}

func (s *Server) Metrics(w http.ResponseWriter, r *http.Request) {
	stats := s.Auth.Stats()
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	_, _ = w.Write([]byte("# Huawei ID minimal login metrics\n"))
	for k, v := range stats {
		_, _ = w.Write([]byte(k + " " + itoa(v) + "\n"))
	}
}

func brief(p domain.UserProfile) userBrief {
	return userBrief{UserID: p.UserID, DisplayName: p.DisplayName, AvatarURL: p.AvatarURL}
}

func decode(r *http.Request, dst any) error {
	if r.Body == nil {
		return nil
	}
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

func writeJSON(w http.ResponseWriter, tid string, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Trace-Id", tid)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}