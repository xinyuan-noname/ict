package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/port"
)

const tokenPrefix = "s1_"

// SessionService 负责凭证签发、校验、条件续期与吊销（design 2.8）。
type SessionService struct {
	Sessions    port.SessionRepository
	Users       port.UserRepository
	Clock       port.Clock
	TTL         time.Duration
	MaxAbsolute time.Duration
	RenewRatio  float64
	Pepper      []byte
}

// Hash 计算 HMAC-SHA256(pepper, raw) 的十六进制摘要。
func (s *SessionService) Hash(raw string) string {
	m := hmac.New(sha256.New, s.Pepper)
	m.Write([]byte(raw))
	return hex.EncodeToString(m.Sum(nil))
}

// Issue 生成 46 字符凭证（s1_ + base64url(32B)），库中只存摘要。
func (s *SessionService) Issue(ctx context.Context, userID string, platform domain.Platform) (string, domain.Session, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", domain.Session{}, apperr.New(apperr.Auth014, err)
	}
	raw := tokenPrefix + base64.RawURLEncoding.EncodeToString(buf)
	now := s.Clock.Now()
	sess, err := domain.NewSession(s.Hash(raw), userID, platform, now, s.TTL)
	if err != nil {
		return "", domain.Session{}, apperr.New(apperr.Auth014, err)
	}
	if err := s.Sessions.Insert(ctx, *sess); err != nil {
		return "", domain.Session{}, apperr.New(apperr.Auth014, err)
	}
	return raw, *sess, nil
}

// Renew 在剩余有效期不足阈值时签发子会话；旧会话不吊销不修改。
func (s *SessionService) Renew(ctx context.Context, old domain.Session) (string, domain.Session, bool, error) {
	now := s.Clock.Now()
	if !old.ShouldRenew(now, s.TTL, s.RenewRatio) {
		return "", old, false, nil
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", old, false, apperr.New(apperr.Auth014, err)
	}
	raw := tokenPrefix + base64.RawURLEncoding.EncodeToString(buf)
	child, err := domain.NewSession(s.Hash(raw), old.UserID, old.Platform, now, s.TTL)
	if err != nil {
		return "", old, false, apperr.New(apperr.Auth014, err)
	}
	absolute := old.IssuedAt.Add(s.MaxAbsolute)
	if child.ExpiresAt.After(absolute) {
		child.ExpiresAt = absolute
	}
	if !child.ExpiresAt.After(child.IssuedAt) {
		return "", old, false, nil
	}
	child.RenewedFrom = old.TokenHash
	if err := s.Sessions.Insert(ctx, *child); err != nil {
		return "", old, false, apperr.New(apperr.Auth014, err)
	}
	return raw, *child, true, nil
}

// Validate 严格六步校验（任务 12.3）：格式 → 摘要 → 点查 → 吊销 → 过期 → 档案状态。
func (s *SessionService) Validate(ctx context.Context, raw string) (domain.Session, domain.UserProfile, error) {
	if !ValidTokenFormat(raw) {
		return domain.Session{}, domain.UserProfile{}, apperr.New(apperr.Auth004, nil)
	}
	hash := s.Hash(raw)
	sess, ok, err := s.Sessions.FindByHash(ctx, hash)
	if err != nil {
		return domain.Session{}, domain.UserProfile{}, apperr.New(apperr.Auth014, err)
	}
	if !ok {
		dummyCompare(hash, s.Hash("dummy"))
		return domain.Session{}, domain.UserProfile{}, apperr.New(apperr.Auth004, nil)
	}
	now := s.Clock.Now()
	if sess.IsRevoked() {
		return domain.Session{}, domain.UserProfile{}, apperr.New(apperr.Auth013, nil)
	}
	if sess.IsExpired(now) {
		return domain.Session{}, domain.UserProfile{}, apperr.New(apperr.Auth005, nil)
	}
	profile, found, err := s.Users.FindByID(ctx, sess.UserID)
	if err != nil {
		return domain.Session{}, domain.UserProfile{}, apperr.New(apperr.Auth014, err)
	}
	if !found || !profile.Active() {
		return domain.Session{}, domain.UserProfile{}, apperr.New(apperr.Auth010, nil)
	}
	return sess, profile, nil
}

// Revoke 幂等吊销，仅作用于当前凭证（多端独立）。
func (s *SessionService) Revoke(ctx context.Context, raw string) (bool, error) {
	if !ValidTokenFormat(raw) {
		return false, apperr.New(apperr.Auth004, nil)
	}
	changed, err := s.Sessions.Revoke(ctx, s.Hash(raw), s.Clock.Now())
	if err != nil {
		return false, apperr.New(apperr.Auth014, err)
	}
	return changed, nil
}

// ValidTokenFormat 是纯函数：46 字符、s1_ 前缀、base64url 字符集。
func ValidTokenFormat(raw string) bool {
	if len(raw) != 46 || !strings.HasPrefix(raw, tokenPrefix) {
		return false
	}
	body := raw[len(tokenPrefix):]
	if len(body) != 43 {
		return false
	}
	for i := 0; i < len(body); i++ {
		c := body[i]
		if !(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

// dummyCompare 保证未命中路径与命中路径耗时接近。
func dummyCompare(a, b string) {
	_ = subtle.ConstantTimeCompare([]byte(a), []byte(b))
}