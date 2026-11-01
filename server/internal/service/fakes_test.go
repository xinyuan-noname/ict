package service

import (
	"context"
	"errors"
	"sync"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/port"
)

// ---- fakes（仅测试） ----

type fakeClock struct{ t time.Time }

func (c *fakeClock) Now() time.Time { return c.t }
func (c *fakeClock) advance(d time.Duration) { c.t = c.t.Add(d) }

type fakeUsers struct {
	mu       sync.Mutex
	byID     map[string]domain.UserProfile
	byOpenID map[string]string
	findID   int
	updateErr error
}

func newFakeUsers() *fakeUsers {
	return &fakeUsers{byID: map[string]domain.UserProfile{}, byOpenID: map[string]string{}}
}

func (f *fakeUsers) FindByID(_ context.Context, userID string) (domain.UserProfile, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.findID++
	p, ok := f.byID[userID]
	return p, ok, nil
}

func (f *fakeUsers) FindByOpenID(_ context.Context, openID string) (domain.UserProfile, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	id, ok := f.byOpenID[openID]
	if !ok {
		return domain.UserProfile{}, false, nil
	}
	p, ok := f.byID[id]
	return p, ok, nil
}

func (f *fakeUsers) UpsertByOpenID(_ context.Context, openID, unionID string, now time.Time) (domain.UserProfile, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if id, ok := f.byOpenID[openID]; ok {
		p := f.byID[id]
		return p, false, nil
	}
	id := "u_test"
	f.byOpenID[openID] = id
	p := domain.UserProfile{
		UserID: id, OpenID: openID, UnionID: unionID,
		Status: domain.StatusActive, CreatedAt: now, LastLoginAt: now,
	}
	f.byID[id] = p
	return p, true, nil
}

func (f *fakeUsers) UpdateProfile(_ context.Context, userID, displayName, avatarURL string, lastLogin time.Time) error {
	if f.updateErr != nil {
		return f.updateErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	p := f.byID[userID]
	p.DisplayName = displayName
	p.AvatarURL = avatarURL
	p.LastLoginAt = lastLogin
	f.byID[userID] = p
	return nil
}

func (f *fakeUsers) SetStatus(_ context.Context, userID string, status domain.ProfileStatus) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	p := f.byID[userID]
	p.Status = status
	f.byID[userID] = p
	return nil
}

type fakeSessions struct {
	mu    sync.Mutex
	items map[string]domain.Session
	find  int
}

func newFakeSessions() *fakeSessions { return &fakeSessions{items: map[string]domain.Session{}} }

func (f *fakeSessions) Insert(_ context.Context, s domain.Session) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.items[s.TokenHash]; ok {
		return errors.New("conflict")
	}
	f.items[s.TokenHash] = s
	return nil
}

func (f *fakeSessions) FindByHash(_ context.Context, hash string) (domain.Session, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.find++
	s, ok := f.items[hash]
	return s, ok, nil
}

func (f *fakeSessions) Revoke(_ context.Context, hash string, now time.Time) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	s, ok := f.items[hash]
	if !ok || s.RevokedAt != nil {
		return false, nil
	}
	t := now
	s.RevokedAt = &t
	f.items[hash] = s
	return true, nil
}

func (f *fakeSessions) TouchLastActive(_ context.Context, hash string, now time.Time) error {
	return nil
}

type fakeCodes struct {
	mu   sync.Mutex
	used map[string]bool
}

func newFakeCodes() *fakeCodes { return &fakeCodes{used: map[string]bool{}} }

func (f *fakeCodes) Consume(_ context.Context, digest string, expiresAt time.Time) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.used[digest] {
		return false, nil
	}
	f.used[digest] = true
	return true, nil
}

func (f *fakeCodes) Exists(_ context.Context, digest string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.used[digest], nil
}

type fakeProvider struct {
	mu    sync.Mutex
	calls int
	id    domain.HuaweiIdentity
	err   error
	delay time.Duration
}

func (f *fakeProvider) Exchange(ctx context.Context, code string, platform domain.Platform, redirectURI string) (domain.HuaweiIdentity, error) {
	f.mu.Lock()
	f.calls++
	f.mu.Unlock()
	if f.delay > 0 {
		time.Sleep(f.delay)
	}
	if f.err != nil {
		return domain.HuaweiIdentity{}, f.err
	}
	return f.id, nil
}

func (f *fakeProvider) Probe(ctx context.Context) string { return "ok" }

func (f *fakeProvider) Calls() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

type fakeAudit struct {
	mu     sync.Mutex
	events []domain.AuthEvent
}

func (f *fakeAudit) Emit(ev domain.AuthEvent) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, ev)
}

func (f *fakeAudit) Count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.events)
}

var _ port.UserRepository = (*fakeUsers)(nil)
var _ port.SessionRepository = (*fakeSessions)(nil)
var _ port.AuthCodeRepository = (*fakeCodes)(nil)
var _ port.HuaweiIdentityProvider = (*fakeProvider)(nil)
var _ port.AuditSink = (*fakeAudit)(nil)
var _ = apperr.Auth001
var _ = errors.New