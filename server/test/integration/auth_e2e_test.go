package integration

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"ict/server/internal/adapter/audit"
	"ict/server/internal/adapter/huawei"
	"ict/server/internal/adapter/store/filestore"
	"ict/server/internal/config"
	"ict/server/internal/domain"
	"ict/server/internal/handler"
	"ict/server/internal/middleware"
	"ict/server/internal/platform/logx"
	"ict/server/internal/platform/ratelimit"
	"ict/server/internal/service"
)

const testClientID = "test-client"

type upstream struct {
	server    *httptest.Server
	key       *rsa.PrivateKey
	kid       string
	tokenHits int
}

func b64url(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func (u *upstream) signIDToken(openID, name, avatar string) string {
	header := map[string]any{"alg": "RS256", "typ": "JWT", "kid": u.kid}
	claims := map[string]any{
		"iss": "https://accounts.huawei.com", "aud": testClientID, "sub": openID,
		"exp": time.Now().Add(time.Hour).Unix(), "unionid": "union_" + openID,
		"display_name": name, "picture": avatar,
	}
	hb, _ := json.Marshal(header)
	pb, _ := json.Marshal(claims)
	input := b64url(hb) + "." + b64url(pb)
	hash := sha256.Sum256([]byte(input))
	sig, err := rsa.SignPKCS1v15(rand.Reader, u.key, crypto.SHA256, hash[:])
	if err != nil {
		panic(err)
	}
	return input + "." + b64url(sig)
}

func newUpstream(t *testing.T) *upstream {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	u := &upstream{key: key, kid: "test-kid-1"}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /oauth2/v3/token", func(w http.ResponseWriter, r *http.Request) {
		u.tokenHits++
		_ = r.ParseForm()
		code := r.PostFormValue("code")
		if code == "" {
			writeJSON(w, 200, map[string]any{"error": "invalid_grant"})
			return
		}
		openID := "openid_" + code
		writeJSON(w, 200, map[string]any{
			"access_token": "at_" + code,
			"id_token":     u.signIDToken(openID, "华小为", "https://example.com/a.png"),
			"expires_in":   3600,
		})
	})
	mux.HandleFunc("POST /oauth2/v3/tokeninfo", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		writeJSON(w, 200, map[string]any{"openid": "openid_" + r.PostFormValue("access_token")})
	})
	mux.HandleFunc("GET /oauth2/v3/certs", func(w http.ResponseWriter, r *http.Request) {
		pub := u.key.PublicKey
		writeJSON(w, 200, map[string]any{"keys": []map[string]any{{
			"kty": "RSA", "kid": u.kid, "n": b64url(pub.N.Bytes()),
			"e": b64url(big.NewInt(int64(pub.E)).Bytes()),
		}}})
	})
	u.server = httptest.NewServer(mux)
	t.Cleanup(u.server.Close)
	return u
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

type stack struct {
	srv     http.Handler
	up      *upstream
	audit   *audit.DiscardSink
	baseURL string
}

func newStack(t *testing.T) *stack {
	t.Helper()
	up := newUpstream(t)
	store, err := filestore.Open(filepath.Join(t.TempDir(), "auth.json"))
	if err != nil {
		t.Fatal(err)
	}
	logger := logx.New(io.Discard, "error")
	provider := huawei.New(
		up.server.URL, "/oauth2/v3/token", "/oauth2/v3/tokeninfo", "/oauth2/v3/certs",
		testClientID, "0123456789abcdef", "", 3*time.Second, logger,
	)
	sessions := &service.SessionService{
		Sessions: store, Users: store, Clock: domainClock{},
		TTL: 24 * time.Hour, MaxAbsolute: 168 * time.Hour, RenewRatio: 0.2,
		Pepper: []byte("test-pepper-0123456789"),
	}
	sink := &audit.DiscardSink{}
	auth := service.NewAuthService(service.Options{
		Provider: provider, Users: store, Codes: store, Sessions: sessions,
		Audit: sink, Clock: domainClock{}, Logger: logger,
		AllowedPlatforms: map[domain.Platform]bool{
			domain.PlatformAndroid: true, domain.PlatformIOS: true, domain.PlatformWindows: true,
		},
		MinVersions:  map[string]string{"android": "1.0.0", "ios": "1.0.0", "windows": "1.0.0"},
		RedirectURIs: []string{"http://127.0.0.1:17890/callback"},
		LoginLimiter: ratelimit.New(10, time.Minute),
		CredentialLimiter: ratelimit.New(5, time.Minute),
		GlobalLimiter: ratelimit.New(300, time.Minute),
	})
	cfg := &config.Config{
		Env: "development", Version: "1.0.0",
		WindowsRedirectURIs: []string{"http://127.0.0.1:17890/callback"},
	}
	h := &handler.Server{Deps: handler.Deps{
		Cfg: cfg, Auth: auth, Sessions: sessions, Provider: provider,
		Storage: store, Log: logger, StartedAt: time.Now(),
	}}
	root := middleware.Recover(logger)(middleware.TraceID()(middleware.AccessLog(logger)(middleware.BodyLimit(8192)(h.Routes()))))
	return &stack{srv: root, up: up, audit: sink}
}

type domainClock struct{}

func (domainClock) Now() time.Time { return time.Now().UTC() }

func (s *stack) do(t *testing.T, method, path string, body any, bearer string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	rec := httptest.NewRecorder()
	s.srv.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec, out
}

func (s *stack) login(t *testing.T, code string) (string, map[string]any) {
	t.Helper()
	rec, out := s.do(t, http.MethodPost, "/v1/auth/huawei/login", map[string]any{
		"platform": "android", "authCode": code, "clientVersion": "1.0.0",
	}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("login failed: status=%d body=%v", rec.Code, out)
	}
	token, _ := out["sessionToken"].(string)
	if len(token) != 46 {
		t.Fatalf("session token malformed: %q", token)
	}
	return token, out
}

func TestEndToEndLoginLifecycle(t *testing.T) {
	s := newStack(t)

	rec, health := s.do(t, http.MethodGet, "/v1/health", nil, "")
	if rec.Code != http.StatusOK || health["status"] != "ok" {
		t.Fatalf("health failed: %d %v", rec.Code, health)
	}

	token, login := s.login(t, "code-1")
	if login["firstLogin"] != true {
		t.Fatal("first login flag must be true")
	}
	if login["traceId"] == "" {
		t.Fatal("traceId missing")
	}

	rec, out := s.do(t, http.MethodPost, "/v1/auth/session/validate", map[string]any{"sessionToken": token}, "")
	if rec.Code != http.StatusOK || out["valid"] != true {
		t.Fatalf("validate failed: %d %v", rec.Code, out)
	}

	rec, me := s.do(t, http.MethodGet, "/v1/auth/me", nil, token)
	if rec.Code != http.StatusOK || me["platform"] != "android" {
		t.Fatalf("me failed: %d %v", rec.Code, me)
	}
	user, _ := login["user"].(map[string]any)
	if me["user"].(map[string]any)["userId"] != user["userId"] {
		t.Fatal("me must return the same user as login")
	}

	if _, dup := s.do(t, http.MethodPost, "/v1/auth/huawei/login", map[string]any{
		"platform": "android", "authCode": "code-1", "clientVersion": "1.0.0",
	}, ""); dup["code"] != "AUTH_001" {
		t.Fatalf("replayed code must be AUTH_001, got %v", dup["code"])
	}

	if rec, _ := s.do(t, http.MethodPost, "/v1/auth/logout", map[string]any{"sessionToken": token}, ""); rec.Code != http.StatusOK {
		t.Fatalf("logout failed: %d", rec.Code)
	}

	rec, out = s.do(t, http.MethodPost, "/v1/auth/session/validate", map[string]any{"sessionToken": token}, "")
	if rec.Code != http.StatusUnauthorized || out["code"] != "AUTH_013" {
		t.Fatalf("revoked token must be AUTH_013, got %d %v", rec.Code, out)
	}

	if rec, _ := s.do(t, http.MethodPost, "/v1/auth/logout", map[string]any{"sessionToken": token}, ""); rec.Code != http.StatusOK {
		t.Fatal("repeat logout must stay idempotent 200")
	}
}

func TestMeWithoutCredentialReturnsNoUserData(t *testing.T) {
	s := newStack(t)
	rec, out := s.do(t, http.MethodGet, "/v1/auth/me", nil, "")
	if rec.Code != http.StatusUnauthorized || out["code"] != "AUTH_004" {
		t.Fatalf("want 401 AUTH_004, got %d %v", rec.Code, out)
	}
	if _, ok := out["user"]; ok {
		t.Fatal("unauthenticated response must not contain user data")
	}
}

func TestWindowsRedirectMismatchRejectedBeforeUpstream(t *testing.T) {
	s := newStack(t)
	before := s.up.tokenHits
	rec, out := s.do(t, http.MethodPost, "/v1/auth/huawei/login", map[string]any{
		"platform": "windows", "authCode": "code-w", "clientVersion": "1.0.0",
		"redirectUri": "http://127.0.0.1:17890/callback/",
	}, "")
	if rec.Code != http.StatusBadRequest || out["code"] != "AUTH_006" {
		t.Fatalf("want 400 AUTH_006, got %d %v", rec.Code, out)
	}
	if s.up.tokenHits != before {
		t.Fatal("redirect mismatch must not call Huawei")
	}
}

func TestUnsupportedPlatform(t *testing.T) {
	s := newStack(t)
	rec, out := s.do(t, http.MethodPost, "/v1/auth/huawei/login", map[string]any{
		"platform": "ANDROID", "authCode": "c", "clientVersion": "1.0.0",
	}, "")
	if rec.Code != http.StatusBadRequest || out["code"] != "AUTH_009" {
		t.Fatalf("want 400 AUTH_009, got %d %v", rec.Code, out)
	}
}

func TestTraceIDPropagation(t *testing.T) {
	s := newStack(t)
	req := httptest.NewRequest(http.MethodGet, "/v1/health", nil)
	req.Header.Set("X-Trace-Id", "trace-abc-1234567890")
	rec := httptest.NewRecorder()
	s.srv.ServeHTTP(rec, req)
	if rec.Header().Get("X-Trace-Id") != "trace-abc-1234567890" {
		t.Fatalf("response header trace mismatch: %s", rec.Header().Get("X-Trace-Id"))
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["traceId"] != "trace-abc-1234567890" {
		t.Fatalf("body trace mismatch: %v", body["traceId"])
	}
}

func TestRateLimitAfterTenFailures(t *testing.T) {
	s := newStack(t)
	// 让上游返回 invalid_grant，累计登录失败。
	for i := 0; i < 10; i++ {
		s.do(t, http.MethodPost, "/v1/auth/huawei/login", map[string]any{
			"platform": "android", "authCode": "", "clientVersion": "1.0.0",
		}, "")
	}
	rec, out := s.do(t, http.MethodPost, "/v1/auth/huawei/login", map[string]any{
		"platform": "android", "authCode": "final", "clientVersion": "1.0.0",
	}, "")
	if rec.Code != http.StatusTooManyRequests || out["code"] != "AUTH_007" {
		t.Fatalf("want 429 AUTH_007, got %d %v", rec.Code, out)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Fatal("AUTH_007 must set Retry-After")
	}
}

var _ = context.Background