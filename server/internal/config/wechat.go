package config

import (
	"fmt"
	"strings"
	"time"
)

// 微信开放平台端点：real 模式必须精确等于这些常量（WXO-49/52）。
const (
	OfficialWeChatAuthorizeURL = "https://open.weixin.qq.com/connect/qrconnect"
	OfficialWeChatTokenURL     = "https://api.weixin.qq.com/sns/oauth2/access_token"
	OfficialWeChatUserInfoURL  = "https://api.weixin.qq.com/sns/userinfo"
)

const (
	WeChatModeReal = "real"
	WeChatModeMock = "mock"
	// WeChatStateTTLMax 是 state 票据硬上限（规格 WXO-17）。
	WeChatStateTTLMax = 10 * time.Minute
)

// WeChatSelfCheck 分级校验：fatal 阻断启动，warnings 仅告警。
// 未启用微信时不校验，保证既有部署零影响。
func (c *Config) WeChatSelfCheck() (fatal []string, warnings []string) {
	if !c.WeChatEnabled {
		return nil, nil
	}
	production := c.Env == "production"

	var missing []string
	if strings.TrimSpace(c.WeChatAppID) == "" {
		missing = append(missing, "WECHAT_APP_ID")
	}
	if strings.TrimSpace(c.WeChatAppSecret) == "" {
		missing = append(missing, "WECHAT_APP_SECRET")
	}
	if strings.TrimSpace(c.WeChatPrimaryRedirectURI) == "" {
		missing = append(missing, "WECHAT_PRIMARY_REDIRECT_URI")
	}
	if len(missing) > 0 {
		msg := "wechat config missing: " + strings.Join(missing, ",")
		if production {
			fatal = append(fatal, msg)
		} else {
			warnings = append(warnings, msg)
		}
	}

	if c.WeChatStateTTL <= 0 || c.WeChatStateTTL > WeChatStateTTLMax {
		fatal = append(fatal, "WECHAT_STATE_TTL must be in (0,10m]")
	}
	if c.WeChatMaxPendingState <= 0 {
		fatal = append(fatal, "WECHAT_MAX_PENDING_STATE must be > 0")
	}
	if c.WeChatBreakerThreshold <= 0 {
		fatal = append(fatal, "WECHAT_BREAKER_THRESHOLD must be > 0")
	}
	if c.WeChatConnectRetries < 0 || c.WeChatConnectRetries > 3 {
		fatal = append(fatal, "WECHAT_CONNECT_RETRIES must be in [0,3]")
	}

	switch c.WeChatMode {
	case WeChatModeReal:
		if production && c.WeChatAppSecretPrevious != "" {
			// 允许轮换期保留旧密钥，不属于致命项。
		}
	case WeChatModeMock:
		if production {
			fatal = append(fatal, "WECHAT_MODE=mock not allowed in production")
		}
	default:
		fatal = append(fatal, fmt.Sprintf("WECHAT_MODE must be %q or %q", WeChatModeReal, WeChatModeMock))
	}

	if c.WeChatMode == WeChatModeReal {
		if c.WeChatAuthorizeURL != OfficialWeChatAuthorizeURL {
			fatal = append(fatal, "WECHAT_AUTHORIZE_URL must equal official constant in real mode")
		}
		if c.WeChatTokenURL != OfficialWeChatTokenURL {
			fatal = append(fatal, "WECHAT_TOKEN_URL must equal official constant in real mode")
		}
		if c.WeChatUserInfoURL != OfficialWeChatUserInfoURL {
			fatal = append(fatal, "WECHAT_USERINFO_URL must equal official constant in real mode")
		}
	}

	for _, uri := range c.WeChatRedirectURIs {
		if strings.ContainsAny(uri, "*?#") {
			fatal = append(fatal, "WECHAT_REDIRECT_URIS must not contain wildcard/query/fragment")
			break
		}
	}
	if c.WeChatPrimaryRedirectURI != "" {
		if !containsExact(c.WeChatRedirectURIs, c.WeChatPrimaryRedirectURI) {
			msg := "WECHAT_PRIMARY_REDIRECT_URI must be registered in WECHAT_REDIRECT_URIS"
			if production {
				fatal = append(fatal, msg)
			} else {
				warnings = append(warnings, msg)
			}
		}
		if production && !strings.HasPrefix(c.WeChatPrimaryRedirectURI, "https://") {
			fatal = append(fatal, "WECHAT_PRIMARY_REDIRECT_URI must be https in production")
		}
	}
	return fatal, warnings
}

// WeChatAvailable 表示当前配置是否足以启用微信登录。
func (c *Config) WeChatAvailable() bool {
	if !c.WeChatEnabled {
		return false
	}
	if c.WeChatAppID == "" || c.WeChatAppSecret == "" || c.WeChatPrimaryRedirectURI == "" {
		return false
	}
	if c.Env == "production" && (c.WeChatMode != WeChatModeReal) {
		return false
	}
	return true
}

// WeChatAvailabilityState 返回可用于 /availability 与 --selfcheck 的三态。
func (c *Config) WeChatAvailabilityState() string {
	if !c.WeChatEnabled {
		return "disabled"
	}
	if !c.WeChatAvailable() {
		return "unconfigured"
	}
	return "enabled"
}

func containsExact(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}