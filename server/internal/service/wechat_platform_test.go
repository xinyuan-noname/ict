package service

import (
	"context"
	"testing"

	"ict/server/internal/domain"
	"ict/server/internal/platform/apperr"
)

// WXO-31：华为通道显式拒绝 wechat，即使误配白名单。
func TestLoginRejectsWechatOnHuaweiChannel(t *testing.T) {
	svc, _, _, provider, audit := newTestAuth(t)
	in := baseInput()
	in.Platform = "wechat"

	_, err := svc.Login(context.Background(), in)
	if apperr.Normalize(err) != apperr.Auth009 {
		t.Fatalf("want AUTH_009, got %v", err)
	}
	if provider.Calls() != 0 {
		t.Fatal("华为通道不得调用上游")
	}
	if audit.Count() == 0 {
		t.Fatal("应记录登录失败审计事件")
	}

	svc.opts.AllowedPlatforms[domain.PlatformWechat] = true
	_, err = svc.Login(context.Background(), in)
	if apperr.Normalize(err) != apperr.Auth009 {
		t.Fatalf("白名单放开后仍应拒绝，got %v", err)
	}
	if provider.Calls() != 0 {
		t.Fatal("白名单放开后仍不得调用上游")
	}
}