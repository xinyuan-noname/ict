package filestore

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"ict/server/internal/domain"
)

// WXO-30：华为 openid 与微信 openid 同字面值时，必须落到两个独立账号。
func TestOpenIDNamespaceIsolation(t *testing.T) {
	path := filepath.Join(t.TempDir(), "auth.json")
	s, err := OpenWithOptions(path, Options{Namespace: "test", Mode: "mock"})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	now := time.Date(2026, 11, 7, 8, 0, 0, 0, time.UTC)
	ctx := context.Background()

	huawei, created, err := s.UpsertByOpenID(ctx, "abc123", "", now)
	if err != nil || !created {
		t.Fatalf("huawei upsert: %v created=%v", err, created)
	}
	wechatKey, ok := domain.NamespacedOpenID("abc123")
	if !ok {
		t.Fatal("命名空间化失败")
	}
	wechat, created, err := s.UpsertByOpenID(ctx, wechatKey, "", now)
	if err != nil || !created {
		t.Fatalf("wechat upsert: %v created=%v", err, created)
	}
	if huawei.UserID == wechat.UserID {
		t.Fatalf("同字面 openid 不应合并账号: %s", huawei.UserID)
	}

	byHuawei, ok, _ := s.FindByOpenID(ctx, "abc123")
	if !ok || byHuawei.UserID != huawei.UserID {
		t.Fatal("华为 openid 查询失败")
	}
	byWechat, ok, _ := s.FindByOpenID(ctx, wechatKey)
	if !ok || byWechat.UserID != wechat.UserID {
		t.Fatal("微信 openid 查询失败")
	}
	if byHuawei.UserID == byWechat.UserID {
		t.Fatal("渠道查询必须互不可见")
	}
}