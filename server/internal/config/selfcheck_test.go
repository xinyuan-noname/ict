package config

import (
	"strings"
	"testing"
)

func realConfig() *Config {
	return &Config{
		Env:                  "development",
		AuthMode:             ModeReal,
		IdentityMode:         "shared",
		HuaweiClientID:       "real-client-id",
		HuaweiClientSecret:   "0123456789abcdef",
		HuaweiTokenURL:       OfficialTokenURL,
		HuaweiJWKSURL:        OfficialJWKSURL,
		HuaweiTokeninfoURL:   OfficialTokeninfoURL,
		HuaweiAuthorizeURL:   OfficialAuthorizeURL,
		TLSVerify:            true,
		AllowedPlatforms:     []string{"android", "ios", "windows"},
		WindowsRedirectURIs:  []string{"http://127.0.0.1:17890/callback"},
		SessionPepper:        "pepper-0123456789abcdef",
		SessionTTL:           24 * 3600 * 1e9,
		SessionMaxAbsolute:   168 * 3600 * 1e9,
		SessionRenewRatio:    0.2,
		HuaweiTimeout:        3e9,
		HuaweiBreakerOpen:    15e9,
		ClockSkew:            60e9,
		JWKSMaxTTL:           12 * 3600 * 1e9,
		StorageNamespace:     "real",
		DualSourceCheck:      "auto",
	}
}

func TestSelfCheckRealPasses(t *testing.T) {
	if problems := realConfig().SelfCheck(); len(problems) != 0 {
		t.Fatalf("unexpected problems: %v", problems)
	}
}

func TestSelfCheckRealRejectsMockEndpoint(t *testing.T) {
	c := realConfig()
	c.HwsimBase = "http://127.0.0.1:8081"
	problems := c.SelfCheck()
	if !contains(problems, "real mode must not set HWSIM_BASE_URL") {
		t.Fatalf("expected hwsim rejection, got %v", problems)
	}
}

func TestSelfCheckRealRejectsNonOfficialEndpoint(t *testing.T) {
	c := realConfig()
	c.HuaweiTokenURL = "https://mirror.example.com/oauth2/v3/token"
	problems := c.SelfCheck()
	if !contains(problems, "endpoint token not official") {
		t.Fatalf("expected endpoint rejection, got %v", problems)
	}
}

func TestSelfCheckRealRejectsDisabledTLS(t *testing.T) {
	c := realConfig()
	c.TLSVerify = false
	if !contains(c.SelfCheck(), "real mode requires AUTH_TLS_VERIFY=true") {
		t.Fatal("tls verify must be required in real mode")
	}
}

func TestSelfCheckPerPlatformRequiresAllPlatforms(t *testing.T) {
	c := realConfig()
	c.IdentityMode = "per-platform"
	c.PlatformCredentials = map[string]Credential{
		"android": {ClientID: "a", Secret: "0123456789abcdef"},
	}
	problems := c.SelfCheck()
	if !contains(problems, "missing credentials for platform ios") {
		t.Fatalf("expected ios gap, got %v", problems)
	}
	if !contains(problems, "missing credentials for platform windows") {
		t.Fatalf("expected windows gap, got %v", problems)
	}
}

func TestSelfCheckMockRules(t *testing.T) {
	c := &Config{
		Env: "development", AuthMode: ModeMock, AllowMock: true,
		HwsimBase: "http://127.0.0.1:8081", IdentityMode: "shared",
		TLSVerify: true, AllowedPlatforms: []string{"android"},
		WindowsRedirectURIs: []string{"http://127.0.0.1:17890/callback"},
		SessionPepper: "pepper-0123456789abcdef", SessionTTL: 24 * 3600 * 1e9,
		SessionMaxAbsolute: 168 * 3600 * 1e9, SessionRenewRatio: 0.2,
		HuaweiTimeout: 3e9, HuaweiBreakerOpen: 15e9, ClockSkew: 60e9,
		JWKSMaxTTL: 12 * 3600 * 1e9, StorageNamespace: "real-mock",
		DualSourceCheck: "auto",
	}
	if p := c.SelfCheck(); len(p) != 0 {
		t.Fatalf("mock config should pass: %v", p)
	}

	c.AllowMock = false
	if !contains(c.SelfCheck(), "mock mode requires AUTH_ALLOW_MOCK=1") {
		t.Fatal("mock without allow flag must fail")
	}

	c.AllowMock = true
	c.Env = "production"
	if !contains(c.SelfCheck(), "mock mode rejected in non-development env") {
		t.Fatal("mock in production must fail")
	}

	c.Env = "development"
	c.HwsimBase = "https://evil.example.com:8081"
	if !contains(c.SelfCheck(), "mock endpoint must be loopback http with port") {
		t.Fatal("non-loopback mock endpoint must fail")
	}

	c.HwsimBase = "http://127.0.0.1:8081"
	c.HuaweiClientID = "real-id"
	if !contains(c.SelfCheck(), "mock mode must not carry real credentials") {
		t.Fatal("mock with real credentials must fail")
	}
}

func TestSelfCheckMockNamespaceRule(t *testing.T) {
	c := &Config{
		Env: "development", AuthMode: ModeMock, AllowMock: true,
		HwsimBase: "http://127.0.0.1:8081", IdentityMode: "shared",
		TLSVerify: true, AllowedPlatforms: []string{"android"},
		WindowsRedirectURIs: []string{"http://127.0.0.1:17890/callback"},
		SessionPepper: "pepper-0123456789abcdef", SessionTTL: 24 * 3600 * 1e9,
		SessionMaxAbsolute: 168 * 3600 * 1e9, SessionRenewRatio: 0.2,
		HuaweiTimeout: 3e9, HuaweiBreakerOpen: 15e9, ClockSkew: 60e9,
		JWKSMaxTTL: 12 * 3600 * 1e9, DualSourceCheck: "auto",
		StorageNamespace: "real",
	}
	if !contains(c.SelfCheck(), "mock storage namespace must end with -mock") {
		t.Fatal("mock namespace must end with -mock")
	}
}

func TestSelfCheckRejectsUnknownModeAndEnv(t *testing.T) {
	c := realConfig()
	c.AuthMode = "prod"
	c.Env = "prod"
	problems := c.SelfCheck()
	if !contains(problems, "invalid AUTH_MODE") || !contains(problems, "invalid ENV") {
		t.Fatalf("expected enum rejection, got %v", problems)
	}
}

func TestSelfCheckOutputNeverContainsValues(t *testing.T) {
	c := realConfig()
	c.HuaweiClientSecret = ""
	problems := c.SelfCheck()
	joined := strings.Join(problems, "; ")
	if strings.Contains(joined, "0123456789abcdef") || strings.Contains(joined, "real-client-id") {
		t.Fatal("self-check output must not contain secrets")
	}
}

func TestDurationParseFailureIsFatal(t *testing.T) {
	t.Setenv("HUAWEI_TIMEOUT", "abc")
	if _, err := duration("HUAWEI_TIMEOUT", 3e9); err == nil {
		t.Fatal("parse failure must return error, not default")
	}
}

func contains(list []string, want string) bool {
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}