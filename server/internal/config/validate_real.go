package config

import (
	"regexp"
	"strings"
	"time"
)

// SelfCheck 实现 18 项启动自检的可测子集（spec 5.2.3 / design 2.5.1）。
// 返回项名列表；任何路径都不包含配置值。
func (c *Config) SelfCheck() []string {
	var p []string
	p = append(p, c.checkMode()...)
	if c.IsMock() {
		p = append(p, c.checkMock()...)
	} else {
		p = append(p, c.checkReal()...)
	}
	p = append(p, c.checkCommon()...)
	return p
}

func (c *Config) checkMode() []string {
	var p []string
	if c.AuthMode != ModeReal && c.AuthMode != ModeMock {
		p = append(p, "invalid AUTH_MODE")
	}
	switch c.Env {
	case "development", "staging", "production":
	default:
		p = append(p, "invalid ENV")
	}
	if c.IdentityMode != "shared" && c.IdentityMode != "per-platform" {
		p = append(p, "invalid HUAWEI_IDENTITY_MODE")
	}
	if c.DualSourceCheck != "auto" && c.DualSourceCheck != "strict" {
		p = append(p, "invalid AUTH_DUAL_SOURCE_CHECK")
	}
	return p
}

func (c *Config) checkMock() []string {
	var p []string
	if c.Env != "development" {
		p = append(p, "mock mode rejected in non-development env")
	}
	if !c.AllowMock {
		p = append(p, "mock mode requires AUTH_ALLOW_MOCK=1")
	}
	if !IsLoopbackEndpoint(c.HwsimBase) {
		p = append(p, "mock endpoint must be loopback http with port")
	}
	if c.HwsimBase == "" {
		p = append(p, "missing HWSIM_BASE_URL")
	}
	if hasRealCredentials(c) {
		p = append(p, "mock mode must not carry real credentials")
	}
	if c.TLSVerify != false {
		// mock 走 http 回环，TLS 校验无意义；不视为错误。
	}
	return p
}

func (c *Config) checkReal() []string {
	var p []string
	if c.HwsimBase != "" {
		p = append(p, "real mode must not set HWSIM_BASE_URL")
	}
	p = append(p, c.ValidateEndpoints()...)
	if !c.TLSVerify {
		p = append(p, "real mode requires AUTH_TLS_VERIFY=true")
	}
	for _, platform := range c.AllowedPlatforms {
		cred, ok := c.CredentialFor(platform)
		if !ok {
			p = append(p, "missing credentials for platform "+platform)
			continue
		}
		if isPlaceholder(cred.ClientID) || isPlaceholder(cred.Secret) {
			p = append(p, "placeholder credentials for platform "+platform)
			continue
		}
		if len(cred.Secret) < 16 {
			p = append(p, "invalid secret length for platform "+platform)
		}
	}
	if c.Env == "production" {
		if c.AppID == "" {
			p = append(p, "missing AUTH_APP_ID")
		}
		if c.AndroidPackageName == "" {
			p = append(p, "missing AUTH_ANDROID_PACKAGE_NAME")
		}
		if !sha256Hex.MatchString(c.AndroidReleaseCertSHA) {
			p = append(p, "invalid AUTH_ANDROID_RELEASE_CERT_SHA256_DIGEST")
		}
		if c.IOSBundleID == "" {
			p = append(p, "missing AUTH_IOS_BUNDLE_ID")
		}
		if c.IOSTeamID != "" && len(c.IOSTeamID) != 10 {
			p = append(p, "invalid AUTH_IOS_TEAM_ID")
		}
		if c.AllowDebugFingerprint {
			p = append(p, "debug fingerprint not allowed in production")
		}
		if c.AuditSink == "discard" {
			p = append(p, "invalid AUDIT_SINK (discard not allowed in production)")
		}
		if c.LogLevel == "debug" {
			p = append(p, "invalid LOG_LEVEL (debug not allowed in production)")
		}
	}
	for _, uri := range c.WindowsRedirectURIs {
		if !IsLoopbackEndpoint(uri) {
			p = append(p, "windows redirect must be loopback http")
			break
		}
	}
	return p
}

func (c *Config) checkCommon() []string {
	var p []string
	if c.SessionPepper == "" {
		p = append(p, "missing SESSION_PEPPER")
	} else if len(c.SessionPepper) < 16 {
		p = append(p, "invalid SESSION_PEPPER (too short)")
	}
	if c.SessionTTL < time.Hour || c.SessionTTL > 168*time.Hour {
		p = append(p, "invalid SESSION_TTL (must be 1h..168h)")
	}
	if c.SessionMaxAbsolute < c.SessionTTL {
		p = append(p, "invalid SESSION_MAX_ABSOLUTE_TTL (must be >= SESSION_TTL)")
	}
	if c.SessionRenewRatio <= 0 || c.SessionRenewRatio >= 1 {
		p = append(p, "invalid SESSION_RENEW_THRESHOLD (must be in (0,1))")
	}
	if c.HuaweiTimeout < 500*time.Millisecond || c.HuaweiTimeout > 3*time.Second {
		p = append(p, "invalid HUAWEI_TIMEOUT (must be 500ms..3s)")
	}
	if c.HuaweiBreakerOpen < 5*time.Second || c.HuaweiBreakerOpen > 60*time.Second {
		p = append(p, "invalid HUAWEI_BREAKER_OPEN (must be 5s..60s)")
	}
	if c.ClockSkew < 0 || c.ClockSkew > 300*time.Second {
		p = append(p, "invalid AUTH_CLOCK_SKEW (must be 0..300s)")
	}
	if c.JWKSMaxTTL < 5*time.Minute || c.JWKSMaxTTL > 12*time.Hour {
		p = append(p, "invalid AUTH_JWKS_MAX_TTL (must be 5m..12h)")
	}
	if len(c.AllowedPlatforms) == 0 {
		p = append(p, "invalid ALLOWED_PLATFORMS (empty)")
	}
	for _, platform := range c.AllowedPlatforms {
		if platform != "android" && platform != "ios" && platform != "windows" {
			p = append(p, "invalid ALLOWED_PLATFORMS (unknown element)")
			break
		}
	}
	p = append(p, c.checkNamespace()...)
	return p
}

func (c *Config) checkNamespace() []string {
	var p []string
	ns := strings.TrimSpace(c.StorageNamespace)
	if ns == "" {
		p = append(p, "missing AUTH_STORAGE_NAMESPACE")
		return p
	}
	mockSuffix := strings.HasSuffix(ns, "-mock")
	if c.IsMock() && !mockSuffix {
		p = append(p, "mock storage namespace must end with -mock")
	}
	if !c.IsMock() && mockSuffix {
		p = append(p, "real storage namespace must not end with -mock")
	}
	return p
}

func hasRealCredentials(c *Config) bool {
	if c.HuaweiClientID != "" || c.HuaweiClientSecret != "" || c.HuaweiClientSecretPr != "" {
		return true
	}
	for _, cred := range c.PlatformCredentials {
		if cred.ClientID != "" || cred.Secret != "" || cred.SecretPrevious != "" {
			return true
		}
	}
	return false
}

func isPlaceholder(v string) bool {
	return strings.Contains(v, "<YOUR_") || strings.Contains(v, "CHANGE_ME")
}

var sha256Hex = regexp.MustCompile(`^[0-9a-f]{64}$`)