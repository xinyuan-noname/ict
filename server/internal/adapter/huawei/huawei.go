package huawei

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
)

// Client 是系统唯一出网点（design 2.1.2），实现 port.HuaweiIdentityProvider。
type Client struct {
	BaseURL       string
	TokenPath     string
	TokeninfoPath string
	JWKSPath      string
	ClientID      string
	Secret        string
	SecretPrev    string
	Timeout       time.Duration
	HTTP          *http.Client
	Logger        *logx.Logger

	breaker *Breaker

	jwksMu    sync.RWMutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	IDToken     string `json:"id_token"`
	ExpiresIn   int    `json:"expires_in"`
	Error       string `json:"error"`
	ErrorDesc   string `json:"error_description"`
}

type tokeninfoResponse struct {
	OpenID      string `json:"openid"`
	Sub         string `json:"sub"`
	UnionID     string `json:"unionid"`
	DisplayName string `json:"display_name"`
	NickName    string `json:"nickName"`
	Picture     string `json:"picture"`
	HeadPic     string `json:"head_picture_url"`
	IssuerAppID string `json:"client_id"`
}

// Exchange 按「换票 → ID Token 验签 → tokeninfo 回退」执行（design 2.5.2）。
func (c *Client) Exchange(ctx context.Context, code string, platform domain.Platform, redirectURI string) (domain.HuaweiIdentity, error) {
	if c.breaker != nil && !c.breaker.Allow() {
		return domain.HuaweiIdentity{}, apperr.New(apperr.Auth003, errors.New("breaker open"))
	}
	ctx, cancel := context.WithTimeout(ctx, c.Timeout)
	defer cancel()

	tr, err := c.exchangeToken(ctx, code, c.Secret, platform, redirectURI)
	if err != nil {
		var te *tokenError
		if errors.As(err, &te) && te.code == "invalid_client" && c.SecretPrev != "" {
			c.Logger.Warn(ctx, "client secret fallback", "event", "key_rotation_fallback")
			tr, err = c.exchangeToken(ctx, code, c.SecretPrev, platform, redirectURI)
		}
	}
	if err != nil {
		c.record(false)
		return domain.HuaweiIdentity{}, normalize(err)
	}

	var identity domain.HuaweiIdentity
	verified := false
	if tr.IDToken != "" {
		if id, verr := c.verifyIDToken(ctx, tr.IDToken); verr == nil {
			identity = id
			verified = true
		} else {
			c.Logger.Info(ctx, "id_token verify fallback", "event", "idtoken_fallback", "reason", verr.Error())
		}
	}

	if !verified {
		ti, terr := c.fetchTokeninfo(ctx, tr.AccessToken)
		if terr != nil {
			c.record(false)
			return domain.HuaweiIdentity{}, normalize(terr)
		}
		identity = mapIdentity(ti)
		if tr.IDToken != "" {
			if id, verr := c.verifyIDTokenLenient(ctx, tr.IDToken); verr == nil && id.OpenID != "" && identity.OpenID != "" && id.OpenID != identity.OpenID {
				c.record(false)
				return domain.HuaweiIdentity{}, apperr.New(apperr.Auth011, errors.New("openId mismatch between id_token and tokeninfo"))
			}
		}
	}

	if identity.OpenID == "" || !domain.ValidOpenID(identity.OpenID) {
		c.record(false)
		return domain.HuaweiIdentity{}, apperr.New(apperr.Auth011, errors.New("missing or invalid openId"))
	}
	c.record(true)
	return identity, nil
}

type tokenError struct {
	code string
	desc string
}

func (e *tokenError) Error() string { return "huawei token error: " + e.code }

func (c *Client) exchangeToken(ctx context.Context, code, secret string, platform domain.Platform, redirectURI string) (*tokenResponse, error) {
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("client_id", c.ClientID)
	form.Set("client_secret", secret)
	form.Set("code", code)
	if platform == domain.PlatformWindows && redirectURI != "" {
		form.Set("redirect_uri", redirectURI)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.BaseURL, "/")+c.TokenPath, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.httpClient().Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, apperr.New(apperr.Auth003, err)
		}
		// 仅连接完全未建立时允许一次重试（任务 15.3）。
		resp2, err2 := c.httpClient().Do(req.Clone(ctx))
		if err2 != nil {
			return nil, apperr.New(apperr.Auth003, err2)
		}
		defer resp2.Body.Close()
		return decodeToken(resp2)
	}
	defer resp.Body.Close()
	return decodeToken(resp)
}

func decodeToken(resp *http.Response) (*tokenResponse, error) {
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, apperr.New(apperr.Auth003, err)
	}
	var tr tokenResponse
	if jerr := json.Unmarshal(body, &tr); jerr != nil {
		return nil, apperr.New(apperr.Auth011, jerr)
	}
	if resp.StatusCode >= 500 || resp.StatusCode == http.StatusTooManyRequests {
		return nil, apperr.New(apperr.Auth003, fmt.Errorf("upstream status %d", resp.StatusCode))
	}
	if tr.Error != "" {
		if tr.Error == "invalid_grant" {
			return nil, apperr.New(apperr.Auth001, &tokenError{code: tr.Error, desc: tr.ErrorDesc})
		}
		if tr.Error == "invalid_client" {
			return nil, &tokenError{code: tr.Error, desc: tr.ErrorDesc}
		}
		return nil, apperr.New(apperr.Auth003, &tokenError{code: tr.Error, desc: tr.ErrorDesc})
	}
	if resp.StatusCode != http.StatusOK {
		return nil, apperr.New(apperr.Auth011, fmt.Errorf("upstream status %d", resp.StatusCode))
	}
	return &tr, nil
}

type jwtHeader struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
}

type jwtClaims struct {
	Iss string `json:"iss"`
	Aud string `json:"aud"`
	Sub string `json:"sub"`
	Exp int64  `json:"exp"`
	// 华为扩展字段
	UnionID     string `json:"unionid"`
	DisplayName string `json:"display_name"`
	Picture     string `json:"picture"`
	ClientID    string `json:"client_id"`
}

func (c *Client) verifyIDToken(ctx context.Context, token string) (domain.HuaweiIdentity, error) {
	return c.verifyJWT(ctx, token, true)
}

func (c *Client) verifyIDTokenLenient(ctx context.Context, token string) (domain.HuaweiIdentity, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return domain.HuaweiIdentity{}, errors.New("malformed jwt")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return domain.HuaweiIdentity{}, err
	}
	var claims jwtClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return domain.HuaweiIdentity{}, err
	}
	return domain.HuaweiIdentity{OpenID: claims.Sub, UnionID: claims.UnionID, DisplayName: pick(claims.DisplayName), AvatarURL: claims.Picture}, nil
}

func (c *Client) verifyJWT(ctx context.Context, token string, strict bool) (domain.HuaweiIdentity, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return domain.HuaweiIdentity{}, errors.New("malformed jwt")
	}
	hb, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return domain.HuaweiIdentity{}, err
	}
	var hdr jwtHeader
	if err := json.Unmarshal(hb, &hdr); err != nil {
		return domain.HuaweiIdentity{}, err
	}
	if hdr.Alg != "RS256" {
		return domain.HuaweiIdentity{}, errors.New("unsupported alg")
	}
	pub, err := c.publicKey(ctx, hdr.Kid)
	if err != nil {
		return domain.HuaweiIdentity{}, err
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return domain.HuaweiIdentity{}, err
	}
	hash := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(pub, crypto.SHA256, hash[:], sig); err != nil {
		return domain.HuaweiIdentity{}, errors.New("signature mismatch")
	}
	pb, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return domain.HuaweiIdentity{}, err
	}
	var claims jwtClaims
	if err := json.Unmarshal(pb, &claims); err != nil {
		return domain.HuaweiIdentity{}, err
	}
	if strict {
		if claims.Aud != "" && c.ClientID != "" && claims.Aud != c.ClientID {
			return domain.HuaweiIdentity{}, errors.New("aud mismatch")
		}
		if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
			return domain.HuaweiIdentity{}, errors.New("token expired")
		}
	}
	return domain.HuaweiIdentity{
		OpenID:      claims.Sub,
		UnionID:     claims.UnionID,
		DisplayName: pick(claims.DisplayName),
		AvatarURL:   claims.Picture,
		IssuerAppID: claims.ClientID,
	}, nil
}

// publicKey 拉取并缓存 JWKS 12 小时（任务 16.1）。
func (c *Client) publicKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	c.jwksMu.RLock()
	if time.Since(c.fetchedAt) < 12*time.Hour {
		if pk, ok := c.keys[kid]; ok {
			c.jwksMu.RUnlock()
			return pk, nil
		}
	}
	c.jwksMu.RUnlock()

	if err := c.refreshJWKS(ctx); err != nil {
		return nil, err
	}
	c.jwksMu.RLock()
	defer c.jwksMu.RUnlock()
	if pk, ok := c.keys[kid]; ok {
		return pk, nil
	}
	return nil, errors.New("kid not found in jwks")
}

type jwk struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func (c *Client) refreshJWKS(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(c.BaseURL, "/")+c.JWKSPath, nil)
	if err != nil {
		return err
	}
	resp, err := c.httpClient().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("jwks status %d", resp.StatusCode)
	}
	var set struct {
		Keys []jwk `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&set); err != nil {
		return err
	}
	keys := make(map[string]*rsa.PublicKey, len(set.Keys))
	for _, k := range set.Keys {
		nb, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil || k.Kty != "RSA" {
			continue
		}
		eb, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			continue
		}
		keys[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(nb), E: int(new(big.Int).SetBytes(eb).Int64())}
	}
	c.jwksMu.Lock()
	c.keys = keys
	c.fetchedAt = time.Now()
	c.jwksMu.Unlock()
	return nil
}

func (c *Client) fetchTokeninfo(ctx context.Context, accessToken string) (*tokeninfoResponse, error) {
	form := url.Values{}
	form.Set("access_token", accessToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.BaseURL, "/")+c.TokeninfoPath, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, apperr.New(apperr.Auth003, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, apperr.New(apperr.Auth003, fmt.Errorf("tokeninfo status %d", resp.StatusCode))
	}
	var ti tokeninfoResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&ti); err != nil {
		return nil, apperr.New(apperr.Auth011, err)
	}
	return &ti, nil
}

// mapIdentity 是白名单映射：仅保留 openId/unionId/昵称/头像（任务 17.2/17.3）。
func mapIdentity(ti *tokeninfoResponse) domain.HuaweiIdentity {
	openID := ti.OpenID
	if openID == "" {
		openID = ti.Sub
	}
	return domain.HuaweiIdentity{
		OpenID:      openID,
		UnionID:     ti.UnionID,
		DisplayName: pick(ti.DisplayName, ti.NickName),
		AvatarURL:   pick(ti.HeadPic, ti.Picture),
		IssuerAppID: ti.IssuerAppID,
	}
}

func pick(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

func normalize(err error) error {
	if err == nil {
		return nil
	}
	var ae *apperr.Error
	if errors.As(err, &ae) {
		return ae
	}
	var te *tokenError
	if errors.As(err, &te) {
		if te.code == "invalid_grant" {
			return apperr.New(apperr.Auth001, err)
		}
		if te.code == "invalid_client" {
			return apperr.New(apperr.Auth008, err)
		}
	}
	return apperr.New(apperr.Auth003, err)
}

func (c *Client) httpClient() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: c.Timeout}
}

func (c *Client) record(ok bool) {
	if c.breaker != nil {
		c.breaker.Record(ok)
	}
}

// Probe 供 /v1/health 使用。
func (c *Client) Probe(ctx context.Context) string {
	if c.breaker == nil {
		return "unknown"
	}
	switch c.breaker.State() {
	case StateOpen:
		return "degraded"
	case StateClosed:
		return "ok"
	default:
		return "unknown"
	}
}

// Breaker 是简化三态熔断器（任务 18.1）。
type BreakerState int

const (
	StateClosed BreakerState = iota
	StateOpen
	StateHalfOpen
)

type Breaker struct {
	mu              sync.Mutex
	state           BreakerState
	failures        int
	threshold       int
	openDuration    time.Duration
	openedAt        time.Time
	halfOpenProbing bool
}

func NewBreaker(threshold int, openDuration time.Duration) *Breaker {
	return &Breaker{threshold: threshold, openDuration: openDuration}
}

func (b *Breaker) Allow() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	switch b.state {
	case StateClosed:
		return true
	case StateOpen:
		if time.Since(b.openedAt) >= b.openDuration {
			b.state = StateHalfOpen
			b.halfOpenProbing = true
			return true
		}
		return false
	default:
		if b.halfOpenProbing {
			return false
		}
		b.halfOpenProbing = true
		return true
	}
}

func (b *Breaker) Record(ok bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if ok {
		b.failures = 0
		b.state = StateClosed
		b.halfOpenProbing = false
		return
	}
	b.failures++
	b.halfOpenProbing = false
	if b.state == StateHalfOpen || b.failures >= b.threshold {
		b.state = StateOpen
		b.openedAt = time.Now()
	}
}

func (b *Breaker) State() BreakerState {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.state == StateOpen && time.Since(b.openedAt) >= b.openDuration {
		return StateHalfOpen
	}
	return b.state
}

// New 构造带熔断的客户端。
func New(baseURL, tokenPath, tokeninfoPath, jwksPath, clientID, secret, secretPrev string, timeout time.Duration, logger *logx.Logger) *Client {
	return &Client{
		BaseURL:       baseURL,
		TokenPath:     tokenPath,
		TokeninfoPath: tokeninfoPath,
		JWKSPath:      jwksPath,
		ClientID:      clientID,
		Secret:        secret,
		SecretPrev:    secretPrev,
		Timeout:       timeout,
		Logger:        logger,
		breaker:       NewBreaker(5, 15*time.Second),
		keys:          map[string]*rsa.PublicKey{},
	}
}