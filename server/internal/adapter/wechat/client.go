package wechat

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/logx"
	"ict/server/internal/port"
)

// ErrorKind 是归类后的上游错误；不携带上游 errmsg 原文。
type ErrorKind string

const (
	KindCodeInvalid         ErrorKind = "wechat_code_invalid"
	KindCodeReplayed        ErrorKind = "wechat_code_replayed"
	KindSecretInvalid       ErrorKind = "wechat_secret_invalid"
	KindUpstreamUnavailable ErrorKind = "wechat_upstream_unavailable"
	KindIdentityMissing     ErrorKind = "wechat_identity_missing"
)

type Error struct {
	Kind    ErrorKind
	ErrCode int
}

func (e *Error) Error() string { return string(e.Kind) }

type Options struct {
	AppID             string
	Secret            string
	SecretPrevious    string
	PrimaryRedirectURI string
	AuthorizeURL      string
	TokenURL          string
	UserInfoURL       string
	Timeout           time.Duration
	ConnectRetries    int
	BreakerThreshold  int
	BreakerOpen       time.Duration
	HTTP              *http.Client
	Logger            *logx.Logger
	Now               func() time.Time
}

// Client 实现 port.WeChatIdentityProvider；与华为适配器使用独立实例与连接。
type Client struct {
	opts    Options
	http    *http.Client
	breaker *breaker
}

var reCode = regexp.MustCompile(`^[A-Za-z0-9_-]{1,512}$`)

func New(opts Options) *Client {
	httpClient := opts.HTTP
	if httpClient == nil {
		httpClient = &http.Client{Timeout: opts.Timeout}
	}
	return &Client{
		opts:    opts,
		http:    httpClient,
		breaker: newBreaker(opts.BreakerThreshold, opts.BreakerOpen),
	}
}

func (c *Client) now() time.Time {
	if c.opts.Now != nil {
		return c.opts.Now()
	}
	return time.Now().UTC()
}

// AuthorizeURL 参数顺序固定：appid → redirect_uri → response_type → scope → state。
func (c *Client) AuthorizeURL(state string) (string, error) {
	state = strings.TrimSpace(state)
	if state == "" {
		return "", errors.New("state required")
	}
	if c.opts.AppID == "" || c.opts.PrimaryRedirectURI == "" || c.opts.AuthorizeURL == "" {
		return "", errors.New("wechat not configured")
	}
	return c.opts.AuthorizeURL +
		"?appid=" + url.QueryEscape(c.opts.AppID) +
		"&redirect_uri=" + url.QueryEscape(c.opts.PrimaryRedirectURI) +
		"&response_type=code&scope=snsapi_login&state=" + url.QueryEscape(state) +
		"#wechat_redirect", nil
}

// ExchangeCode 用一次性 code 换票；密钥错误时允许旧密钥回退一次。
func (c *Client) ExchangeCode(ctx context.Context, code string) (port.WeChatToken, error) {
	code = strings.TrimSpace(code)
	if code == "" || !reCode.MatchString(code) {
		return port.WeChatToken{}, &Error{Kind: KindCodeInvalid}
	}
	now := c.now()
	if !c.breaker.allow(now) {
		return port.WeChatToken{}, &Error{Kind: KindUpstreamUnavailable}
	}
	token, err := c.exchange(ctx, code, c.opts.Secret)
	if err == nil {
		c.breaker.success()
		return token, nil
	}
	var we *Error
	if errors.As(err, &we) && we.Kind == KindSecretInvalid && c.opts.SecretPrevious != "" {
		retry, retryErr := c.exchange(ctx, code, c.opts.SecretPrevious)
		if retryErr == nil {
			c.breaker.success()
			c.log(ctx, "wechat_key_rotation_fallback", 0)
			return retry, nil
		}
		err = retryErr
	}
	c.breaker.failure(now)
	c.log(ctx, "wechat_exchange_failed", we.errCodeValue())
	return port.WeChatToken{}, err
}

func (e *Error) errCodeValue() int {
	if e == nil {
		return 0
	}
	return e.ErrCode
}

func (c *Client) exchange(ctx context.Context, code, secret string) (port.WeChatToken, error) {
	form := url.Values{
		"appid":      {c.opts.AppID},
		"secret":     {secret},
		"code":       {code},
		"grant_type": {"authorization_code"},
	}
	body := form.Encode()
	attempts := c.opts.ConnectRetries
	if attempts < 0 {
		attempts = 0
	}
	var lastErr error
	for attempt := 0; attempt <= attempts; attempt++ {
		started := c.now()
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.opts.TokenURL, strings.NewReader(body))
		if err != nil {
			return port.WeChatToken{}, &Error{Kind: KindUpstreamUnavailable}
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		resp, err := c.http.Do(req)
		if err != nil {
			lastErr = err
			if attempt < attempts && isConnectFailure(err) {
				continue
			}
			return port.WeChatToken{}, &Error{Kind: KindUpstreamUnavailable}
		}
		token, err := parseTokenResponse(resp)
		_ = resp.Body.Close()
		c.log(ctx, "wechat_exchange", elapsedMs(started, c.now()))
		if err != nil {
			return port.WeChatToken{}, err
		}
		return token, nil
	}
	_ = lastErr
	return port.WeChatToken{}, &Error{Kind: KindUpstreamUnavailable}
}

func parseTokenResponse(resp *http.Response) (port.WeChatToken, error) {
	if resp == nil {
		return port.WeChatToken{}, &Error{Kind: KindUpstreamUnavailable}
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return port.WeChatToken{}, &Error{Kind: KindUpstreamUnavailable}
	}
	if resp.StatusCode >= 500 {
		return port.WeChatToken{}, &Error{Kind: KindUpstreamUnavailable}
	}
	var payload struct {
		AccessToken string `json:"access_token"`
		OpenID      string `json:"openid"`
		UnionID     string `json:"unionid"`
		ExpiresIn   int    `json:"expires_in"`
		ErrCode     int    `json:"errcode"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return port.WeChatToken{}, &Error{Kind: KindUpstreamUnavailable}
	}
	if payload.ErrCode != 0 {
		return port.WeChatToken{}, classify(payload.ErrCode)
	}
	if payload.OpenID == "" || payload.AccessToken == "" {
		return port.WeChatToken{}, &Error{Kind: KindIdentityMissing}
	}
	return port.WeChatToken{
		AccessToken: payload.AccessToken, OpenID: payload.OpenID,
		UnionID: payload.UnionID, ExpiresIn: payload.ExpiresIn,
	}, nil
}

func classify(code int) *Error {
	switch code {
	case 40029:
		return &Error{Kind: KindCodeInvalid, ErrCode: code}
	case 40163:
		return &Error{Kind: KindCodeReplayed, ErrCode: code}
	case 40001, 40125, 41002:
		return &Error{Kind: KindSecretInvalid, ErrCode: code}
	default:
		return &Error{Kind: KindUpstreamUnavailable, ErrCode: code}
	}
}

// FetchUserInfo 只取昵称与头像；任何失败都返回空值，不阻断登录。
func (c *Client) FetchUserInfo(ctx context.Context, accessToken, openID string) (string, string) {
	if accessToken == "" || openID == "" {
		return "", ""
	}
	u := c.opts.UserInfoURL +
		"?access_token=" + url.QueryEscape(accessToken) +
		"&openid=" + url.QueryEscape(openID) + "&lang=zh_CN"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", ""
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return "", ""
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 500 {
		return "", ""
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return "", ""
	}
	var payload struct {
		Nickname  string `json:"nickname"`
		HeadImgURL string `json:"headimgurl"`
		ErrCode   int    `json:"errcode"`
	}
	if json.Unmarshal(raw, &payload) != nil || payload.ErrCode != 0 {
		return "", ""
	}
	return domain.SanitizeDisplayName(payload.Nickname), domain.SanitizeAvatarURL(payload.HeadImgURL)
}

func (c *Client) Probe(ctx context.Context) string {
	if c.breaker.isOpen(c.now()) {
		return "degraded"
	}
	return "ok"
}

func (c *Client) log(ctx context.Context, event string, errCode int) {
	if c.opts.Logger == nil {
		return
	}
	c.opts.Logger.Info(ctx, event, "event", event, "errCode", errCode)
}

func elapsedMs(start, end time.Time) int {
	return int(end.Sub(start).Milliseconds())
}

// isConnectFailure 只把"未收到响应"的连接类错误视为可重试；超时不重试。
func isConnectFailure(err error) bool {
	var nerr net.Error
	if errors.As(err, &nerr) && nerr.Timeout() {
		return false
	}
	var uerr *url.Error
	if errors.As(err, &uerr) {
		var nerr2 net.Error
		if errors.As(uerr.Err, &nerr2) && nerr2.Timeout() {
			return false
		}
	}
	return true
}

var _ port.WeChatIdentityProvider = (*Client)(nil)