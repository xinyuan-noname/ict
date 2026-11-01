package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"ict/server/internal/adapter/audit"
	"ict/server/internal/adapter/huawei"
	"ict/server/internal/adapter/store/filestore"
	"ict/server/internal/config"
	"ict/server/internal/domain"
	"ict/server/internal/handler"
	"ict/server/internal/middleware"
	"ict/server/internal/platform/logx"
	"ict/server/internal/platform/ratelimit"
	"ict/server/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	logger := logx.New(os.Stdout, cfg.LogLevel)
	logger.Info(context.Background(), "starting authd", "event", "boot", "config", cfg.Redacted())

	store, err := filestore.Open(cfg.DatabaseDSN)
	if err != nil {
		logger.Error(context.Background(), "storage open failed", "event", "boot_failure")
		os.Exit(1)
	}

	provider := huawei.New(
		cfg.HuaweiOAuthBaseURL, cfg.HuaweiTokenPath, cfg.HuaweiTokeninfoPath, cfg.HuaweiJWKSPath,
		cfg.HuaweiClientID, cfg.HuaweiClientSecret, cfg.HuaweiClientSecretPr,
		cfg.HuaweiTimeout, logger,
	)

	sessions := &service.SessionService{
		Sessions: store, Users: store, Clock: portClock{},
		TTL: cfg.SessionTTL, MaxAbsolute: cfg.SessionMaxAbsolute,
		RenewRatio: cfg.SessionRenewRatio, Pepper: []byte(cfg.SessionPepper),
	}

	var sink port_AuditSink
	if cfg.AuditSink == "discard" && cfg.Env != "production" {
		sink = &audit.DiscardSink{}
	} else {
		path := filepath.Join(filepath.Dir(cfg.DatabaseDSN), "audit.jsonl")
		writer, werr := audit.NewJSONLWriter(path)
		if werr != nil {
			logger.Error(context.Background(), "audit writer open failed", "event", "boot_failure")
			os.Exit(1)
		}
		sink = audit.NewQueueSink(cfg.AuditQueueSize, writer)
	}

	allowed := map[domain.Platform]bool{}
	for _, p := range cfg.AllowedPlatforms {
		allowed[domain.Platform(p)] = true
	}

	authService := service.NewAuthService(service.Options{
		Provider: provider, Users: store, Codes: store, Sessions: sessions,
		Audit: sink, Clock: portClock{}, Logger: logger,
		AllowedPlatforms: allowed, MinVersions: cfg.ClientMinVersion, RedirectURIs: cfg.WindowsRedirectURIs,
		LoginLimiter:      ratelimit.New(cfg.RateLimitLoginFails, time.Minute),
		CredentialLimiter: ratelimit.New(cfg.RateLimitCredFails, time.Minute),
		GlobalLimiter:     ratelimit.New(300, time.Minute),
	})

	srv := &handler.Server{Deps: handler.Deps{
		Cfg: cfg, Auth: authService, Sessions: sessions, Provider: provider,
		Storage: store, Log: logger, StartedAt: time.Now(),
	}}

	chain := middleware.Recover(logger)(
		middleware.TraceID()(
			middleware.AccessLog(logger)(
				middleware.BodyLimit(8 * 1024)(srv.Routes()))))
	root := http.NewServeMux()
	root.Handle("/", chain)

	httpServer := &http.Server{
		Addr:              cfg.ServerAddr,
		Handler:           root,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	if cfg.MetricsAddr != "" {
		go func() {
			metricsMux := http.NewServeMux()
			metricsMux.HandleFunc("GET /metrics", srv.Metrics)
			logger.Info(context.Background(), "metrics listening", "event", "boot", "addr", cfg.MetricsAddr)
			_ = http.ListenAndServe(cfg.MetricsAddr, metricsMux)
		}()
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		logger.Info(context.Background(), "http listening", "event", "boot", "addr", cfg.ServerAddr)
		if cfg.TLSCertFile != "" && cfg.TLSKeyFile != "" {
			err = httpServer.ListenAndServeTLS(cfg.TLSCertFile, cfg.TLSKeyFile)
		} else {
			err = httpServer.ListenAndServe()
		}
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen failed: %v", err)
		}
	}()

	<-ctx.Done()
	logger.Info(context.Background(), "shutting down", "event", "shutdown")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdownCtx)
	if closer, ok := sink.(interface{ Close() }); ok {
		closer.Close()
	}
	logger.Info(context.Background(), "stopped", "event", "shutdown")
}

type portClock struct{}

func (portClock) Now() time.Time { return time.Now().UTC() }

type port_AuditSink interface {
	Emit(event domain.AuthEvent)
}