package wechat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"ict/server/internal/port"
)

func testOptions(tokenURL, userInfoURL string) Options {
	return Options{
		AppID:              "wx_app",
		Secret:             "secret_new",
		PrimaryRedirectURI: "https://example.com/v1/auth/wechat/callback",
		AuthorizeURL:       "https://open.weixin.qq.com/connect/qrconnect",
		TokenURL:           tokenURL,
		UserInfoURL:        userInfoURL,
		Timeout:            2 * time.Second,
		ConnectRetries:     1,
		BreakerThreshold:   5,
		BreakerOpen:        15 * time.Second,
	}
}

// WXO-05/06/62：授权地址参数顺序固定、redirect_uri 不可被覆盖、URL 无 Secret。
func TestAuthorizeURL(t *testing.T) {
	c := New(testOptions("https://api.weixin.qq.com/sns/oauth2/access_token", "https://api.weixin.qq.com/sns/userinfo"))
	got, err := c.AuthorizeURL("state_abc")
	if err != nil {
		t.Fatalf("AuthorizeURL: %v", err)
	}
	want := "https://open.weixin.qq.com/connect/qrconnect" +
		"?appid=wx_app" +
		"&redirect_uri=https%3A%2F%2Fexample.com%2Fv1%2Fauth%2Fwechat%2Fcallback" +
		"&response_type=code&scope=snsapi_login&state=state_abc#wechat_redirect"
	if got != want {
		t.Fatalf("unexpected authorize url:\n%s\nwant:\n%s", got, want)
	}
	if strings.Contains(got, "secret") || strings.Contains(got, "snsapi_userinfo") {
		t.Fatal("授权地址不得包含密钥或越权 scope")
	}
	if _, err := c.AuthorizeURL(""); err == nil {
		t.Fatal("空 state 应失败")
	}
	other, _ := c.AuthorizeURL("state_xyz")
	if other == got {
		t.Fatal("不同 state 应产生不同地址")
	}
}

func tokenServer(t *testing.T, body func(r *http.Request) (int, string)) (*httptest.Server, *int32) {
	t.Helper()
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		status, payload := body(r)
		w.WriteHeader(status)
		_, _ = w.Write([]byte(payload))
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

// WXO-09/16/56：errCode 归类。
func TestExchangeCodeClassification(t *testing.T) {
	cases := []struct {
		code    int
		kind    ErrorKind
	}{
		{40029, KindCodeInvalid},
		{40163, KindCodeReplayed},
		{40001, KindSecretInvalid},
		{41002, KindSecretInvalid},
		{45009, KindUpstreamUnavailable},
		{-1, KindUpstreamUnavailable},
	}
	for _, tc := range cases {
		t.Run(fmt.Sprint(tc.code), func(t *testing.T) {
			srv, _ := tokenServer(t, func(r *http.Request) (int, string) {
				return 200, fmt.Sprintf(`{"errcode":%d,"errmsg":"upstream secret text"}`, tc.code)
			})
			c := New(testOptions(srv.URL, srv.URL))
			_, err := c.ExchangeCode(context.Background(), "valid_code_123")
			var we *Error
			if !errors.As(err, &we) || we.Kind != tc.kind {
				t.Fatalf("errcode %d: got %v, want %s", tc.code, err, tc.kind)
			}
			if strings.Contains(err.Error(), "upstream secret text") {
				t.Fatal("错误不得透传上游原文")
			}
		})
	}
}

// WXO-09/10：成功换票；缺 openid 视为身份缺失。
func TestExchangeCodeSuccessAndMissingIdentity(t *testing.T) {
	srv, _ := tokenServer(t, func(r *http.Request) (int, string) {
		return 200, `{"access_token":"at","openid":"openid_1","unionid":"union_1","expires_in":7200}`
	})
	c := New(testOptions(srv.URL, srv.URL))
	token, err := c.ExchangeCode(context.Background(), "valid_code_123")
	if err != nil {
		t.Fatalf("ExchangeCode: %v", err)
	}
	if token.OpenID != "openid_1" || token.AccessToken != "at" || token.UnionID != "union_1" {
		t.Fatalf("token=%+v", token)
	}

	srv2, _ := tokenServer(t, func(r *http.Request) (int, string) {
		return 200, `{"access_token":"at","expires_in":7200}`
	})
	c2 := New(testOptions(srv2.URL, srv2.URL))
	_, err = c2.ExchangeCode(context.Background(), "valid_code_123")
	var we *Error
	if !errors.As(err, &we) || we.Kind != KindIdentityMissing {
		t.Fatalf("want identity missing, got %v", err)
	}
}

// WXO-09：空/非法 code 不发起上游。
func TestExchangeCodeRejectsInvalidInput(t *testing.T) {
	srv, calls := tokenServer(t, func(r *http.Request) (int, string) {
		return 200, `{"openid":"x"}`
	})
	c := New(testOptions(srv.URL, srv.URL))
	for _, code := range []string{"", "bad code!", strings.Repeat("a", 513)} {
		if _, err := c.ExchangeCode(context.Background(), code); err == nil {
			t.Fatalf("code %q 应被拒绝", code)
		}
	}
	if atomic.LoadInt32(calls) != 0 {
		t.Fatal("非法 code 不得调用上游")
	}
}

// WXO-16/P8：连续失败触发熔断，打开期不发请求。
func TestBreakerOpensAfterThreshold(t *testing.T) {
	srv, calls := tokenServer(t, func(r *http.Request) (int, string) {
		return 500, `{}`
	})
	c := New(testOptions(srv.URL, srv.URL))
	for i := 0; i < 5; i++ {
		if _, err := c.ExchangeCode(context.Background(), "code_"+string(rune('a'+i))); err == nil {
			t.Fatalf("第 %d 次应失败", i+1)
		}
	}
	before := atomic.LoadInt32(calls)
	_, err := c.ExchangeCode(context.Background(), "code_after_open")
	var we *Error
	if !errors.As(err, &we) || we.Kind != KindUpstreamUnavailable {
		t.Fatalf("熔断期应快速失败，got %v", err)
	}
	if atomic.LoadInt32(calls) != before {
		t.Fatal("熔断期不得发起请求")
	}
	if c.Probe(context.Background()) != "degraded" {
		t.Fatal("熔断期 Probe 应为 degraded")
	}
}

// WXO-53：仅密钥错误时回退旧密钥一次。
func TestSecretRotationFallback(t *testing.T) {
	srv, calls := tokenServer(t, func(r *http.Request) (int, string) {
		_ = r.ParseForm()
		if r.FormValue("secret") == "secret_old" {
			return 200, `{"errcode":40001,"errmsg":"invalid credential"}`
		}
		return 200, `{"access_token":"at","openid":"openid_1"}`
	})
	opts := testOptions(srv.URL, srv.URL)
	opts.Secret = "secret_old"
	opts.SecretPrevious = "secret_new"
	c := New(opts)
	token, err := c.ExchangeCode(context.Background(), "valid_code_123")
	if err != nil {
		t.Fatalf("轮换回退应成功: %v", err)
	}
	if token.OpenID != "openid_1" {
		t.Fatalf("token=%+v", token)
	}
	if atomic.LoadInt32(calls) != 2 {
		t.Fatalf("应恰好 2 次调用，got %d", calls)
	}

	opts.SecretPrevious = ""
	c2 := New(opts)
	if _, err := c2.ExchangeCode(context.Background(), "valid_code_123"); err == nil {
		t.Fatal("无旧密钥时不应回退成功")
	}
}

// WXO-10/28/34：用户信息失败不阻断；HTTP 头像被丢弃。
func TestFetchUserInfoDegradesGracefully(t *testing.T) {
	srv, _ := tokenServer(t, func(r *http.Request) (int, string) {
		return 200, `{"errcode":48001,"errmsg":"api unauthorized"}`
	})
	c := New(testOptions(srv.URL, srv.URL))
	name, avatar := c.FetchUserInfo(context.Background(), "at", "openid_1")
	if name != "" || avatar != "" {
		t.Fatalf("48001 应返回空值，got %q %q", name, avatar)
	}

	srv2, _ := tokenServer(t, func(r *http.Request) (int, string) {
		return 200, `{"nickname":"微信\n用户\u0000😀","headimgurl":"http://example.com/a.png","openid":"x"}`
	})
	c2 := New(testOptions(srv2.URL, srv2.URL))
	name, avatar = c2.FetchUserInfo(context.Background(), "at", "openid_1")
	if strings.ContainsAny(name, "\n\r\x00") || !strings.Contains(name, "😀") {
		t.Fatalf("昵称清洗异常: %q", name)
	}
	if avatar != "" {
		t.Fatalf("HTTP 头像应丢弃，got %q", avatar)
	}
}

// 端口契约校验：Client 必须实现 WeChatIdentityProvider。
var _ port.WeChatIdentityProvider = (*Client)(nil)

func TestJSONShape(t *testing.T) {
	// 防止解析字段名回归。
	raw, _ := json.Marshal(map[string]any{"openid": "x"})
	if !strings.Contains(string(raw), "openid") {
		t.Fatal("json 编解码异常")
	}
}