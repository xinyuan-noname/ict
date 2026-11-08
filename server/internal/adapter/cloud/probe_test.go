package cloud

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestTCPProbeNotConfigured(t *testing.T) {
	if got := (TCPProbe{}).Probe(context.Background()); got != "not_configured" {
		t.Fatalf("want not_configured, got %q", got)
	}
}

func TestTCPProbeOK(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = listener.Close() }()
	if got := (TCPProbe{Addr: listener.Addr().String(), Timeout: time.Second}).Probe(context.Background()); got != "ok" {
		t.Fatalf("want ok, got %q", got)
	}
}

func TestTCPProbeFail(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := listener.Addr().String()
	_ = listener.Close()
	if got := (TCPProbe{Addr: addr, Timeout: 100 * time.Millisecond}).Probe(context.Background()); got != "fail" {
		t.Fatalf("want fail, got %q", got)
	}
}

func TestHTTPProbe(t *testing.T) {
	if got := (HTTPProbe{}).Probe(context.Background()); got != "not_configured" {
		t.Fatalf("want not_configured, got %q", got)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer demo" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	if got := (HTTPProbe{URL: server.URL, Token: "demo", Timeout: time.Second}).Probe(context.Background()); got != "ok" {
		t.Fatalf("want ok, got %q", got)
	}
	if got := (HTTPProbe{URL: server.URL, Token: "bad", Timeout: time.Second}).Probe(context.Background()); got != "degraded" {
		t.Fatalf("want degraded, got %q", got)
	}
}
