package domain

import (
	"strings"
	"testing"
	"time"
)

// WXO-31：wechat 可解析，web 仍不可解析。
func TestParsePlatformWechat(t *testing.T) {
	if p, ok := ParsePlatform("wechat"); !ok || p != PlatformWechat {
		t.Fatalf("ParsePlatform(wechat) = %q,%v", p, ok)
	}
	if _, ok := ParsePlatform("web"); ok {
		t.Fatal("web 不应可解析")
	}
	if _, ok := ParsePlatform("WeChat"); ok {
		t.Fatal("平台解析应大小写敏感")
	}
}

// WXO-30：微信 openid 必须有独立命名空间。
func TestNamespacedOpenID(t *testing.T) {
	got, ok := NamespacedOpenID("abc123")
	if !ok || got != "wechat:abc123" {
		t.Fatalf("NamespacedOpenID = %q,%v", got, ok)
	}
	if _, ok := NamespacedOpenID(""); ok {
		t.Fatal("空 openid 应失败")
	}
	if _, ok := NamespacedOpenID(strings.Repeat("a", 129)); ok {
		t.Fatal("超长 openid 应失败")
	}
	if _, ok := NamespacedOpenID("bad openid!"); ok {
		t.Fatal("非法字符应失败")
	}
	if _, ok := NamespacedOpenID("a:b"); ok {
		t.Fatal("openid 本身不得含冒号，避免前缀穿透")
	}
}

// WXO-29/11：身份校验只关心 openid 与 issuer，空昵称/头像不失败。
func TestValidateWeChatIdentity(t *testing.T) {
	base := WeChatIdentity{OpenID: "abc123", IssuerAppID: "wx_app"}
	if err := ValidateWeChatIdentity(base, "wx_app"); err != nil {
		t.Fatalf("合法身份不应失败: %v", err)
	}
	if err := ValidateWeChatIdentity(WeChatIdentity{IssuerAppID: "wx_app"}, "wx_app"); err == nil {
		t.Fatal("缺 openid 应失败")
	}
	if err := ValidateWeChatIdentity(WeChatIdentity{OpenID: "bad openid", IssuerAppID: "wx_app"}, "wx_app"); err == nil {
		t.Fatal("非法 openid 应失败")
	}
	if err := ValidateWeChatIdentity(base, "wx_other"); err == nil {
		t.Fatal("issuer 不一致应失败")
	}

	err := ValidateWeChatIdentity(WeChatIdentity{OpenID: "secret_openid_value", IssuerAppID: ""}, "wx_app")
	if err == nil {
		t.Fatal("缺 issuer 应失败")
	}
	if strings.Contains(err.Error(), "secret_openid_value") {
		t.Fatal("错误文本不得包含 openid")
	}
}

// WXO-34/28：复用既有清洗规则，仅昵称与头像两项。
func TestSanitizeWeChatProfile(t *testing.T) {
	name, avatar := NormalizeWeChatProfile(WeChatIdentity{
		DisplayName: " 微信\n用户😀\r\x00 ",
		AvatarURL:   "http://example.com/a.png",
	})
	if strings.ContainsAny(name, "\n\r\x00") {
		t.Fatalf("控制字符未清除: %q", name)
	}
	if !strings.Contains(name, "😀") {
		t.Fatalf("emoji 应保留: %q", name)
	}
	if avatar != "" {
		t.Fatalf("http 头像应丢弃，got %q", avatar)
	}

	long := strings.Repeat("名", 80)
	name, _ = NormalizeWeChatProfile(WeChatIdentity{DisplayName: long})
	if len([]rune(name)) != 64 {
		t.Fatalf("昵称应截断到 64 字符，got %d", len([]rune(name)))
	}

	_, avatar = NormalizeWeChatProfile(WeChatIdentity{AvatarURL: "https://example.com/a.png"})
	if avatar == "" {
		t.Fatal("https 头像应保留")
	}
	_, avatar = NormalizeWeChatProfile(WeChatIdentity{AvatarURL: "https://example.com/" + strings.Repeat("x", 600)})
	if avatar != "" {
		t.Fatal("超长头像应丢弃")
	}
}

// WXO-18：code 去重键只存摘要。
func TestWeChatCodeDigest(t *testing.T) {
	d1 := WeChatCodeDigest("code_a")
	d2 := WeChatCodeDigest("code_b")
	if !strings.HasPrefix(d1, "wechat:code:") {
		t.Fatalf("摘要前缀错误: %s", d1)
	}
	if d1 == d2 {
		t.Fatal("不同 code 摘要不应相同")
	}
	if len(d1) != len("wechat:code:")+64 {
		t.Fatalf("摘要长度异常: %d", len(d1))
	}
}

// WXO-11/14：会话平台值不改变 TTL 与续期语义。
func TestSessionPlatformWechatCompatibility(t *testing.T) {
	now := time.Date(2026, 11, 7, 8, 0, 0, 0, time.UTC)
	android, err := NewSession("hash_a", "u1", PlatformAndroid, now, 24*time.Hour)
	if err != nil {
		t.Fatalf("NewSession(android): %v", err)
	}
	wechat, err := NewSession("hash_w", "u1", PlatformWechat, now, 24*time.Hour)
	if err != nil {
		t.Fatalf("NewSession(wechat): %v", err)
	}
	if wechat.Platform != PlatformWechat {
		t.Fatal("微信会话平台值应落库为 wechat")
	}
	if wechat.ExpiresAt != android.ExpiresAt {
		t.Fatal("微信会话有效期不应与华为不同")
	}
	later := now.Add(23 * time.Hour)
	if wechat.ShouldRenew(later, 24*time.Hour, 0.3) != android.ShouldRenew(later, 24*time.Hour, 0.3) {
		t.Fatal("微信与华为的续期判定必须一致")
	}
	if !wechat.Usable(now.Add(time.Hour)) {
		t.Fatal("有效期内微信会话应可用")
	}
	wechat.Revoke(now)
	if wechat.Usable(now.Add(time.Minute)) {
		t.Fatal("吊销后微信会话不可用")
	}
}