package config

import (
	"crypto/tls"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Endpoints 是唯一可信的端点来源（design 2.5.2）。
type Endpoints struct {
	Token     string
	JWKS      string
	Tokeninfo string
	Authorize string
}

// OfficialEndpoints 基线值；变更必须经 AGC 管理员复核签字。
var OfficialEndpoints = Endpoints{
	Token:     OfficialTokenURL,
	JWKS:      OfficialJWKSURL,
	Tokeninfo: OfficialTokeninfoURL,
	Authorize: OfficialAuthorizeURL,
}

// ParseExactURL 要求：https、host 非空、path 非空、无 query/fragment、端口为空或 443。
func ParseExactURL(raw string) (*url.URL, bool) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.Path == "" || u.Path == "/" {
		return nil, false
	}
	if u.RawQuery != "" || u.Fragment != "" || u.User != nil {
		return nil, false
	}
	if port := u.Port(); port != "" && port != "443" {
		return nil, false
	}
	if net.ParseIP(u.Hostname()) != nil || u.Hostname() == "localhost" {
		return nil, false
	}
	return u, true
}

// MatchesOfficial 归一化后逐字节相等；禁止后缀/包含/正则匹配。
func MatchesOfficial(value, want string) bool {
	got, ok := ParseExactURL(value)
	if !ok {
		return false
	}
	expect, ok := ParseExactURL(want)
	if !ok {
		return false
	}
	if !strings.EqualFold(got.Scheme, expect.Scheme) {
		return false
	}
	if !strings.EqualFold(got.Host, expect.Host) {
		return false
	}
	return got.EscapedPath() == expect.EscapedPath()
}

// IsLoopbackEndpoint 仅用于 mock 模式：http + 回环主机 + 显式端口。
func IsLoopbackEndpoint(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "http" {
		return false
	}
	if u.Port() == "" {
		return false
	}
	switch u.Hostname() {
	case "127.0.0.1", "localhost":
		return true
	default:
		return false
	}
}

// ValidateEndpoints 返回不满足精确匹配的端点名称（不含值）。
func (c *Config) ValidateEndpoints() []string {
	var problems []string
	if !MatchesOfficial(c.HuaweiTokenURL, OfficialTokenURL) {
		problems = append(problems, "endpoint token not official")
	}
	if !MatchesOfficial(c.HuaweiJWKSURL, OfficialJWKSURL) {
		problems = append(problems, "endpoint jwks not official")
	}
	if !MatchesOfficial(c.HuaweiTokeninfoURL, OfficialTokeninfoURL) {
		problems = append(problems, "endpoint tokeninfo not official")
	}
	if !MatchesOfficial(c.HuaweiAuthorizeURL, OfficialAuthorizeURL) {
		problems = append(problems, "endpoint authorize not official")
	}
	return problems
}

// NewOutboundClient 构造出网客户端：TLS 1.2+，不跳过证书校验（design 2.5.2）。
func NewOutboundClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12},
			ForceAttemptHTTP2:     true,
			MaxIdleConns:          64,
			IdleConnTimeout:       60 * time.Second,
			TLSHandshakeTimeout:   timeout,
			ResponseHeaderTimeout: timeout,
		},
	}
}