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
	Cfg         *config.Config
	Auth        *service.AuthService
	Reward      *service.RewardService
	Check       *service.CheckService
	Pet         *service.PetService
	Sport       *service.SportService
	Sync        *service.SyncService
	WeChat      *service.WeChatAuthService
	CustomPlans *service.CustomPlanService
	Sessions    *service.SessionService
	Provider    interface{ Probe(context.Context) string }
	Storage     interface{ Ping(context.Context) error }
	// Cloud 是只读资源探活；key 固定为 rds / redis / maas。
	Cloud     map[string]interface{ Probe(context.Context) string }
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

	// 单位、清单启停与药物清单。
	mux.HandleFunc("GET /v1/check/units", s.checkUnits)
	mux.HandleFunc("POST /v1/check/units", s.checkCreateUnit)
	mux.HandleFunc("PATCH /v1/check/units/{unitId}", s.checkUpdateUnit)
	mux.HandleFunc("DELETE /v1/check/units/{unitId}", s.checkDeleteUnit)
	mux.HandleFunc("GET /v1/check/lists", s.checkLists)
	mux.HandleFunc("PATCH /v1/check/lists/{listId}", s.checkSetList)

	// 用户需求 -> Ollama -> 自定义一级/二级清单与成就。
	mux.HandleFunc("POST /v1/custom-plans/generate", s.customPlanGenerate)
	mux.HandleFunc("GET /v1/check/medication/items", s.checkMedItems)
	mux.HandleFunc("POST /v1/check/medication/items", s.checkCreateMedItem)
	mux.HandleFunc("PATCH /v1/check/medication/items/{itemId}", s.checkUpdateMedItem)
	mux.HandleFunc("DELETE /v1/check/medication/items/{itemId}", s.checkDeleteMedItem)
	mux.HandleFunc("GET /v1/check/medication/today", s.checkMedToday)
	mux.HandleFunc("POST /v1/check/medication/doses", s.checkTakeDose)
	mux.HandleFunc("DELETE /v1/check/medication/doses/{doseId}", s.checkCancelDose)
	mux.HandleFunc("GET /v1/check/medication/week", s.checkMedWeek)

	// 运动域：记录写入、删除回退与成就快照。
	mux.HandleFunc("POST /v1/sport/records", s.sportAddRecord)
	mux.HandleFunc("DELETE /v1/sport/records/{recordId}", s.sportDeleteRecord)
	mux.HandleFunc("GET /v1/sport/achievements", s.sportAchievements)

	// 同步域：游标、增量快照、批次上行与对账。
	mux.HandleFunc("GET /v1/sync/cursor", s.syncCursor)
	mux.HandleFunc("GET /v1/sync/snapshot", s.syncSnapshot)
	mux.HandleFunc("POST /v1/sync/push", s.syncPush)
	mux.HandleFunc("POST /v1/sync/reconcile", s.syncReconcile)

	// 微信开放平台扫码登录（独立链路，不复用华为登录端点）。
	mux.HandleFunc("POST /v1/auth/wechat/authorize", s.wechatAuthorize)
	mux.HandleFunc("POST /v1/auth/wechat/callback", s.wechatCallback)
	mux.HandleFunc("GET /v1/auth/wechat/availability", s.wechatAvailability)

	// 宠物 / 道具 / 好友 / PK。
	mux.HandleFunc("GET /v1/pet", s.petGet)
	mux.HandleFunc("POST /v1/pet/adopt", s.petAdopt)
	mux.HandleFunc("PATCH /v1/pet", s.petPatch)
	mux.HandleFunc("POST /v1/pet/feed", s.petFeed)
	mux.HandleFunc("POST /v1/pet/play", s.petPlay)
	mux.HandleFunc("GET /v1/items", s.itemList)
	mux.HandleFunc("POST /v1/items/{itemId}/redeem", s.itemRedeem)
	mux.HandleFunc("POST /v1/items/{itemId}/use", s.itemUse)
	mux.HandleFunc("GET /v1/friends", s.friendList)
	mux.HandleFunc("POST /v1/friends/invite", s.friendInvite)
	mux.HandleFunc("POST /v1/friends/accept", s.friendAccept)
	mux.HandleFunc("DELETE /v1/friends/{friendId}", s.friendDelete)
	mux.HandleFunc("POST /v1/friends/{friendId}/block", s.friendBlock)
	mux.HandleFunc("POST /v1/pk/challenges", s.pkChallenge)
	mux.HandleFunc("POST /v1/pk/challenges/{pkId}/accept", s.pkAccept)
	mux.HandleFunc("GET /v1/pk/challenges/{pkId}", s.pkGet)
	mux.HandleFunc("GET /v1/pk/history", s.pkHistory)

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
	RDS     string `json:"rds"`
	Redis   string `json:"redis"`
	MaaS    string `json:"maas"`
}

type healthCloud struct {
	Provider     string `json:"provider"`
	Region       string `json:"region"`
	DeploymentID string `json:"deploymentId"`
}

type healthResponse struct {
	Status  string       `json:"status"`
	Version string       `json:"version"`
	Env     string       `json:"env"`
	Checks  healthChecks `json:"checks"`
	Cloud   healthCloud  `json:"cloud"`
	Time    string       `json:"time"`
	TraceID string       `json:"traceId,omitempty"`
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	tid := logx.TraceID(r.Context())
	storage := "ok"
	ctx, cancel := context.WithTimeout(r.Context(), 1200*time.Millisecond)
	defer cancel()
	if err := s.Storage.Ping(ctx); err != nil {
		storage = "fail"
	}
	huawei := s.Provider.Probe(r.Context())
	checks := healthChecks{Config: "ok", Storage: storage, Huawei: huawei, RDS: "not_configured", Redis: "not_configured", MaaS: "not_configured"}
	for key, probe := range s.Cloud {
		state := probe.Probe(ctx)
		switch key {
		case "rds":
			checks.RDS = state
		case "redis":
			checks.Redis = state
		case "maas":
			checks.MaaS = state
		}
	}
	status := "ok"
	code := http.StatusOK
	if storage == "fail" {
		status = "fail"
		code = http.StatusServiceUnavailable
	} else if huawei == "degraded" || cloudDegraded(checks) {
		status = "degraded"
	}
	writeJSON(w, tid, code, healthResponse{
		Status: status, Version: s.Cfg.Version, Env: s.Cfg.Env,
		Checks: checks,
		Cloud: healthCloud{
			Provider:     "huaweicloud",
			Region:       s.Cfg.CloudRegion,
			DeploymentID: s.Cfg.DeploymentID,
		},
		Time: time.Now().UTC().Format(time.RFC3339), TraceID: tid,
	})
}

// cloudDegraded：已配置但探活失败的云资源只降级，不阻断登录主链路。
func cloudDegraded(c healthChecks) bool {
	for _, state := range []string{c.RDS, c.Redis, c.MaaS} {
		if state == "fail" || state == "degraded" {
			return true
		}
	}
	return false
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
