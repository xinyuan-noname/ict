package config

import (
	"strings"
	"testing"
	"time"
)

func baseWeChatConfig() *Config {
	return &Config{
		Env:                      "development",
		WeChatEnabled:            true,
		WeChatMode:               WeChatModeMock,
		WeChatAppID:              "wx_app",
		WeChatAppSecret:          "0123456789abcdef0123456789abcdef",
		WeChatRedirectURIs:       []string{"https://example.com/v1/auth/wechat/callback"},
		WeChatPrimaryRedirectURI: "https://example.com/v1/auth/wechat/callback",
		WeChatAuthorizeURL:       OfficialWeChatAuthorizeURL,
		WeChatTokenURL:           OfficialWeChatTokenURL,
		WeChatUserInfoURL:        OfficialWeChatUserInfoURL,
		WeChatStateTTL:           10 * time.Minute,
		WeChatMaxPendingState:    3,
		WeChatBreakerThreshold:   5,
		WeChatConnectRetries:     1,
	}
}

// WXO-47/48：关闭时完全不校验，保证既有部署零影响。
func TestWeChatSelfCheckDisabled(t *testing.T) {
	c := &Config{Env: "production", WeChatEnabled: false}
	fatal, warnings := c.WeChatSelfCheck()
	if len(fatal) != 0 || len(warnings) != 0 {
		t.Fatalf("关闭时不应有任何校验项: %v %v", fatal, warnings)
	}
	if c.WeChatAvailable() {
		t.Fatal("关闭时不可用")
	}
	if c.WeChatAvailabilityState() != "disabled" {
		t.Fatalf("state=%s", c.WeChatAvailabilityState())
	}
}

// 开发态缺项只告警，不在启动期失败。
func TestWeChatSelfCheckDevelopmentWarnsOnly(t *testing.T) {
	c := baseWeChatConfig()
	c.WeChatAppID = ""
	c.WeChatAppSecret = ""
	fatal, warnings := c.WeChatSelfCheck()
	if len(fatal) != 0 {
		t.Fatalf("开发态不应 fatal: %v", fatal)
	}
	if len(warnings) == 0 {
		t.Fatal("开发态缺少 AppID/Secret 应告警")
	}
	if c.WeChatAvailable() {
		t.Fatal("缺项时不可用")
	}
	if c.WeChatAvailabilityState() != "unconfigured" {
		t.Fatalf("state=%s", c.WeChatAvailabilityState())
	}
}

// 生产态缺项必须阻断启动。
func TestWeChatSelfCheckProductionFatal(t *testing.T) {
	c := baseWeChatConfig()
	c.Env = "production"
	c.WeChatMode = WeChatModeReal
	c.WeChatAppSecret = ""
	fatal, _ := c.WeChatSelfCheck()
	joined := strings.Join(fatal, ";")
	if !strings.Contains(joined, "WECHAT_APP_SECRET") {
		t.Fatalf("生产缺 Secret 应 fatal: %v", fatal)
	}
	if strings.Contains(joined, "0123456789abcdef0123456789abcdef") {
		t.Fatal("错误信息不得包含密钥原文")
	}
}

func TestWeChatSelfCheckStateTTLLimit(t *testing.T) {
	c := baseWeChatConfig()
	c.WeChatStateTTL = 11 * time.Minute
	fatal, _ := c.WeChatSelfCheck()
	if !strings.Contains(strings.Join(fatal, ";"), "WECHAT_STATE_TTL") {
		t.Fatalf("TTL 超上限应 fatal: %v", fatal)
	}
}

func TestWeChatSelfCheckPendingLimit(t *testing.T) {
	c := baseWeChatConfig()
	c.WeChatMaxPendingState = 0
	fatal, _ := c.WeChatSelfCheck()
	if !strings.Contains(strings.Join(fatal, ";"), "WECHAT_MAX_PENDING_STATE") {
		t.Fatalf("票据上限 <=0 应 fatal: %v", fatal)
	}
}

func TestWeChatSelfCheckRedirectWhitelist(t *testing.T) {
	c := baseWeChatConfig()
	c.WeChatRedirectURIs = []string{"https://example.com/*"}
	fatal, _ := c.WeChatSelfCheck()
	if !strings.Contains(strings.Join(fatal, ";"), "wildcard") {
		t.Fatalf("通配符白名单应 fatal: %v", fatal)
	}

	c = baseWeChatConfig()
	c.WeChatRedirectURIs = []string{"https://other.example.com/cb"}
	fatal, warnings := c.WeChatSelfCheck()
	joined := strings.Join(append(fatal, warnings...), ";")
	if !strings.Contains(joined, "must be registered") {
		t.Fatalf("主回跳不在白名单应提示: %v", joined)
	}
}

func TestWeChatSelfCheckProductionRequiresHTTPS(t *testing.T) {
	c := baseWeChatConfig()
	c.Env = "production"
	c.WeChatMode = WeChatModeReal
	c.WeChatRedirectURIs = []string{"http://example.com/cb"}
	c.WeChatPrimaryRedirectURI = "http://example.com/cb"
	fatal, _ := c.WeChatSelfCheck()
	if !strings.Contains(strings.Join(fatal, ";"), "https") {
		t.Fatalf("生产非 https 应 fatal: %v", fatal)
	}
}

func TestWeChatSelfCheckMockInProduction(t *testing.T) {
	c := baseWeChatConfig()
	c.Env = "production"
	fatal, _ := c.WeChatSelfCheck()
	if !strings.Contains(strings.Join(fatal, ";"), "mock") {
		t.Fatalf("生产 mock 应 fatal: %v", fatal)
	}
}

func TestWeChatSelfCheckRealRequiresOfficialEndpoints(t *testing.T) {
	c := baseWeChatConfig()
	c.WeChatMode = WeChatModeReal
	c.WeChatTokenURL = "https://evil.example.com/token"
	fatal, _ := c.WeChatSelfCheck()
	if !strings.Contains(strings.Join(fatal, ";"), "WECHAT_TOKEN_URL") {
		t.Fatalf("real 非官方端点应 fatal: %v", fatal)
	}
}