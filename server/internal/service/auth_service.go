package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/platform/ratelimit"
	"ict/server/internal/port"
)

// LoginInput 是 handler 传入的结构化请求（不含任何身份判定依据）。
type LoginInput struct {
	Platform      string
	AuthCode      string
	RedirectURI   string
	ClientVersion string
	DeviceLabel   string
	RemoteIP      string
}

type LoginOutput struct {
	SessionToken string
	ExpiresAt    time.Time
	User         domain.UserProfile
	FirstLogin   bool
}

// Options 提供编排所需的全部外部能力。
type Options struct {
	Provider          port.HuaweiIdentityProvider
	Users             port.UserRepository
	Codes             port.AuthCodeRepository
	Sessions          *SessionService
	Audit             port.AuditSink
	Clock             port.Clock
	Logger            *logx.Logger
	AllowedPlatforms  map[domain.Platform]bool
	MinVersions       map[string]string
	RedirectURIs      []string
	LoginLimiter      *ratelimit.Limiter
	CredentialLimiter *ratelimit.Limiter
	GlobalLimiter     *ratelimit.Limiter
}

// AuthService 固化登录编排顺序（任务 22.1）。
type AuthService struct {
	opts Options

	flightMu sync.Mutex
	flights  map[string]*flight

	loginTotal     atomic.Int64
	loginFailTotal atomic.Int64
	rateLimited    atomic.Int64
	upstreamCalls  atomic.Int64
}

type flight struct {
	done chan struct{}
	id   domain.HuaweiIdentity
	err  error
}

func NewAuthService(opts Options) *AuthService {
	return &AuthService{opts: opts, flights: map[string]*flight{}}
}

func (a *AuthService) now() time.Time {
	if a.opts.Clock != nil {
		return a.opts.Clock.Now()
	}
	return time.Now().UTC()
}

// Login 执行 22.1 的固定顺序，任一步失败即短路。
func (a *AuthService) Login(ctx context.Context, in LoginInput) (LoginOutput, error) {
	traceID := logx.TraceID(ctx)
	rawCode := strings.TrimSpace(in.AuthCode)
	platformKey := strings.TrimSpace(in.Platform)
	if rawCode == "" || len(rawCode) > 2048 {
		return LoginOutput{}, a.fail(ctx, apperr.Auth006, "", platformKey, "", in, errors.New("invalid authCode length"))
	}

	platform, ok := domain.ParsePlatform(platformKey)
	if !ok || !a.opts.AllowedPlatforms[platform] {
		return LoginOutput{}, a.fail(ctx, apperr.Auth009, "", platformKey, "", in, errors.New("platform missing or unsupported"))
	}

	if platform == domain.PlatformWindows {
		if in.RedirectURI == "" || !a.redirectAllowed(in.RedirectURI) {
			ae := apperr.New(apperr.Auth006, errors.New("windows redirect mismatch"))
			ae.Reason = "redirect_mismatch"
			a.audit(domain.EventLoginFailure, "", string(platform), string(apperr.Auth006), traceID)
			a.loginFailTotal.Add(1)
			return LoginOutput{}, ae
		}
	}

	if !a.versionSupported(string(platform), in.ClientVersion) {
		ae := apperr.New(apperr.Auth009, errors.New("client version unsupported"))
		ae.Reason = "version_unsupported"
		a.audit(domain.EventLoginFailure, "", string(platform), string(apperr.Auth009), traceID)
		a.loginFailTotal.Add(1)
		return LoginOutput{}, ae
	}

	loginKey := in.RemoteIP + "|" + string(platform)
	if ok, retry := a.opts.LoginLimiter.Allow(loginKey); !ok {
		a.rateLimited.Add(1)
		return LoginOutput{}, rateError(retry)
	}
	if ok, retry := a.opts.GlobalLimiter.Allow(in.RemoteIP); !ok {
		a.rateLimited.Add(1)
		return LoginOutput{}, rateError(retry)
	}

	digest := digestCode(rawCode)
	used, err := a.opts.Codes.Exists(ctx, digest)
	if err != nil {
		return LoginOutput{}, a.fail(ctx, apperr.Auth014, "", string(platform), digest, in, err)
	}
	if used {
		ae := a.failRet(ctx, apperr.Auth001, "", string(platform), digest, in, errors.New("auth code replayed"))
		ae.Reason = "code_replayed"
		return LoginOutput{}, ae
	}

	identity, err := a.exchange(ctx, digest, rawCode, platform, in.RedirectURI)
	if err != nil {
		return LoginOutput{}, a.fail(ctx, apperr.Normalize(err), "", string(platform), digest, in, err)
	}

	if identity.OpenID == "" {
		return LoginOutput{}, a.fail(ctx, apperr.Auth011, "", string(platform), digest, in, errors.New("missing openId"))
	}

	consumed, err := a.opts.Codes.Consume(ctx, digest, a.now().Add(10*time.Minute))
	if err != nil {
		return LoginOutput{}, a.fail(ctx, apperr.Auth014, "", string(platform), digest, in, err)
	}
	if !consumed {
		ae := a.failRet(ctx, apperr.Auth001, "", string(platform), digest, in, errors.New("auth code consumed concurrently"))
		ae.Reason = "code_replayed"
		return LoginOutput{}, ae
	}

	profile, created, err := a.opts.Users.UpsertByOpenID(ctx, identity.OpenID, identity.UnionID, a.now())
	if err != nil {
		return LoginOutput{}, a.fail(ctx, apperr.Auth012, "", string(platform), digest, in, err)
	}

	if !profile.Active() {
		if profile.Status != domain.StatusActive && profile.Status != domain.StatusDisabled {
			a.opts.Logger.Warn(ctx, "profile status unknown", "event", "status_unknown", "user_id", profile.UserID)
		}
		a.audit(domain.EventLoginFailure, profile.UserID, string(platform), string(apperr.Auth010), traceID)
		a.loginFailTotal.Add(1)
		return LoginOutput{}, apperr.New(apperr.Auth010, nil)
	}

	name := domain.SanitizeDisplayName(identity.DisplayName)
	avatar := domain.SanitizeAvatarURL(identity.AvatarURL)
	if err := a.opts.Users.UpdateProfile(ctx, profile.UserID, name, avatar, a.now()); err != nil {
		// 仅资料字段更新失败允许登录（任务 13.4）。
		a.opts.Logger.Warn(ctx, "profile update degraded", "event", "profile_update_degraded", "user_id", profile.UserID)
	} else {
		profile.DisplayName = name
		profile.AvatarURL = avatar
	}

	raw, sess, err := a.opts.Sessions.Issue(ctx, profile.UserID, platform)
	if err != nil {
		return LoginOutput{}, a.fail(ctx, apperr.Normalize(err), profile.UserID, string(platform), digest, in, err)
	}

	a.opts.LoginLimiter.Reset(loginKey)
	a.loginTotal.Add(1)
	a.audit(domain.EventLoginSuccess, profile.UserID, string(platform), "", traceID)
	a.opts.Logger.Info(ctx, "login success", "event", "login_success", "platform", string(platform), "user_id", profile.UserID)

	return LoginOutput{SessionToken: raw, ExpiresAt: sess.ExpiresAt, User: profile, FirstLogin: created}, nil
}

// Authenticate 校验凭证并处理续期；供 validate / me 复用。
func (a *AuthService) Authenticate(ctx context.Context, raw, remoteIP string) (domain.Session, domain.UserProfile, string, time.Time, error) {
	credKey := remoteIP
	if ok, retry := a.opts.GlobalLimiter.Allow(remoteIP); !ok {
		a.rateLimited.Add(1)
		return domain.Session{}, domain.UserProfile{}, "", time.Time{}, rateError(retry)
	}
	if ok, retry := a.opts.CredentialLimiter.Allow(credKey); !ok {
		a.rateLimited.Add(1)
		return domain.Session{}, domain.UserProfile{}, "", time.Time{}, rateError(retry)
	}
	sess, profile, err := a.opts.Sessions.Validate(ctx, raw)
	if err != nil {
		if apperr.Normalize(err) == apperr.Auth004 {
			a.opts.CredentialLimiter.Fail(credKey)
			a.audit(domain.EventTokenVerifyFailure, "", "", string(apperr.Auth004), logx.TraceID(ctx))
		}
		return domain.Session{}, domain.UserProfile{}, "", time.Time{}, err
	}
	a.opts.CredentialLimiter.Reset(credKey)
	newRaw, child, renewed, rerr := a.opts.Sessions.Renew(ctx, sess)
	if rerr != nil {
		a.opts.Logger.Warn(ctx, "session renew failed", "event", "renew_failed", "user_id", sess.UserID)
	}
	if renewed {
		return child, profile, newRaw, child.ExpiresAt, nil
	}
	return sess, profile, "", sess.ExpiresAt, nil
}

func (a *AuthService) Logout(ctx context.Context, raw string) (bool, error) {
	changed, err := a.opts.Sessions.Revoke(ctx, raw)
	if err != nil {
		return false, err
	}
	if changed {
		a.audit(domain.EventLogout, "", "", "", logx.TraceID(ctx))
	}
	return true, nil
}

func (a *AuthService) redirectAllowed(candidate string) bool {
	for _, allowed := range a.opts.RedirectURIs {
		if candidate == allowed {
			return true
		}
	}
	return false
}

func (a *AuthService) versionSupported(platform, version string) bool {
	min, ok := a.opts.MinVersions[platform]
	if !ok {
		return true
	}
	cur, ok := parseSemver(version)
	if !ok {
		return false
	}
	base, ok := parseSemver(min)
	if !ok {
		return true
	}
	for i := 0; i < 3; i++ {
		if cur[i] != base[i] {
			return cur[i] > base[i]
		}
	}
	return true
}

func parseSemver(v string) ([3]int, bool) {
	var out [3]int
	parts := strings.Split(strings.TrimSpace(v), ".")
	if len(parts) != 3 {
		return out, false
	}
	for i, p := range parts {
		if p == "" {
			return out, false
		}
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 {
			return out, false
		}
		out[i] = n
	}
	return out, true
}

// exchange 以 digest 合并同码并发，仅首个请求真正调用华为侧（任务 21.3）。
func (a *AuthService) exchange(ctx context.Context, digest, code string, platform domain.Platform, redirectURI string) (domain.HuaweiIdentity, error) {
	a.flightMu.Lock()
	if f, ok := a.flights[digest]; ok {
		a.flightMu.Unlock()
		select {
		case <-f.done:
			return f.id, f.err
		case <-ctx.Done():
			return domain.HuaweiIdentity{}, apperr.New(apperr.Auth003, ctx.Err())
		}
	}
	f := &flight{done: make(chan struct{})}
	a.flights[digest] = f
	a.flightMu.Unlock()

	defer func() {
		a.flightMu.Lock()
		delete(a.flights, digest)
		a.flightMu.Unlock()
		close(f.done)
	}()

	a.upstreamCalls.Add(1)
	id, err := a.opts.Provider.Exchange(ctx, code, platform, redirectURI)
	f.id, f.err = id, err
	return id, err
}

func (a *AuthService) fail(ctx context.Context, code apperr.Code, userID, platform, digest string, in LoginInput, cause error) error {
	ae := a.failRet(ctx, code, userID, platform, digest, in, cause)
	return ae
}

func (a *AuthService) failRet(ctx context.Context, code apperr.Code, userID, platform, digest string, in LoginInput, cause error) *apperr.Error {
	a.loginFailTotal.Add(1)
	if code != apperr.Auth007 {
		a.opts.LoginLimiter.Fail(in.RemoteIP + "|" + platform)
	}
	a.audit(domain.EventLoginFailure, userID, platform, string(code), logx.TraceID(ctx))
	a.opts.Logger.Info(ctx, "login failure", "event", "login_failure", "code", string(code), "code_digest", digest, "platform", platform)
	return apperr.New(code, cause)
}

func (a *AuthService) audit(eventType, userID, platform, code, traceID string) {
	if a.opts.Audit == nil {
		return
	}
	ev := domain.AuthEvent{
		EventID:    newEventID(),
		Type:       eventType,
		UserID:     userID,
		Platform:   platform,
		ErrorCode:  code,
		TraceID:    traceID,
		OccurredAt: a.now().UnixMilli(),
	}
	if platform == "" {
		ev.Platform = "unknown"
	}
	a.opts.Audit.Emit(ev)
}

// Stats 暴露最小指标快照，供 /metrics 与测试使用。
func (a *AuthService) Stats() map[string]int64 {
	return map[string]int64{
		"auth_login_total":             a.loginTotal.Load(),
		"auth_login_fail_total":        a.loginFailTotal.Load(),
		"auth_rate_limited_total":      a.rateLimited.Load(),
		"auth_huawei_request_total":    a.upstreamCalls.Load(),
	}
}

func digestCode(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}

func rateError(retryAfter int) *apperr.Error {
	ae := apperr.New(apperr.Auth007, nil)
	ae.Reason = strconv.Itoa(retryAfter)
	return ae
}

func RetryAfter(err error) int {
	var ae *apperr.Error
	if errors.As(err, &ae) && ae.Code == apperr.Auth007 {
		if n, e := strconv.Atoi(ae.Reason); e == nil {
			return n
		}
	}
	return 0
}

var eventSeq atomic.Int64

func newEventID() string {
	return "ev_" + strconv.FormatInt(time.Now().UnixNano(), 36) + "_" + strconv.FormatInt(eventSeq.Add(1), 36)
}