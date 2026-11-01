package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Config 对应 design 2.7.3 的服务端环境变量。
// 敏感字段只允许通过 Redacted()/Masked() 输出。
type Config struct {
	Env                  string
	ServerAddr           string
	TLSCertFile          string
	TLSKeyFile           string
	HuaweiClientID       string
	HuaweiClientSecret   string
	HuaweiClientSecretPr string
	HuaweiOAuthBaseURL   string
	HuaweiTokenPath      string
	HuaweiTokeninfoPath  string
	HuaweiJWKSPath       string
	HuaweiTimeout        time.Duration
	HuaweiBreakerOpen    time.Duration
	AllowedPlatforms     []string
	WindowsRedirectURIs  []string
	SessionTTL           time.Duration
	SessionRenewRatio    float64
	SessionMaxAbsolute   time.Duration
	SessionPepper        string
	DatabaseDriver       string
	DatabaseDSN          string
	RateLimitLoginFails  int
	RateLimitCredFails   int
	TrustedProxies       []string
	ClientMinVersion     map[string]string
	AuditSink            string
	AuditQueueSize       int
	LogLevel             string
	MetricsAddr          string
	Version              string
}

// Load 从环境变量加载配置并执行启动自检。
func Load() (*Config, error) {
	c := &Config{
		Env:                  env("ENV", "development"),
		ServerAddr:           env("SERVER_ADDR", ":8443"),
		TLSCertFile:          env("TLS_CERT_FILE", ""),
		TLSKeyFile:           env("TLS_KEY_FILE", ""),
		HuaweiClientID:       env("HUAWEI_CLIENT_ID", ""),
		HuaweiClientSecret:   env("HUAWEI_CLIENT_SECRET", ""),
		HuaweiClientSecretPr: env("HUAWEI_CLIENT_SECRET_PREVIOUS", ""),
		HuaweiOAuthBaseURL:   env("HUAWEI_OAUTH_BASE_URL", "https://oauth-login.cloud.huawei.com"),
		HuaweiTokenPath:      env("HUAWEI_TOKEN_PATH", "/oauth2/v3/token"),
		HuaweiTokeninfoPath:  env("HUAWEI_TOKENINFO_PATH", "/oauth2/v3/tokeninfo"),
		HuaweiJWKSPath:       env("HUAWEI_JWKS_PATH", "/oauth2/v3/certs"),
		SessionPepper:        env("SESSION_PEPPER", ""),
		DatabaseDriver:       env("DATABASE_DRIVER", "file"),
		DatabaseDSN:          env("DATABASE_DSN", "./data/auth.json"),
		AuditSink:            env("AUDIT_SINK", "file"),
		LogLevel:             env("LOG_LEVEL", "info"),
		MetricsAddr:          env("METRICS_ADDR", ""),
		Version:              env("APP_VERSION", "1.0.0"),
		ClientMinVersion: map[string]string{
			"android": env("CLIENT_MIN_VERSION_ANDROID", "1.0.0"),
			"ios":     env("CLIENT_MIN_VERSION_IOS", "1.0.0"),
			"windows": env("CLIENT_MIN_VERSION_WINDOWS", "1.0.0"),
		},
	}
	var err error
	if c.HuaweiTimeout, err = duration("HUAWEI_TIMEOUT", 3*time.Second); err != nil {
		return nil, err
	}
	if c.HuaweiBreakerOpen, err = duration("HUAWEI_BREAKER_OPEN", 15*time.Second); err != nil {
		return nil, err
	}
	if c.SessionTTL, err = duration("SESSION_TTL", 24*time.Hour); err != nil {
		return nil, err
	}
	if c.SessionMaxAbsolute, err = duration("SESSION_MAX_ABSOLUTE_TTL", 168*time.Hour); err != nil {
		return nil, err
	}
	c.SessionRenewRatio = float("SESSION_RENEW_THRESHOLD", 0.2)
	c.RateLimitLoginFails = integer("RATE_LIMIT_LOGIN_FAILS", 10)
	c.RateLimitCredFails = integer("RATE_LIMIT_CREDENTIAL_FAILS", 5)
	c.AuditQueueSize = integer("AUDIT_QUEUE_SIZE", 4096)
	c.AllowedPlatforms = list("ALLOWED_PLATFORMS", []string{"android", "ios", "windows"})
	c.WindowsRedirectURIs = list("WINDOWS_REDIRECT_URIS", []string{"http://127.0.0.1:17890/callback"})
	c.TrustedProxies = list("TRUSTED_PROXIES", nil)
	if err := c.Validate(); err != nil {
		return nil, err
	}
	return c, nil
}

// Validate 实现任务 6.2 的启动自检；错误信息只包含项名，不含值。
func (c *Config) Validate() error {
	var problems []string
	if c.HuaweiClientID == "" {
		problems = append(problems, "missing HUAWEI_CLIENT_ID")
	}
	if c.HuaweiClientSecret == "" {
		problems = append(problems, "missing HUAWEI_CLIENT_SECRET")
	} else if len(c.HuaweiClientSecret) < 16 {
		problems = append(problems, "invalid HUAWEI_CLIENT_SECRET (too short)")
	}
	if c.SessionPepper == "" {
		problems = append(problems, "missing SESSION_PEPPER")
	} else if len(c.SessionPepper) < 16 {
		problems = append(problems, "invalid SESSION_PEPPER (too short)")
	}
	if c.SessionTTL < time.Hour || c.SessionTTL > 168*time.Hour {
		problems = append(problems, "invalid SESSION_TTL (must be 1h..168h)")
	}
	if c.SessionMaxAbsolute < c.SessionTTL {
		problems = append(problems, "invalid SESSION_MAX_ABSOLUTE_TTL (must be >= SESSION_TTL)")
	}
	if c.SessionRenewRatio <= 0 || c.SessionRenewRatio >= 1 {
		problems = append(problems, "invalid SESSION_RENEW_THRESHOLD (must be in (0,1))")
	}
	if c.HuaweiTimeout < 500*time.Millisecond || c.HuaweiTimeout > 3*time.Second {
		problems = append(problems, "invalid HUAWEI_TIMEOUT (must be 500ms..3s)")
	}
	if c.HuaweiBreakerOpen < 5*time.Second || c.HuaweiBreakerOpen > 60*time.Second {
		problems = append(problems, "invalid HUAWEI_BREAKER_OPEN (must be 5s..60s)")
	}
	if len(c.AllowedPlatforms) == 0 {
		problems = append(problems, "invalid ALLOWED_PLATFORMS (empty)")
	}
	for _, p := range c.AllowedPlatforms {
		if p != "android" && p != "ios" && p != "windows" {
			problems = append(problems, "invalid ALLOWED_PLATFORMS (unknown element)")
			break
		}
	}
	if c.Env == "production" {
		u, err := url.Parse(c.HuaweiOAuthBaseURL)
		if err != nil || !strings.HasSuffix(u.Hostname(), "huawei.com") {
			problems = append(problems, "invalid HUAWEI_OAUTH_BASE_URL (must be official huawei.com domain in production)")
		}
		if c.AuditSink == "discard" {
			problems = append(problems, "invalid AUDIT_SINK (discard not allowed in production)")
		}
		if c.LogLevel == "debug" {
			problems = append(problems, "invalid LOG_LEVEL (debug not allowed in production)")
		}
	}
	if len(problems) > 0 {
		sort.Strings(problems)
		return errors.New("config invalid: " + strings.Join(problems, "; "))
	}
	return nil
}

// Redacted 返回可安全写入日志的配置摘要。
func (c *Config) Redacted() string {
	return fmt.Sprintf("env=%s addr=%s huawei=%s secret=%s pepper=%s ttl=%s",
		c.Env, c.ServerAddr, c.HuaweiOAuthBaseURL, MaskSecret(c.HuaweiClientSecret), MaskSecret(c.SessionPepper), c.SessionTTL)
}

// MaskSecret 保留末 4 位用于人工核对，其余隐藏。
func MaskSecret(s string) string {
	if s == "" {
		return ""
	}
	if len(s) <= 4 {
		return "***"
	}
	return "***" + s[len(s)-4:]
}

// IsWindowsRedirectAllowed 逐字符比对回调白名单（任务 22.5）。
func (c *Config) IsWindowsRedirectAllowed(candidate string) bool {
	for _, allowed := range c.WindowsRedirectURIs {
		if candidate == allowed {
			return true
		}
	}
	return false
}

func env(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

func duration(key string, def time.Duration) (time.Duration, error) {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return 0, fmt.Errorf("config invalid: invalid %s (not a duration)", key)
	}
	return d, nil
}

func float(key string, def float64) float64 {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return def
	}
	return f
}

func integer(key string, def int) int {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func list(key string, def []string) []string {
	v, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(v) == "" {
		return def
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}