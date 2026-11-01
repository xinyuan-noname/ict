package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
)

func newTestSessionService(t *testing.T) (*SessionService, *fakeSessions, *fakeUsers, *fakeClock) {
	t.Helper()
	users := newFakeUsers()
	sessions := newFakeSessions()
	clock := &fakeClock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	return &SessionService{
		Sessions: sessions, Users: users, Clock: clock,
		TTL: 24 * time.Hour, MaxAbsolute: 168 * time.Hour, RenewRatio: 0.2,
		Pepper: []byte("test-pepper-0123456789"),
	}, sessions, users, clock
}

func TestSessionIssueFormat(t *testing.T) {
	svc, _, _, _ := newTestSessionService(t)
	raw, sess, err := svc.Issue(context.Background(), "u1", domain.PlatformAndroid)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if len(raw) != 46 || !strings.HasPrefix(raw, "s1_") {
		t.Fatalf("token format invalid: %q (len=%d)", raw, len(raw))
	}
	if sess.TokenHash == raw || strings.Contains(sess.TokenHash, "s1_") {
		t.Fatal("token hash must not contain plaintext")
	}
	if sess.ExpiresAt.Sub(sess.IssuedAt) != 24*time.Hour {
		t.Fatalf("unexpected ttl: %v", sess.ExpiresAt.Sub(sess.IssuedAt))
	}
}

func TestSessionValidateRejectsMalformedWithoutLookup(t *testing.T) {
	svc, sessions, _, _ := newTestSessionService(t)
	cases := []string{"", "s1_short", strings.Repeat("a", 46), "s2_" + strings.Repeat("a", 43), "s1_" + strings.Repeat("!", 43)}
	for _, raw := range cases {
		_, _, err := svc.Validate(context.Background(), raw)
		if apperr.Normalize(err) != apperr.Auth004 {
			t.Fatalf("case %q: want AUTH_004, got %v", raw, err)
		}
	}
	if sessions.find != 0 {
		t.Fatalf("malformed token must not hit repository, got %d lookups", sessions.find)
	}
}

func TestSessionRevokedTakesPrecedenceOverExpired(t *testing.T) {
	svc, sessions, users, clock := newTestSessionService(t)
	raw, sess, err := svc.Issue(context.Background(), "u1", domain.PlatformIOS)
	if err != nil {
		t.Fatal(err)
	}
	p, _, _ := users.UpsertByOpenID(context.Background(), "openid", "", clock.Now())
	if p.UserID != "u1" {
		users.byID["u1"] = domain.UserProfile{UserID: "u1", OpenID: "openid", Status: domain.StatusActive}
	}
	if _, err := sessions.Revoke(context.Background(), sess.TokenHash, clock.Now()); err != nil {
		t.Fatal(err)
	}
	clock.advance(48 * time.Hour)
	_, _, err = svc.Validate(context.Background(), raw)
	if apperr.Normalize(err) != apperr.Auth013 {
		t.Fatalf("want AUTH_013 (revoked first), got %v", err)
	}
}

func TestSessionExpired(t *testing.T) {
	svc, _, users, clock := newTestSessionService(t)
	raw, _, err := svc.Issue(context.Background(), "u1", domain.PlatformWindows)
	if err != nil {
		t.Fatal(err)
	}
	users.byID["u1"] = domain.UserProfile{UserID: "u1", Status: domain.StatusActive}
	clock.advance(25 * time.Hour)
	_, _, err = svc.Validate(context.Background(), raw)
	if apperr.Normalize(err) != apperr.Auth005 {
		t.Fatalf("want AUTH_005, got %v", err)
	}
}

func TestSessionDisabledProfile(t *testing.T) {
	svc, _, users, clock := newTestSessionService(t)
	raw, _, _ := svc.Issue(context.Background(), "u1", domain.PlatformAndroid)
	users.byID["u1"] = domain.UserProfile{UserID: "u1", Status: domain.StatusDisabled}
	_, _, err := svc.Validate(context.Background(), raw)
	if apperr.Normalize(err) != apperr.Auth010 {
		t.Fatalf("want AUTH_010, got %v", err)
	}
	_ = clock
}

func TestSessionRenewOnlyOnce(t *testing.T) {
	svc, _, users, clock := newTestSessionService(t)
	_, sess, _ := svc.Issue(context.Background(), "u1", domain.PlatformAndroid)
	users.byID["u1"] = domain.UserProfile{UserID: "u1", Status: domain.StatusActive}
	clock.advance(20 * time.Hour) // 剩余 4h < 20% * 24h

	if _, _, renewed, err := svc.Renew(context.Background(), sess); err != nil || !renewed {
		t.Fatalf("first renew should succeed: renewed=%v err=%v", renewed, err)
	}
	firstRaw, childSess, renewed, err := svc.Renew(context.Background(), sess)
	if err != nil || !renewed {
		t.Fatalf("first renew should succeed: renewed=%v err=%v", renewed, err)
	}
	if !ValidTokenFormat(firstRaw) {
		t.Fatalf("renewed token format invalid: %q", firstRaw)
	}
	if childSess.RenewedFrom != sess.TokenHash {
		t.Fatal("child session must reference the parent session")
	}
	if _, _, renewedAgain, _ := svc.Renew(context.Background(), childSess); renewedAgain {
		t.Fatal("a renewed session must not be renewed again")
	}
}

func TestSessionRevokeIdempotent(t *testing.T) {
	svc, _, _, _ := newTestSessionService(t)
	raw, _, _ := svc.Issue(context.Background(), "u1", domain.PlatformAndroid)
	first, err := svc.Revoke(context.Background(), raw)
	if err != nil || !first {
		t.Fatalf("first revoke: %v %v", first, err)
	}
	second, err := svc.Revoke(context.Background(), raw)
	if err != nil || second {
		t.Fatalf("second revoke must be no-op: %v %v", second, err)
	}
	if _, err := svc.Revoke(context.Background(), "bad"); apperr.Normalize(err) != apperr.Auth004 {
		t.Fatalf("malformed revoke should be AUTH_004, got %v", err)
	}
}