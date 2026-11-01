package port

import (
	"context"
	"time"

	"ict/server/internal/domain"
)

// 端口定义遵循 design 2.1.2：service 只依赖 port，adapter 实现 port。

type HuaweiIdentityProvider interface {
	// Exchange 用授权码换取身份；platform=windows 时透传 redirectURI。
	Exchange(ctx context.Context, code string, platform domain.Platform, redirectURI string) (domain.HuaweiIdentity, error)
	// Probe 供 /v1/health 使用，返回 ok|degraded|unknown。
	Probe(ctx context.Context) string
}

type UserRepository interface {
	FindByID(ctx context.Context, userID string) (domain.UserProfile, bool, error)
	FindByOpenID(ctx context.Context, openID string) (domain.UserProfile, bool, error)
	// UpsertByOpenID 首次创建返回 created=true，userId 由实现分配。
	UpsertByOpenID(ctx context.Context, openID, unionID string, now time.Time) (profile domain.UserProfile, created bool, err error)
	UpdateProfile(ctx context.Context, userID, displayName, avatarURL string, lastLogin time.Time) error
	SetStatus(ctx context.Context, userID string, status domain.ProfileStatus) error
}

type SessionRepository interface {
	Insert(ctx context.Context, s domain.Session) error
	FindByHash(ctx context.Context, hash string) (domain.Session, bool, error)
	Revoke(ctx context.Context, hash string, now time.Time) (bool, error)
	TouchLastActive(ctx context.Context, hash string, now time.Time) error
}

type AuthCodeRepository interface {
	// Consume 以 code 摘要做 CAS；已存在返回 false。
	Consume(ctx context.Context, codeDigest string, expiresAt time.Time) (bool, error)
	Exists(ctx context.Context, codeDigest string) (bool, error)
}

type AuditSink interface {
	Emit(event domain.AuthEvent)
}

type Clock interface {
	Now() time.Time
}

type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now().UTC() }