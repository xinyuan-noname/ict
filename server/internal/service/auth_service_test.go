package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/platform/ratelimit"
)

func newTestAuth(t *testing.T) (*AuthService, *fakeUsers, *fakeCodes, *fakeProvider, *fakeAudit) {
	t.Helper()
	users := newFakeUsers()
	codes := newFakeCodes()
	sessions := newFakeSessions()
	clock := &fakeClock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	provider := &fakeProvider{id: domain.HuaweiIdentity{OpenID: "openid_abc", DisplayName: "华小为", AvatarURL: "https://example.com/a.png"}}
	audit := &fakeAudit{}
	sessSvc := &SessionService{
		Sessions: sessions, Users: users, Clock: clock,
		TTL: 24 * time.Hour, MaxAbsolute: 168 * time.Hour, RenewRatio: 0.2,
		Pepper: []byte("test-pepper-0123456789"),
	}
	svc := NewAuthService(Options{
		Provider: provider, Users: users, Codes: codes, Sessions: sessSvc, Audit: audit, Clock: clock,
		Logger:           logx.New(discard{}, "error"),
		AllowedPlatforms: map[domain.Platform]bool{domain.PlatformAndroid: true, domain.PlatformIOS: true, domain.PlatformWindows: true},
		MinVersions:      map[string]string{"android": "1.0.0", "ios": "1.0.0", "windows": "1.0.0"},
		RedirectURIs:     []string{"http://127.0.0.1:17890/callback"},
		LoginLimiter:     ratelimit.New(10, time.Minute),
		CredentialLimiter: ratelimit.New(5, time.Minute),
		GlobalLimiter:     ratelimit.New(300, time.Minute),
	})
	return svc, users, codes, provider, audit
}

type discard struct{}

func (discard) Write(p []byte) (int, error) { return len(p), nil }

func baseInput() LoginInput {
	return LoginInput{
		Platform: "android", AuthCode: "auth-code-1", ClientVersion: "1.0.0", RemoteIP: "127.0.0.1",
	}
}

func TestLoginRejectsEmptyAuthCode(t *testing.T) {
	svc, _, _, provider, _ := newTestAuth(t)
	in := baseInput()
	in.AuthCode = ""
	_, err := svc.Login(context.Background(), in)
	if apperr.Normalize(err) != apperr.Auth006 {
		t.Fatalf("want AUTH_006, got %v", err)
	}
	if provider.Calls() != 0 {
		t.Fatal("upstream must not be called on invalid input")
	}
}

func TestLoginRejectsUnknownOrUppercasePlatform(t *testing.T) {
	svc, _, _, provider, _ := newTestAuth(t)
	for _, p := range []string{"", "ANDROID", "linux"} {
		in := baseInput()
		in.Platform = p
		_, err := svc.Login(context.Background(), in)
		if apperr.Normalize(err) != apperr.Auth009 {
			t.Fatalf("platform %q: want AUTH_009, got %v", p, err)
		}
	}
	if provider.Calls() != 0 {
		t.Fatal("upstream must not be called for unsupported platform")
	}
}

func TestLoginWindowsRedirectWhitelist(t *testing.T) {
	svc, _, _, provider, audit := newTestAuth(t)
	in := baseInput()
	in.Platform = "windows"
	in.RedirectURI = "http://127.0.0.1:17890/callback/"
	_, err := svc.Login(context.Background(), in)
	if apperr.Normalize(err) != apperr.Auth006 {
		t.Fatalf("want AUTH_006, got %v", err)
	}
	if provider.Calls() != 0 {
		t.Fatal("redirect mismatch must not call Huawei")
	}
	if audit.Count() == 0 {
		t.Fatal("redirect mismatch must write security audit")
	}
}

func TestLoginVersionBelowMinimum(t *testing.T) {
	svc, _, _, _, _ := newTestAuth(t)
	in := baseInput()
	in.ClientVersion = "0.9.9"
	_, err := svc.Login(context.Background(), in)
	if apperr.Normalize(err) != apperr.Auth009 {
		t.Fatalf("want AUTH_009 for old version, got %v", err)
	}
}

func TestLoginSuccessCreatesProfileAndSession(t *testing.T) {
	svc, users, _, provider, audit := newTestAuth(t)
	out, err := svc.Login(context.Background(), baseInput())
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if !out.FirstLogin {
		t.Fatal("first login flag must be true")
	}
	if !ValidTokenFormat(out.SessionToken) {
		t.Fatalf("invalid session token: %q", out.SessionToken)
	}
	if provider.Calls() != 1 {
		t.Fatalf("expected 1 upstream call, got %d", provider.Calls())
	}
	if len(users.byID) != 1 {
		t.Fatalf("expected exactly 1 profile, got %d", len(users.byID))
	}
	if out.User.DisplayName != "华小为" {
		t.Fatalf("display name not mapped: %q", out.User.DisplayName)
	}
	if audit.Count() != 1 {
		t.Fatalf("expected 1 audit event, got %d", audit.Count())
	}

	second := baseInput()
	second.AuthCode = "auth-code-2"
	out2, err := svc.Login(context.Background(), second)
	if err != nil {
		t.Fatalf("second login: %v", err)
	}
	if out2.FirstLogin {
		t.Fatal("second login must not be firstLogin")
	}
	if len(users.byID) != 1 {
		t.Fatal("profile must not be duplicated")
	}
}

func TestLoginReplayedCode(t *testing.T) {
	svc, _, codes, provider, _ := newTestAuth(t)
	if _, err := svc.Login(context.Background(), baseInput()); err != nil {
		t.Fatal(err)
	}
	before := provider.Calls()
	_, err := svc.Login(context.Background(), baseInput())
	if apperr.Normalize(err) != apperr.Auth001 {
		t.Fatalf("want AUTH_001 for replayed code, got %v", err)
	}
	if provider.Calls() != before {
		t.Fatal("replayed code must not call Huawei again")
	}
	used, _ := codes.Exists(context.Background(), digestCode("auth-code-1"))
	if !used {
		t.Fatal("code must be marked consumed")
	}
}

func TestLoginUpstreamFailure(t *testing.T) {
	svc, _, _, provider, _ := newTestAuth(t)
	provider.err = apperr.New(apperr.Auth003, errors.New("timeout"))
	_, err := svc.Login(context.Background(), baseInput())
	if apperr.Normalize(err) != apperr.Auth003 {
		t.Fatalf("want AUTH_003, got %v", err)
	}
}

func TestLoginRateLimitedAfterTenFailures(t *testing.T) {
	svc, _, _, provider, _ := newTestAuth(t)
	provider.err = apperr.New(apperr.Auth001, errors.New("invalid"))
	in := baseInput()
	for i := 0; i < 10; i++ {
		in.AuthCode = "code-" + string(rune('a'+i))
		_, _ = svc.Login(context.Background(), in)
	}
	before := provider.Calls()
	in.AuthCode = "code-final"
	_, err := svc.Login(context.Background(), in)
	if apperr.Normalize(err) != apperr.Auth007 {
		t.Fatalf("want AUTH_007 after 10 failures, got %v", err)
	}
	if provider.Calls() != before {
		t.Fatal("rate limited login must not call Huawei")
	}
	if service_Retry := RetryAfter(err); service_Retry < 1 || service_Retry > 60 {
		t.Fatalf("Retry-After out of range: %d", service_Retry)
	}
}

func TestLoginDisabledProfileDoesNotTouchLastLogin(t *testing.T) {
	svc, users, _, _, _ := newTestAuth(t)
	out, err := svc.Login(context.Background(), baseInput())
	if err != nil {
		t.Fatal(err)
	}
	users.SetStatus(context.Background(), out.User.UserID, domain.StatusDisabled)
	before := users.byID[out.User.UserID].LastLoginAt
	in := baseInput()
	in.AuthCode = "another-code"
	_, err = svc.Login(context.Background(), in)
	if apperr.Normalize(err) != apperr.Auth010 {
		t.Fatalf("want AUTH_010, got %v", err)
	}
	after := users.byID[out.User.UserID].LastLoginAt
	if !before.Equal(after) {
		t.Fatal("disabled profile must not update lastLoginAt")
	}
}