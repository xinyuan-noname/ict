package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"sync/atomic"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/platform/ratelimit"
	"ict/server/internal/port"
)

const (
	WeChatEventAuthorizeStarted   = "wechat_authorize_started"
	WeChatEventAuthorizeFailed    = "wechat_authorize_failed"
	WeChatEventCallbackSuccess    = "wechat_callback_success"
	WeChatEventCallbackCancelled  = "wechat_callback_cancelled"
	WeChatEventCallbackFailure    = "wechat_callback_failure"
	WeChatEventCodeReplayed       = "wechat_code_replayed"
	WeChatEventStateInvalid       = "wechat_state_invalid"
)

// WeChatOptions 是编排层需要的配置快照（不依赖 config 包）。
type WeChatOptions struct {
	Enabled            bool
	Env                string
	Mode               string
	AppID              string
	PrimaryRedirectURI string
	StateTTL           time.Duration
	MaxPendingState    int
}

type WeChatAuthService struct {
	Opts     WeChatOptions
	Provider port.WeChatIdentityProvider
	States   port.OAuthStateRepository
	Users    port.UserRepository
	Codes    port.AuthCodeRepository
	Sessions *SessionService
	Audit    port.AuditSink
	Clock    port.Clock
	Logger   *logx.Logger
	// Limiter 是失败计数语义；GlobalLimiter 控制发起频率。
	Limiter       *ratelimit.Limiter
	GlobalLimiter *ratelimit.Limiter

	authorizeTotal    int64
	successTotal      int64
	failTotal         int64
	cancelTotal       int64
	stateInvalidTotal int64
	codeReplayedTotal int64
	upstreamFailTotal int64
	upstreamRequests  int64
}

type WeChatAuthorizeView struct {
	AuthorizeURL string
	CallbackPath string
	ExpiresAt    string
	BindHandle   string
	TraceID      string
}

type WeChatCallbackInput struct {
	Code          string
	State         string
	BindHandle    string
	ClientVersion string
	RemoteIP      string
	Cancelled     bool
}

type WeChatCallbackView struct {
	Cancelled    bool
	SessionToken string
	ExpiresAt    string
	User         domain.UserProfile
	FirstLogin   bool
	Platform     string
	TraceID      string
}

type WeChatAvailability struct {
	Enabled bool
	Reason  string
}

func (s *WeChatAuthService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now()
	}
	return time.Now().UTC()
}

// Availability 只读内存配置，零副作用。
func (s *WeChatAuthService) Availability() WeChatAvailability {
	if !s.Opts.Enabled {
		return WeChatAvailability{Enabled: false, Reason: "disabled"}
	}
	if s.Opts.AppID == "" || s.Opts.PrimaryRedirectURI == "" || s.Provider == nil {
		return WeChatAvailability{Enabled: false, Reason: "unconfigured"}
	}
	if s.Opts.Env == "production" && s.Opts.Mode != "real" {
		return WeChatAvailability{Enabled: false, Reason: "misconfigured"}
	}
	return WeChatAvailability{Enabled: true}
}

// Authorize 生成服务端 state 与绑定票据，并返回官方授权地址。
func (s *WeChatAuthService) Authorize(ctx context.Context, remoteIP string) (WeChatAuthorizeView, error) {
	traceID := logx.TraceID(ctx)
	atomic.AddInt64(&s.authorizeTotal, 1)
	isGuest := strings.TrimSpace(remoteIP) == ""
	_ = isGuest

	if !s.Opts.Enabled || s.Provider == nil {
		ae := apperr.New(apperr.Auth008, errors.New("wechat disabled"))
		ae.Reason = "wechat_app_unconfigured"
		s.audit(WeChatEventAuthorizeFailed, "", string(apperr.Auth008), "wechat_app_unconfigured", traceID)
		return WeChatAuthorizeView{}, ae
	}
	if s.Opts.AppID == "" || s.Opts.PrimaryRedirectURI == "" {
		ae := apperr.New(apperr.Auth008, errors.New("wechat unconfigured"))
		ae.Reason = "wechat_app_unconfigured"
		s.audit(WeChatEventAuthorizeFailed, "", string(apperr.Auth008), "wechat_app_unconfigured", traceID)
		return WeChatAuthorizeView{}, ae
	}
	if s.GlobalLimiter != nil {
		if ok, retry := s.GlobalLimiter.Allow("wechat|" + remoteIP); !ok {
			return WeChatAuthorizeView{}, rateError(retry)
		}
	}

	state, err := randomToken()
	if err != nil {
		ae := apperr.New(apperr.Auth014, err)
		ae.Reason = "wechat_state_issue_failed"
		return WeChatAuthorizeView{}, ae
	}
	handle, err := randomToken()
	if err != nil {
		ae := apperr.New(apperr.Auth014, err)
		ae.Reason = "wechat_state_issue_failed"
		return WeChatAuthorizeView{}, ae
	}
	now := s.now()
	ttl := s.Opts.StateTTL
	if ttl <= 0 || ttl > 10*time.Minute {
		ttl = 10 * time.Minute
	}
	expires := now.Add(ttl)
	invalidated, err := s.States.Issue(ctx, port.OAuthState{
		StateDigest: stateDigest(state), BindHandle: handle,
		Origin: remoteIP, IssuedAt: now, ExpiresAt: expires,
	}, s.Opts.MaxPendingState)
	if err != nil {
		ae := apperr.New(apperr.Auth014, err)
		ae.Reason = "wechat_state_issue_failed"
		return WeChatAuthorizeView{}, ae
	}
	for _, digest := range invalidated {
		_ = s.States.Invalidate(ctx, digest, now)
		s.audit(WeChatEventStateInvalid, "", string(apperr.Auth006), "wechat_state_replayed", traceID)
	}

	authorizeURL, err := s.Provider.AuthorizeURL(state)
	if err != nil {
		ae := apperr.New(apperr.Auth008, err)
		ae.Reason = "wechat_app_unconfigured"
		return WeChatAuthorizeView{}, ae
	}
	s.audit(WeChatEventAuthorizeStarted, "", "", "", traceID)
	return WeChatAuthorizeView{
		AuthorizeURL: authorizeURL,
		CallbackPath: callbackPath(s.Opts.PrimaryRedirectURI),
		ExpiresAt:    expires.Format(time.RFC3339),
		BindHandle:   handle,
		TraceID:      traceID,
	}, nil
}

// Callback 完成 state 校验 → code 占位 → 换票 → 建档 → 签发会话。
func (s *WeChatAuthService) Callback(ctx context.Context, in WeChatCallbackInput) (WeChatCallbackView, error) {
	traceID := logx.TraceID(ctx)
	state := strings.TrimSpace(in.State)
	handle := strings.TrimSpace(in.BindHandle)

	if in.Cancelled || strings.TrimSpace(in.Code) == "" {
		if state != "" {
			_, _, _ = s.States.Consume(ctx, stateDigest(state), handle, s.now())
		}
		atomic.AddInt64(&s.cancelTotal, 1)
		s.audit(WeChatEventCallbackCancelled, "", "", "", traceID)
		return WeChatCallbackView{Cancelled: true, TraceID: traceID}, nil
	}

	if state == "" || handle == "" {
		atomic.AddInt64(&s.stateInvalidTotal, 1)
		ae := apperr.New(apperr.Auth006, errors.New("state missing"))
		ae.Reason = "wechat_state_missing"
		s.audit(WeChatEventStateInvalid, "", string(apperr.Auth006), ae.Reason, traceID)
		return WeChatCallbackView{}, ae
	}
	if _, ok, err := s.States.Consume(ctx, stateDigest(state), handle, s.now()); err != nil || !ok {
		atomic.AddInt64(&s.stateInvalidTotal, 1)
		ae := apperr.New(apperr.Auth006, errors.New("state invalid"))
		ae.Reason = "wechat_state_invalid"
		s.audit(WeChatEventStateInvalid, "", string(apperr.Auth006), ae.Reason, traceID)
		return WeChatCallbackView{}, ae
	}

	code := strings.TrimSpace(in.Code)
	if !validWeChatCode(code) {
		ae := apperr.New(apperr.Auth006, errors.New("code invalid format"))
		ae.Reason = "wechat_code_invalid_format"
		atomic.AddInt64(&s.failTotal, 1)
		s.audit(WeChatEventCallbackFailure, "", string(apperr.Auth006), ae.Reason, traceID)
		return WeChatCallbackView{}, ae
	}
	occupied, err := s.Codes.Consume(ctx, domain.WeChatCodeDigest(code), s.now().Add(10*time.Minute))
	if err != nil {
		ae := apperr.New(apperr.Auth014, err)
		ae.Reason = "wechat_code_store_failed"
		atomic.AddInt64(&s.failTotal, 1)
		return WeChatCallbackView{}, ae
	}
	if !occupied {
		atomic.AddInt64(&s.codeReplayedTotal, 1)
		atomic.AddInt64(&s.failTotal, 1)
		ae := apperr.New(apperr.Auth001, errors.New("code replayed"))
		ae.Reason = "wechat_code_replayed"
		s.audit(WeChatEventCodeReplayed, "", string(apperr.Auth001), ae.Reason, traceID)
		return WeChatCallbackView{}, ae
	}

	atomic.AddInt64(&s.upstreamRequests, 1)
	token, err := s.Provider.ExchangeCode(ctx, code)
	if err != nil {
		atomic.AddInt64(&s.upstreamFailTotal, 1)
		atomic.AddInt64(&s.failTotal, 1)
		code, reason := mapProviderError(err)
		ae := apperr.New(code, errors.New(reason))
		ae.Reason = reason
		s.audit(WeChatEventCallbackFailure, "", string(code), reason, traceID)
		return WeChatCallbackView{}, ae
	}

	displayName, avatarURL := s.Provider.FetchUserInfo(ctx, token.AccessToken, token.OpenID)
	identity := domain.WeChatIdentity{
		OpenID: token.OpenID, UnionID: token.UnionID,
		DisplayName: displayName, AvatarURL: avatarURL, IssuerAppID: s.Opts.AppID,
	}
	if err := domain.ValidateWeChatIdentity(identity, s.Opts.AppID); err != nil {
		atomic.AddInt64(&s.failTotal, 1)
		ae := apperr.New(apperr.Auth011, err)
		ae.Reason = "wechat_identity_missing"
		s.audit(WeChatEventCallbackFailure, "", string(apperr.Auth011), ae.Reason, traceID)
		return WeChatCallbackView{}, ae
	}
	namespaced, ok := domain.NamespacedOpenID(identity.OpenID)
	if !ok {
		atomic.AddInt64(&s.failTotal, 1)
		ae := apperr.New(apperr.Auth011, errors.New("openid invalid"))
		ae.Reason = "wechat_identity_missing"
		return WeChatCallbackView{}, ae
	}
	name, avatar := domain.NormalizeWeChatProfile(identity)
	if name == "" {
		name = domain.WeChatDefaultName
	}
	profile, created, err := s.Users.UpsertByOpenID(ctx, namespaced, identity.UnionID, s.now())
	if err != nil {
		atomic.AddInt64(&s.failTotal, 1)
		ae := apperr.New(apperr.Auth012, err)
		ae.Reason = "wechat_profile_failed"
		return WeChatCallbackView{}, ae
	}
	if name != "" || avatar != "" {
		_ = s.Users.UpdateProfile(ctx, profile.UserID, name, avatar, s.now())
		profile.DisplayName = name
		profile.AvatarURL = avatar
	}
	if profile.Status != domain.StatusActive && profile.Status != "" {
		atomic.AddInt64(&s.failTotal, 1)
		ae := apperr.New(apperr.Auth010, errors.New("profile disabled"))
		ae.Reason = "wechat_account_disabled"
		s.audit(WeChatEventCallbackFailure, profile.UserID, string(apperr.Auth010), ae.Reason, traceID)
		return WeChatCallbackView{}, ae
	}

	rawToken, session, err := s.Sessions.Issue(ctx, profile.UserID, domain.PlatformWechat)
	if err != nil {
		atomic.AddInt64(&s.failTotal, 1)
		ae := apperr.New(apperr.Auth014, err)
		ae.Reason = "wechat_session_failed"
		return WeChatCallbackView{}, ae
	}
	atomic.AddInt64(&s.successTotal, 1)
	s.audit(WeChatEventCallbackSuccess, profile.UserID, "wechat", "", traceID)
	return WeChatCallbackView{
		SessionToken: rawToken,
		ExpiresAt:    session.ExpiresAt.Format(time.RFC3339),
		User:         profile,
		FirstLogin:   created,
		Platform:     string(domain.PlatformWechat),
		TraceID:      traceID,
	}, nil
}

// Stats 返回 8 项指标（供 /metrics 合并）。
func (s *WeChatAuthService) Stats() map[string]int64 {
	return map[string]int64{
		"auth_wechat_authorize_total":   atomic.LoadInt64(&s.authorizeTotal),
		"auth_wechat_login_success_total": atomic.LoadInt64(&s.successTotal),
		"auth_wechat_login_fail_total":  atomic.LoadInt64(&s.failTotal),
		"auth_wechat_cancel_total":      atomic.LoadInt64(&s.cancelTotal),
		"auth_wechat_state_invalid_total": atomic.LoadInt64(&s.stateInvalidTotal),
		"auth_wechat_code_replayed_total": atomic.LoadInt64(&s.codeReplayedTotal),
		"auth_wechat_upstream_fail_total": atomic.LoadInt64(&s.upstreamFailTotal),
		"auth_wechat_upstream_request_total": atomic.LoadInt64(&s.upstreamRequests),
	}
}

func (s *WeChatAuthService) audit(eventType, userID, platform, code, traceID string) {
	if s.Audit == nil {
		return
	}
	s.Audit.Emit(domain.AuthEvent{
		EventID: newEventID(), Type: eventType, UserID: userID, Platform: platform,
		ErrorCode: code, TraceID: traceID, OccurredAt: s.now().UnixMilli(),
	})
}

func mapProviderError(err error) (apperr.Code, string) {
	var we interface{ Error() string }
	if !errors.As(err, &we) {
		return apperr.Auth003, "wechat_upstream_unavailable"
	}
	switch we.Error() {
	case "wechat_code_invalid":
		return apperr.Auth001, "wechat_code_invalid"
	case "wechat_code_replayed":
		return apperr.Auth001, "wechat_code_replayed"
	case "wechat_secret_invalid":
		return apperr.Auth008, "wechat_secret_invalid"
	case "wechat_identity_missing":
		return apperr.Auth011, "wechat_identity_missing"
	default:
		return apperr.Auth003, "wechat_upstream_unavailable"
	}
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func stateDigest(state string) string {
	sum := sha256.Sum256([]byte(state))
	return hex.EncodeToString(sum[:])
}

func callbackPath(uri string) string {
	if uri == "" {
		return ""
	}
	if idx := strings.Index(uri, "://"); idx >= 0 {
		rest := uri[idx+3:]
		if slash := strings.Index(rest, "/"); slash >= 0 {
			return rest[slash:]
		}
		return "/"
	}
	return uri
}

func validWeChatCode(code string) bool {
	if code == "" || len(code) > 512 {
		return false
	}
	for _, r := range code {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			continue
		}
		return false
	}
	return true
}