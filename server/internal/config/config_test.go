package config

import (
	"strings"
	"testing"
	"time"
)

func setBase(t *testing.T) {
	t.Helper()
	t.Setenv("ENV", "development")
	t.Setenv("HUAWEI_CLIENT_ID", "client-id")
	t.Setenv("HUAWEI_CLIENT_SECRET", "0123456789abcdef")
	t.Setenv("SESSION_PEPPER", "pepper-0123456789abcdef")
	t.Setenv("SESSION_TTL", "24h")
	t.Setenv("SESSION_MAX_ABSOLUTE_TTL", "168h")
}

func TestLoadRequiresSecret(t *testing.T) {
	setBase(t)
	t.Setenv("HUAWEI_CLIENT_SECRET", "")
	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "credentials") {
		t.Fatalf("expected missing credentials error, got %v", err)
	}
	if err != nil && strings.Contains(err.Error(), "0123456789") {
		t.Fatal("error message must not contain secret values")
	}
}

func TestLoadRejectsOutOfRangeTTL(t *testing.T) {
	for _, ttl := range []string{"0h", "169h"} {
		setBase(t)
		t.Setenv("SESSION_TTL", ttl)
		if _, err := Load(); err == nil {
			t.Fatalf("ttl %s should be rejected", ttl)
		}
	}
}

func TestLoadRejectsUnknownPlatform(t *testing.T) {
	setBase(t)
	t.Setenv("ALLOWED_PLATFORMS", "android,linux")
	if _, err := Load(); err == nil {
		t.Fatal("unknown platform must be rejected")
	}
}

func TestLoadRejectsTooLongTimeout(t *testing.T) {
	setBase(t)
	t.Setenv("HUAWEI_TIMEOUT", "5s")
	if _, err := Load(); err == nil {
		t.Fatal("timeout outside 500ms..3s must be rejected")
	}
}

func TestProductionRequiresOfficialDomain(t *testing.T) {
	setBase(t)
	t.Setenv("ENV", "production")
	t.Setenv("HUAWEI_OAUTH_BASE_URL", "http://evil.example.com")
	if _, err := Load(); err == nil {
		t.Fatal("production must reject non-official domain")
	}
	setBase(t)
	t.Setenv("ENV", "production")
	t.Setenv("HUAWEI_OAUTH_BASE_URL", "https://oauth-login.cloud.huawei.com")
	t.Setenv("AUDIT_SINK", "discard")
	if _, err := Load(); err == nil {
		t.Fatal("production must reject discard audit sink")
	}
}

func TestMaskSecret(t *testing.T) {
	if MaskSecret("0123456789abcdef") != "***cdef" {
		t.Fatalf("unexpected mask: %s", MaskSecret("0123456789abcdef"))
	}
	if MaskSecret("") != "" {
		t.Fatal("empty secret must mask to empty")
	}
	if MaskSecret("abc") != "***" {
		t.Fatal("short secret must fully mask")
	}
}

func TestRedirectWhitelistIsExact(t *testing.T) {
	c := &Config{WindowsRedirectURIs: []string{"http://127.0.0.1:17890/callback"}}
	if !c.IsWindowsRedirectAllowed("http://127.0.0.1:17890/callback") {
		t.Fatal("exact match should be allowed")
	}
	if c.IsWindowsRedirectAllowed("http://127.0.0.1:17890/callback/") {
		t.Fatal("trailing slash must be rejected")
	}
	if c.IsWindowsRedirectAllowed("https://evil.example.com/callback") {
		t.Fatal("public domain must be rejected")
	}
}

func TestLoadDefaults(t *testing.T) {
	setBase(t)
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.SessionTTL != 24*time.Hour {
		t.Fatalf("unexpected default ttl: %s", c.SessionTTL)
	}
	if c.HuaweiTimeout != 3*time.Second {
		t.Fatalf("unexpected default timeout: %s", c.HuaweiTimeout)
	}
	if c.Redacted() == "" {
		t.Fatal("redacted config must not be empty")
	}
}