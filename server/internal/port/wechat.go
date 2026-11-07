package port

import (
	"context"
	"time"

	"ict/server/internal/domain"
)

// WeChatToken 是换票结果；只保留建账所需字段。
type WeChatToken struct {
	AccessToken string
	OpenID      string
	UnionID     string
	ExpiresIn   int
}

// WeChatIdentityProvider 是微信开放平台适配器；与华为适配器物理隔离。
type WeChatIdentityProvider interface {
	// AuthorizeURL 使用服务端固定配置构造官方授权地址。
	AuthorizeURL(state string) (string, error)
	// ExchangeCode 用一次性 code 换票；失败返回归类后的错误。
	ExchangeCode(ctx context.Context, code string) (WeChatToken, error)
	// FetchUserInfo 只读取昵称与头像；失败返回空值，不阻断登录。
	FetchUserInfo(ctx context.Context, accessToken, openID string) (displayName, avatarURL string)
	// Probe 供健康与可用性检查使用：ok|degraded|unknown。
	Probe(ctx context.Context) string
}

// OAuthState 是一次性 state 票据；只存摘要，不存原文。
type OAuthState struct {
	StateDigest  string     `json:"stateDigest"`
	BindHandle   string     `json:"bindHandle"`
	Origin       string     `json:"origin"`
	IssuedAt     time.Time  `json:"issuedAt"`
	ExpiresAt    time.Time  `json:"expiresAt"`
	ConsumedAt   *time.Time `json:"consumedAt,omitempty"`
	InvalidatedAt *time.Time `json:"invalidatedAt,omitempty"`
}

// Terminal 表示票据已消费或作废，不可再次使用。
func (s OAuthState) Terminal() bool {
	return s.ConsumedAt != nil || s.InvalidatedAt != nil
}

// OAuthStateRepository 管理 state 票据的生命周期。
type OAuthStateRepository interface {
	// Issue 写入票据；超过单 origin 未消费上限时作废最早一条。
	Issue(ctx context.Context, state OAuthState, maxPending int) (invalidated []string, err error)
	// Consume 以 CAS 方式消费；成功返回票据，失败返回 false。
	Consume(ctx context.Context, stateDigest, bindHandle string, now time.Time) (OAuthState, bool, error)
	Invalidate(ctx context.Context, stateDigest string, now time.Time) error
	CleanupExpired(ctx context.Context, now time.Time) error
}

var _ = domain.PlatformWechat