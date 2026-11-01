package apperr

import (
	"net/http"
	"testing"
)

func TestDictionaryHas14Codes(t *testing.T) {
	if len(All()) != 14 {
		t.Fatalf("expected 14 codes, got %d", len(All()))
	}
	for _, code := range All() {
		if Message(code) == "" {
			t.Fatalf("code %s has empty message", code)
		}
	}
}

func TestHTTPStatusMapping(t *testing.T) {
	cases := map[Code]int{
		Auth001: 400, Auth003: 503, Auth004: 401, Auth005: 401, Auth006: 400,
		Auth007: 429, Auth008: 503, Auth009: 400, Auth010: 403, Auth011: 502,
		Auth012: 500, Auth013: 401, Auth014: 500,
	}
	for code, want := range cases {
		if got := HTTPStatus(code); got != want {
			t.Errorf("%s: want %d, got %d", code, want, got)
		}
	}
}

func TestLocalCodeHasNoHTTPStatus(t *testing.T) {
	if HTTPStatus(Auth002) == http.StatusOK {
		t.Fatal("AUTH_002 must not map to a success status")
	}
	if Normalize(New(Auth002, nil)) != Auth014 {
		t.Fatal("AUTH_002 must never be emitted by the server")
	}
}

func TestNormalizeUnknownCodeFoldsTo014(t *testing.T) {
	if Normalize(New(Code("AUTH_099"), nil)) != Auth014 {
		t.Fatal("unknown code must fold to AUTH_014")
	}
	if Normalize(nil) != Auth014 {
		t.Fatal("nil error must fold to AUTH_014")
	}
}

func TestMessagesMatchContract(t *testing.T) {
	if Message(Auth010) != "账号不可用，请联系管理员" {
		t.Fatalf("AUTH_010 message mismatch: %s", Message(Auth010))
	}
	if Message(Auth007) != "操作过于频繁，请稍后再试" {
		t.Fatalf("AUTH_007 message mismatch: %s", Message(Auth007))
	}
}