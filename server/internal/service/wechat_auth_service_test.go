package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/platform/ratelimit"
	"ict/server/internal/port"
)

type fakeWeChatProvider struct {
	mu         sync.Mutex
	token      port.WeChatToken
	err        error
	name       string
	avatar     string
	calls      int
	lastState  string
}

func (f *fakeWeChatProvider) AuthorizeURL(state string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastState = state
	return "https://open.weixin.qq.com/connect/qrconnect?state=" + state, nil
}

func (f *fakeWeChatProvider) ExchangeCode(_ context.Context, _ string) (port.WeChatToken, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if f.err != nil {
		return port.WeChatToken{}, f.err
	}
	return f.token, nil
}

func (f *fakeWeChatProvider) FetchUserInfo(_ context.Context, _, _ string) (string, string) {
	return f.name, f.avatar
}

func (f *fakeWeChatProvider) Probe(_ context.Context) string { return "ok" }

func (f *fakeWeChatProvider) state() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.lastState
}

type memStateRepo struct {
	mu      sync.Mutex
	tickets map[string]port.OAuthState
}

func newMemStateRepo() *memStateRepo {
	return &memStateRepo{tickets: map[string]port.OAuthState{}}
}

func (m *memStateRepo) Issue(_ context.Context, state port.OAuthState, _ int) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tickets[state.StateDigest] = state
	return nil, nil
}

func (m *memStateRepo) Consume(_ context.Context, digest, handle string, now time.Time) (port.OAuthState, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tickets[digest]
	if !ok || t.Terminal() || !now.Before(t.ExpiresAt) || t.BindHandle != handle {
		return port.OAuthState{}, false, nil
	}
	ts := now
	t.ConsumedAt = &ts
	m.tickets[digest] = t
	return t, true, nil
}

func (m *memStateRepo) Invalidate(_ context.Context, digest string, now time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	t := m.tickets[digest]
	ts := now
	t.InvalidatedAt = &ts
	m.tickets[digest] = t
	return nil
}

func (m *memStateRepo) CleanupExpired(_ context.Context, _ time.Time) error { return nil }

// findHandle 便于测试从 repo 取到 bindHandle（生产由 Cookie 传递）。
func (m *memStateRepo) findHandle(digest string) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.tickets[digest].BindHandle
}

func newWeChatTest(t *testing.T) (*WeChatAuthService, *fakeWeChatProvider, *memStateRepo, *fakeAudit) {
	t.Helper()
	users := newFakeUsers()
	codes := newFakeCodes()
	sessions := newFakeSessions()
	clock := &fakeClock{t: time.Date(2026, 11, 7, 8, 0, 0, 0, time.UTC)}
	audit := &fakeAudit{}
	sessSvc := &SessionService{
		Sessions: sessions, Users: users, Clock: clock,
		TTL: 24 * time.Hour, MaxAbsolute: 168 * time.Hour, RenewRatio: 0.2,
		Pepper: []byte("test-pepper-0123456789"),
	}
	provider := &fakeWeChatProvider{
		token:  port.WeChatToken{AccessToken: "at", OpenID: "openid_abc", UnionID: "union_abc"},
		name:   "微信用户",
		avatar: "https://example.com/a.png",
	}
	states := newMemStateRepo()
	svc := &WeChatAuthService{
		Opts: WeChatOptions{
			Enabled: true, Env: "development", Mode: "mock", AppID: "wx_app",
			PrimaryRedirectURI: "https://example.com/v1/auth/wechat/callback",
			StateTTL:           10 * time.Minute, MaxPendingState: 3,
		},
		Provider: provider, States: states, Users: users, Codes: codes,
		Sessions: sessSvc, Audit: audit, Clock: clock,
		Logger: logx.New(discard{}, "error"),
		Limiter: ratelimit.New(10, time.Minute), GlobalLimiter: ratelimit.New(300, time.Minute),
	}
	return svc, provider, states, audit
}

// WXO-05/06/17：连续发起 state 互不相同，且缺项不构造 URL。
func TestWeChatAuthorizeCreatesDistinctStates(t *testing.T) {
	svc, provider, states, _ := newWeChatTest(t)
	seen := map[string]bool{}
	for i := 0; i < 10; i++ {
		view, err := svc.Authorize(context.Background(), "1.1.1.1")
		if err != nil {
			t.Fatalf("authorize %d: %v", i, err)
		}
		if view.AuthorizeURL == "" || view.CallbackPath != "/v1/auth/wechat/callback" {
			t.Fatalf("view=%+v", view)
		}
		state := provider.state()
		if seen[state] {
			t.Fatal("state 不应重复")
		}
		seen[state] = true
		if states.findHandle(stateDigest(state)) != view.BindHandle {
			t.Fatal("bindHandle 未落库")
		}
	}
}

func TestWeChatAuthorizeDisabled(t *testing.T) {
	svc, _, _, _ := newWeChatTest(t)
	svc.Opts.Enabled = false
	_, err := svc.Authorize(context.Background(), "1.1.1.1")
	if apperr.Normalize(err) != apperr.Auth008 {
		t.Fatalf("want AUTH_008, got %v", err)
	}
	if svc.Stats()["auth_wechat_authorize_total"] == 0 {
		t.Fatal("应计入发起指标")
	}
}

// WXO-07/09/10/11/13：完整成功链路。
func TestWeChatCallbackSuccess(t *testing.T) {
	svc, provider, _, audit := newWeChatTest(t)
	authorize, err := svc.Authorize(context.Background(), "1.1.1.1")
	if err != nil {
		t.Fatalf("authorize: %v", err)
	}
	view, err := svc.Callback(context.Background(), WeChatCallbackInput{
		Code: "code_abc", State: provider.state(), BindHandle: authorize.BindHandle,
		ClientVersion: "1.0.0", RemoteIP: "1.1.1.1",
	})
	if err != nil {
		t.Fatalf("callback: %v", err)
	}
	if view.SessionToken == "" || view.Platform != "wechat" || !view.FirstLogin {
		t.Fatalf("view=%+v", view)
	}
	if view.User.UserID == "" {
		t.Fatal("应建档")
	}
	if audit.Count() == 0 {
		t.Fatal("应写审计")
	}

	// 同一身份再次登录：不再 firstLogin，且账号不变。
	authorize2, _ := svc.Authorize(context.Background(), "1.1.1.1")
	view2, err := svc.Callback(context.Background(), WeChatCallbackInput{
		Code: "code_def", State: provider.state(), BindHandle: authorize2.BindHandle, RemoteIP: "1.1.1.1",
	})
	if err != nil {
		t.Fatalf("second callback: %v", err)
	}
	if view2.FirstLogin || view2.User.UserID != view.User.UserID {
		t.Fatalf("复用账号失败: %+v", view2)
	}
}

// WXO-15：取消返回 200 语义，不签发会话。
func TestWeChatCancel(t *testing.T) {
	svc, provider, _, _ := newWeChatTest(t)
	authorize, _ := svc.Authorize(context.Background(), "1.1.1.1")
	view, err := svc.Callback(context.Background(), WeChatCallbackInput{
		State: provider.state(), BindHandle: authorize.BindHandle, Cancelled: true, RemoteIP: "1.1.1.1",
	})
	if err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if !view.Cancelled || view.SessionToken != "" {
		t.Fatalf("view=%+v", view)
	}
	if svc.Stats()["auth_wechat_cancel_total"] != 1 {
		t.Fatal("应计入取消指标")
	}
}

// WXO-08：state 缺失/不匹配/复用均拒绝。
func TestWeChatStateFailures(t *testing.T) {
	svc, provider, _, _ := newWeChatTest(t)
	authorize, _ := svc.Authorize(context.Background(), "1.1.1.1")

	cases := []WeChatCallbackInput{
		{Code: "code_1", State: "", BindHandle: authorize.BindHandle},
		{Code: "code_1", State: "unknown_state", BindHandle: authorize.BindHandle},
		{Code: "code_1", State: provider.state(), BindHandle: "wrong_handle"},
	}
	for _, in := range cases {
		if _, err := svc.Callback(context.Background(), in); apperr.Normalize(err) != apperr.Auth006 {
			t.Fatalf("want AUTH_006, got %v", err)
		}
	}
	if provider.calls != 0 {
		t.Fatal("state 失败不得调用上游")
	}
}

// WXO-18/64：同 code 重放被拒，且上游只调用一次。
func TestWeChatCodeReplay(t *testing.T) {
	svc, provider, _, _ := newWeChatTest(t)
	authorize, _ := svc.Authorize(context.Background(), "1.1.1.1")
	if _, err := svc.Callback(context.Background(), WeChatCallbackInput{
		Code: "code_abc", State: provider.state(), BindHandle: authorize.BindHandle, RemoteIP: "1.1.1.1",
	}); err != nil {
		t.Fatalf("first: %v", err)
	}

	authorize2, _ := svc.Authorize(context.Background(), "1.1.1.1")
	_, err := svc.Callback(context.Background(), WeChatCallbackInput{
		Code: "code_abc", State: provider.state(), BindHandle: authorize2.BindHandle, RemoteIP: "1.1.1.1",
	})
	if apperr.Normalize(err) != apperr.Auth001 {
		t.Fatalf("want AUTH_001, got %v", err)
	}
	if provider.calls != 1 {
		t.Fatalf("上游调用=%d，期望 1", provider.calls)
	}
}

// 上游错误归类到既有码。
func TestWeChatUpstreamErrorMapping(t *testing.T) {
	cases := []struct {
		err  error
		code apperr.Code
	}{
		{&weChatErr{"wechat_code_invalid"}, apperr.Auth001},
		{&weChatErr{"wechat_secret_invalid"}, apperr.Auth008},
		{&weChatErr{"wechat_identity_missing"}, apperr.Auth011},
		{&weChatErr{"wechat_upstream_unavailable"}, apperr.Auth003},
		{errors.New("unknown"), apperr.Auth003},
	}
	for _, tc := range cases {
		code, _ := mapProviderError(tc.err)
		if code != tc.code {
			t.Fatalf("err %v: got %s, want %s", tc.err, code, tc.code)
		}
	}
}

type weChatErr struct{ kind string }

func (e *weChatErr) Error() string { return e.kind }

var _ = domain.PlatformWechat