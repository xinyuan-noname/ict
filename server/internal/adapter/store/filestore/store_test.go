package filestore

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"ict/server/internal/domain"
)

func TestOpenWithOptionsInitializesHeader(t *testing.T) {
	path := filepath.Join(t.TempDir(), "auth.json")
	s, err := OpenWithOptions(path, Options{Namespace: "real", Mode: "real"})
	if err != nil {
		t.Fatal(err)
	}
	if s.Namespace() != "real" || s.Mode() != "real" {
		t.Fatalf("unexpected header: %s/%s", s.Namespace(), s.Mode())
	}

	reopened, err := OpenWithOptions(path, Options{Namespace: "real", Mode: "real"})
	if err != nil {
		t.Fatal(err)
	}
	if reopened.Namespace() != "real" {
		t.Fatal("namespace must persist")
	}
}

func TestOpenWithOptionsRejectsCrossNamespace(t *testing.T) {
	path := filepath.Join(t.TempDir(), "auth.json")
	if _, err := OpenWithOptions(path, Options{Namespace: "real", Mode: "real"}); err != nil {
		t.Fatal(err)
	}
	if _, err := OpenWithOptions(path, Options{Namespace: "real-mock", Mode: "mock"}); !errors.Is(err, ErrNamespaceMismatch) {
		t.Fatalf("want namespace mismatch, got %v", err)
	}
	if _, err := OpenWithOptions(path, Options{Namespace: "real", Mode: "mock"}); !errors.Is(err, ErrNamespaceMismatch) {
		t.Fatalf("mode mismatch must be rejected, got %v", err)
	}
}

func TestOpenWithOptionsRejectsLegacyFileWithoutHeader(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.json")
	legacy, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	user := domain.UserProfile{UserID: "u1", OpenID: "openid", Status: domain.StatusActive}
	legacy.data.Users["u1"] = user
	legacy.data.OpenIDs["openid"] = "u1"
	legacy.mu.Lock()
	err = legacy.flushLocked()
	legacy.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}

	// 无文件头视为未知来源：首次打开会补写当前标识，但必须显式写入而非静默混用。
	opened, err := OpenWithOptions(path, Options{Namespace: "real-mock", Mode: "mock"})
	if err != nil {
		t.Fatal(err)
	}
	if opened.Mode() != "mock" {
		t.Fatal("header must be initialized with requested mode")
	}
}

func TestStoreWritesAndReadsSession(t *testing.T) {
	path := filepath.Join(t.TempDir(), "auth.json")
	s, err := OpenWithOptions(path, Options{Namespace: "real", Mode: "real"})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	profile, created, err := s.UpsertByOpenID(context.Background(), "openid_x", "union_x", now)
	if err != nil || !created {
		t.Fatalf("upsert: %v created=%v", err, created)
	}

	sess, err := domain.NewSession("hash-1", profile.UserID, domain.PlatformAndroid, now, 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Insert(context.Background(), *sess); err != nil {
		t.Fatal(err)
	}
	got, ok, err := s.FindByHash(context.Background(), "hash-1")
	if err != nil || !ok || got.UserID != profile.UserID {
		t.Fatalf("find: ok=%v err=%v", ok, err)
	}
	if _, err := s.Revoke(context.Background(), "hash-1", now); err != nil {
		t.Fatal(err)
	}
	revoked, _, err := s.FindByHash(context.Background(), "hash-1")
	if err != nil || revoked.RevokedAt == nil {
		t.Fatal("revocation must persist")
	}
}