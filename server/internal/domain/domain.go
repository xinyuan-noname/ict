package domain

import (
	"errors"
	"regexp"
	"strings"
	"time"
)

// Platform 严格三枚举，大小写敏感（任务 10.4）。
type Platform string

const (
	PlatformAndroid Platform = "android"
	PlatformIOS     Platform = "ios"
	PlatformWindows Platform = "windows"
)

func ParsePlatform(s string) (Platform, bool) {
	switch Platform(s) {
	case PlatformAndroid, PlatformIOS, PlatformWindows:
		return Platform(s), true
	}
	return "", false
}

type ProfileStatus string

const (
	StatusActive   ProfileStatus = "active"
	StatusDisabled ProfileStatus = "disabled"
)

// UserProfile 对应 spec 6.1；openId 唯一不可变。
type UserProfile struct {
	UserID      string        `json:"userId"`
	OpenID      string        `json:"openId"`
	UnionID     string        `json:"unionId,omitempty"`
	DisplayName string        `json:"displayName,omitempty"`
	AvatarURL   string        `json:"avatarUrl,omitempty"`
	Status      ProfileStatus `json:"status"`
	CreatedAt   time.Time     `json:"createdAt"`
	LastLoginAt time.Time     `json:"lastLoginAt"`
}

func (p *UserProfile) Active() bool { return p.Status == StatusActive }

// Session 对应 spec 6.2；tokenHash 为 HMAC-SHA256(pepper, raw)。
type Session struct {
	TokenHash   string    `json:"tokenHash"`
	UserID      string    `json:"userId"`
	Platform    Platform  `json:"platform"`
	IssuedAt    time.Time `json:"issuedAt"`
	ExpiresAt   time.Time `json:"expiresAt"`
	RevokedAt   *time.Time `json:"revokedAt,omitempty"`
	LastActive  *time.Time `json:"lastActiveAt,omitempty"`
	RenewedFrom string    `json:"renewedFrom,omitempty"`
}

func (s *Session) IsRevoked() bool { return s.RevokedAt != nil }

func (s *Session) IsExpired(now time.Time) bool { return !now.Before(s.ExpiresAt) }

func (s *Session) Usable(now time.Time) bool { return !s.IsRevoked() && !s.IsExpired(now) }

func (s *Session) Revoke(now time.Time) {
	if s.RevokedAt == nil {
		t := now.UTC()
		s.RevokedAt = &t
	}
}

// ShouldRenew 剩余有效期低于阈值且未续期过时才允许续期（任务 12.4）。
func (s *Session) ShouldRenew(now time.Time, ttl time.Duration, ratio float64) bool {
	if s.RenewedFrom != "" || s.IsRevoked() || s.IsExpired(now) {
		return false
	}
	remaining := s.ExpiresAt.Sub(now)
	return remaining > 0 && remaining < time.Duration(float64(ttl)*ratio)
}

// AuthEvent 对应 spec 6.3；不含任何凭证原文。
type AuthEvent struct {
	EventID   string    `json:"eventId"`
	Type      string    `json:"type"`
	UserID    string    `json:"userId,omitempty"`
	Platform  string    `json:"platform,omitempty"`
	ErrorCode string    `json:"errorCode,omitempty"`
	TraceID   string    `json:"traceId"`
	OccurredAt int64    `json:"occurredAt"`
}

const (
	EventLoginSuccess       = "login_success"
	EventLoginFailure       = "login_failure"
	EventLogout             = "logout"
	EventTokenVerifyFailure = "token_verify_failure"
)

// HuaweiIdentity 值对象：类型层面不含手机号/邮箱/身份证（任务 10.5）。
type HuaweiIdentity struct {
	OpenID      string
	UnionID     string
	DisplayName string
	AvatarURL   string
	IssuerAppID string
}

var (
	reOpenID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
	control  = regexp.MustCompile(`[\x00-\x1f\x7f]`)
)

func ValidOpenID(s string) bool { return reOpenID.MatchString(s) }

// SanitizeDisplayName 去控制字符与换行，截断至 64 字符。
func SanitizeDisplayName(s string) string {
	s = control.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", "")
	r := []rune(strings.TrimSpace(s))
	if len(r) > 64 {
		r = r[:64]
	}
	return string(r)
}

// SanitizeAvatarURL 仅接受 https 且长度 ≤512，否则返回空值且不报错。
func SanitizeAvatarURL(s string) string {
	if len(s) > 512 || !strings.HasPrefix(strings.ToLower(s), "https://") {
		return ""
	}
	return s
}

var ErrInvalidSession = errors.New("invalid session duration")

// NewSession 校验有效期区间 [1h,168h]（spec 6.2 不变量）。
func NewSession(tokenHash, userID string, platform Platform, now time.Time, ttl time.Duration) (*Session, error) {
	if ttl < time.Hour || ttl > 168*time.Hour {
		return nil, ErrInvalidSession
	}
	return &Session{
		TokenHash: tokenHash,
		UserID:    userID,
		Platform:  platform,
		IssuedAt:  now.UTC(),
		ExpiresAt: now.UTC().Add(ttl),
	}, nil
}