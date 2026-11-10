package config

import (
	"errors"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Mode 决定上游是真华为还是本地模拟器（spec 5.4.1）。
const (
	ModeReal = "real"
	ModeMock = "mock"
)

// 官方端点基线（AGC 管理员复核签字前视为基线值，design 2.5.2）。
const (
	OfficialTokenURL     = "https://oauth-login.cloud.huawei.com/oauth2/v3/token"
	OfficialJWKSURL      = "https://oauth-login.cloud.huawei.com/oauth2/v3/certs"
	OfficialTokeninfoURL = "https://oauth-api.cloud.huawei.com/oauth2/v3/tokeninfo"
	OfficialAuthorizeURL = "https://oauth-login.cloud.huawei.com/oauth2/v3/authorize"
)

// Credential 是单个平台的 AGC 凭据；Secret 只允许经掩码输出。
type Credential struct {
	ClientID       string
	Secret         string
	SecretPrevious string
}

func (c Credential) Present() bool { return c.ClientID != "" && c.Secret != "" }

type Config struct {
	// 模式与环境
	Env          string
	AuthMode     string
	AllowMock    bool
	HwsimBase    string
	IdentityMode string

	ServerAddr  string
	TLSCertFile string
	TLSKeyFile  string

	// 共享凭据（identityMode=shared 时使用，兼容既有部署）
	HuaweiClientID       string
	HuaweiClientSecret   string
	HuaweiClientSecretPr string

	// 平台凭据（identityMode=per-platform 时使用）
	PlatformCredentials map[string]Credential

	// 端点（real 模式必须精确等于官方常量）
	HuaweiOAuthBaseURL string
	HuaweiTokenURL     string
	HuaweiJWKSURL      string
	HuaweiTokeninfoURL string
	HuaweiAuthorizeURL string
	IssuerAllowlist    []string
	ClockSkew          time.Duration
	JWKSMaxTTL         time.Duration
	DualSourceCheck    string

	HuaweiTimeout     time.Duration
	HuaweiBreakerOpen time.Duration

	// AGC 身份登记
	AppID                 string
	AndroidPackageName    string
	AndroidReleaseCertSHA string
	IOSBundleID           string
	IOSTeamID             string
	AllowDebugFingerprint bool

	AllowedPlatforms    []string
	WindowsRedirectURIs []string

	SessionTTL         time.Duration
	SessionRenewRatio  float64
	SessionMaxAbsolute time.Duration
	SessionPepper      string

	StorageNamespace string
	DatabaseDriver   string
	DatabaseDSN      string

	RateLimitLoginFails int
	RateLimitCredFails  int
	TrustedProxies      []string
	ClientMinVersion    map[string]string

	AuditSink             string
	AuditQueueSize        int
	AlertSink             string
	AlertWebhookURL       string
	LastKnownGood         string
	CredentialVersion     string
	CredentialChangedBy   string
	CredentialEffectiveAt string

	TLSVerify   bool
	SmokeAllow  bool
	LogLevel    string
	MetricsAddr string
	Version     string

	// 微信开放平台扫码登录（默认关闭，未配置时仅降级为不可用）。
	WeChatEnabled            bool
	WeChatMode               string
	WeChatAppID              string
	WeChatAppSecret          string
	WeChatAppSecretPrevious  string
	WeChatRedirectURIs       []string
	WeChatPrimaryRedirectURI string
	WeChatAuthorizeURL       string
	WeChatTokenURL           string
	WeChatUserInfoURL        string
	WeChatTimeout            time.Duration
	WeChatConnectRetries     int
	WeChatBreakerOpen        time.Duration
	WeChatBreakerThreshold   int
	WeChatStateTTL           time.Duration
	WeChatMaxPendingState    int
	WeChatWarnings           []string

	// 华为云 Track 1 资源探活（只读状态，不参与业务数据面）。
	// RDS_ADDR / REDIS_ADDR 为 VPC 内网 host:port；未配置时 /v1/health 返回 not_configured。
	CloudRegion   string
	DeploymentID  string
	RDSAddr       string
	RedisAddr     string
	MaaSHealthURL string
	MaaSAPIKey    string

	// 本地/内网 Ollama：生成自定义清单。未配置时 endpoint 返回 503。
	OllamaBaseURL  string
	OllamaModel    string
	OllamaTimeout  time.Duration
	OllamaFallback bool
}

// Load 解析环境变量；任何解析失败一律拒绝启动（design 1.2.2 第 4 条）。
func Load() (*Config, error) {
	c := &Config{
		Env:                   env("ENV", "development"),
		AuthMode:              env("AUTH_MODE", ModeReal),
		AllowMock:             boolean("AUTH_ALLOW_MOCK", false),
		HwsimBase:             env("HWSIM_BASE_URL", ""),
		IdentityMode:          env("HUAWEI_IDENTITY_MODE", "shared"),
		ServerAddr:            env("SERVER_ADDR", ":8443"),
		TLSCertFile:           env("TLS_CERT_FILE", ""),
		TLSKeyFile:            env("TLS_KEY_FILE", ""),
		HuaweiClientID:        env("HUAWEI_CLIENT_ID", ""),
		HuaweiClientSecret:    env("HUAWEI_CLIENT_SECRET", ""),
		HuaweiClientSecretPr:  env("HUAWEI_CLIENT_SECRET_PREVIOUS", ""),
		HuaweiOAuthBaseURL:    env("HUAWEI_OAUTH_BASE_URL", ""),
		HuaweiTokenURL:        env("HUAWEI_TOKEN_URL", ""),
		HuaweiJWKSURL:         env("HUAWEI_JWKS_URL", ""),
		HuaweiTokeninfoURL:    env("HUAWEI_TOKENINFO_URL", ""),
		HuaweiAuthorizeURL:    env("HUAWEI_AUTHORIZE_URL", ""),
		DualSourceCheck:       env("AUTH_DUAL_SOURCE_CHECK", "auto"),
		AppID:                 env("AUTH_APP_ID", ""),
		AndroidPackageName:    env("AUTH_ANDROID_PACKAGE_NAME", ""),
		AndroidReleaseCertSHA: strings.ToLower(env("AUTH_ANDROID_RELEASE_CERT_SHA256_DIGEST", "")),
		IOSBundleID:           env("AUTH_IOS_BUNDLE_ID", ""),
		IOSTeamID:             env("AUTH_IOS_TEAM_ID", ""),
		AllowDebugFingerprint: boolean("AUTH_ANDROID_ALLOW_DEBUG_FINGERPRINT", false),
		SessionPepper:         env("SESSION_PEPPER", ""),
		StorageNamespace:      env("AUTH_STORAGE_NAMESPACE", "real"),
		DatabaseDriver:        env("DATABASE_DRIVER", "file"),
		DatabaseDSN:           env("DATABASE_DSN", "./data/auth.json"),
		AuditSink:             env("AUDIT_SINK", "file"),
		AlertSink:             env("AUTH_ALERT_SINK", "log"),
		AlertWebhookURL:       env("AUTH_ALERT_WEBHOOK_URL", ""),
		LastKnownGood:         env("AUTH_LAST_KNOWN_GOOD_PATH", ""),
		CredentialVersion:     env("AUTH_CREDENTIAL_VERSION", ""),
		CredentialChangedBy:   env("AUTH_CREDENTIAL_CHANGED_BY", ""),
		CredentialEffectiveAt: env("AUTH_CREDENTIAL_EFFECTIVE_AT", ""),
		TLSVerify:             boolean("AUTH_TLS_VERIFY", true),
		SmokeAllow:            boolean("AUTH_REAL_SMOKE_ALLOW", false),
		LogLevel:              env("LOG_LEVEL", "info"),
		MetricsAddr:           env("METRICS_ADDR", ""),
		Version:               env("APP_VERSION", "1.0.0"),
		IssuerAllowlist:       list("HUAWEI_ISSUER_ALLOWLIST", []string{"https://accounts.huawei.com", "https://oauth-login.cloud.huawei.com"}),
		PlatformCredentials:   map[string]Credential{},
	}
	for _, p := range []string{"android", "ios", "windows"} {
		upper := strings.ToUpper(p)
		c.PlatformCredentials[p] = Credential{
			ClientID:       env("HUAWEI_CLIENT_ID_"+upper, ""),
			Secret:         env("HUAWEI_CLIENT_SECRET_"+upper, ""),
			SecretPrevious: env("HUAWEI_CLIENT_SECRET_PREVIOUS_"+upper, ""),
		}
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
	if c.ClockSkew, err = duration("AUTH_CLOCK_SKEW", 60*time.Second); err != nil {
		return nil, err
	}
	if c.JWKSMaxTTL, err = duration("AUTH_JWKS_MAX_TTL", 12*time.Hour); err != nil {
		return nil, err
	}
	if c.SessionRenewRatio, err = floatValue("SESSION_RENEW_THRESHOLD", 0.2); err != nil {
		return nil, err
	}
	if c.RateLimitLoginFails, err = integerValue("RATE_LIMIT_LOGIN_FAILS", 10); err != nil {
		return nil, err
	}
	if c.RateLimitCredFails, err = integerValue("RATE_LIMIT_CREDENTIAL_FAILS", 5); err != nil {
		return nil, err
	}
	if c.AuditQueueSize, err = integerValue("AUDIT_QUEUE_SIZE", 4096); err != nil {
		return nil, err
	}

	c.AllowedPlatforms = list("ALLOWED_PLATFORMS", []string{"android", "ios", "windows"})
	c.WindowsRedirectURIs = list("WINDOWS_REDIRECT_URIS", []string{"http://127.0.0.1:17890/callback"})
	c.TrustedProxies = list("TRUSTED_PROXIES", nil)
	c.ClientMinVersion = map[string]string{
		"android": env("CLIENT_MIN_VERSION_ANDROID", "1.0.0"),
		"ios":     env("CLIENT_MIN_VERSION_IOS", "1.0.0"),
		"windows": env("CLIENT_MIN_VERSION_WINDOWS", "1.0.0"),
	}

	// 微信登录配置：默认关闭；未配置时只在开发态告警，生产必须显式配齐。
	c.WeChatEnabled = boolean("WECHAT_ENABLED", false)
	c.WeChatMode = env("WECHAT_MODE", "mock")
	c.WeChatAppID = env("WECHAT_APP_ID", "")
	c.WeChatAppSecret = env("WECHAT_APP_SECRET", "")
	c.WeChatAppSecretPrevious = env("WECHAT_APP_SECRET_PREVIOUS", "")
	c.WeChatRedirectURIs = list("WECHAT_REDIRECT_URIS", nil)
	c.WeChatPrimaryRedirectURI = env("WECHAT_PRIMARY_REDIRECT_URI", "")
	c.WeChatAuthorizeURL = env("WECHAT_AUTHORIZE_URL", OfficialWeChatAuthorizeURL)
	c.WeChatTokenURL = env("WECHAT_TOKEN_URL", OfficialWeChatTokenURL)
	c.WeChatUserInfoURL = env("WECHAT_USERINFO_URL", OfficialWeChatUserInfoURL)
	if c.WeChatTimeout, err = duration("WECHAT_TIMEOUT", 5*time.Second); err != nil {
		return nil, err
	}
	if c.WeChatConnectRetries, err = integerValue("WECHAT_CONNECT_RETRIES", 1); err != nil {
		return nil, err
	}
	if c.WeChatBreakerOpen, err = duration("WECHAT_BREAKER_OPEN", 15*time.Second); err != nil {
		return nil, err
	}
	if c.WeChatBreakerThreshold, err = integerValue("WECHAT_BREAKER_THRESHOLD", 5); err != nil {
		return nil, err
	}
	if c.WeChatStateTTL, err = duration("WECHAT_STATE_TTL", 10*time.Minute); err != nil {
		return nil, err
	}
	if c.WeChatMaxPendingState, err = integerValue("WECHAT_MAX_PENDING_STATE", 3); err != nil {
		return nil, err
	}

	// Track 1 云资源：只读取地址用于健康探活；未配置时保持本地零依赖运行。
	c.CloudRegion = env("CLOUD_REGION", "cn-north-4")
	c.DeploymentID = env("DEPLOYMENT_ID", "local")
	c.RDSAddr = env("RDS_ADDR", "")
	c.RedisAddr = env("REDIS_ADDR", "")
	c.MaaSHealthURL = env("MAAS_HEALTH_URL", "")
	c.MaaSAPIKey = env("MAAS_API_KEY", "")
	c.OllamaBaseURL = env("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
	c.OllamaModel = env("OLLAMA_MODEL", "qwen2.5:0.5b")
	c.OllamaFallback = boolean("OLLAMA_FALLBACK", false)
	if c.OllamaTimeout, err = duration("OLLAMA_TIMEOUT", 60*time.Second); err != nil {
		return nil, err
	}

	c.resolveEndpoints()
	if problems := c.SelfCheck(); len(problems) > 0 {
		sort.Strings(problems)
		return nil, errors.New("config invalid: " + strings.Join(problems, "; "))
	}
	fatal, warnings := c.WeChatSelfCheck()
	c.WeChatWarnings = warnings
	if len(fatal) > 0 {
		sort.Strings(fatal)
		return nil, errors.New("config invalid: " + strings.Join(fatal, "; "))
	}
	return c, nil
}

// resolveEndpoints 支持显式完整 URL，也兼容旧的 base+path 组合。
func (c *Config) resolveEndpoints() {
	if c.HuaweiTokenURL == "" {
		c.HuaweiTokenURL = joinBase(c.HuaweiOAuthBaseURL, "/oauth2/v3/token", OfficialTokenURL)
	}
	if c.HuaweiJWKSURL == "" {
		c.HuaweiJWKSURL = joinBase(c.HuaweiOAuthBaseURL, "/oauth2/v3/certs", OfficialJWKSURL)
	}
	if c.HuaweiTokeninfoURL == "" {
		c.HuaweiTokeninfoURL = joinBase(c.HuaweiOAuthBaseURL, "/oauth2/v3/tokeninfo", OfficialTokeninfoURL)
	}
	if c.HuaweiAuthorizeURL == "" {
		c.HuaweiAuthorizeURL = joinBase(c.HuaweiOAuthBaseURL, "/oauth2/v3/authorize", OfficialAuthorizeURL)
	}
}

func joinBase(base, path, official string) string {
	if base == "" {
		return official
	}
	return strings.TrimRight(base, "/") + path
}

// Validate 保留旧入口，等价于 SelfCheck。
func (c *Config) Validate() error {
	if problems := c.SelfCheck(); len(problems) > 0 {
		sort.Strings(problems)
		return errors.New("config invalid: " + strings.Join(problems, "; "))
	}
	return nil
}

// IsMock 返回是否处于模拟模式。
func (c *Config) IsMock() bool { return c.AuthMode == ModeMock }

// CredentialFor 返回平台凭据；shared 模式回退到共享凭据。
func (c *Config) CredentialFor(platform string) (Credential, bool) {
	if c.IdentityMode == "per-platform" {
		cred, ok := c.PlatformCredentials[platform]
		return cred, ok && cred.Present()
	}
	return Credential{
		ClientID:       c.HuaweiClientID,
		Secret:         c.HuaweiClientSecret,
		SecretPrevious: c.HuaweiClientSecretPr,
	}, c.HuaweiClientID != "" && c.HuaweiClientSecret != ""
}

// Redacted 返回可安全写入日志的摘要，任何路径都不输出 secret。
func (c *Config) Redacted() string {
	return fmt.Sprintf("mode=%s env=%s addr=%s identity=%s token_url=%s secret=%s pepper=%s ttl=%s cloud=%s/%s rds=%t redis=%t maas=%t",
		c.AuthMode, c.Env, c.ServerAddr, c.IdentityMode, c.HuaweiTokenURL,
		MaskSecret(c.HuaweiClientSecret), MaskSecret(c.SessionPepper), c.SessionTTL,
		c.CloudRegion, c.DeploymentID, c.RDSAddr != "", c.RedisAddr != "", c.MaaSHealthURL != "")
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

// IsWindowsRedirectAllowed 逐字符比对回调白名单（不接受尾部斜杠、不接受公网域名）。
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
		return 0, fmt.Errorf("config invalid: invalid %s (parse)", key)
	}
	return d, nil
}

func floatValue(key string, def float64) (float64, error) {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def, nil
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0, fmt.Errorf("config invalid: invalid %s (parse)", key)
	}
	return f, nil
}

func integerValue(key string, def int) (int, error) {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("config invalid: invalid %s (parse)", key)
	}
	return n, nil
}

func boolean(key string, def bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def
	}
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return def
	}
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
