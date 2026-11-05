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
	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
	"ict/server/internal/platform/ratelimit"
	"ict/server/internal/port"
	"ict/server/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	// --selfcheck 只输出模式与环境，不输出任何凭据（design 2.5.1）。
	if len(os.Args) > 1 && os.Args[1] == "--selfcheck" {
		fmt.Printf("selfcheck ok mode=%s env=%s\n", cfg.AuthMode, cfg.Env)
		return
	}

	if cfg.IsMock() {
		// mock 模式仅指向本地 hwsim；真实模式禁用该分支（自检已拦截）。
		base := cfg.HwsimBase
		cfg.HuaweiTokenURL = base + "/oauth2/v3/token"
		cfg.HuaweiJWKSURL = base + "/oauth2/v3/certs"
		cfg.HuaweiTokeninfoURL = base + "/oauth2/v3/tokeninfo"
	}

	logger := logx.New(os.Stdout, cfg.LogLevel)
	logger.Info(context.Background(), "starting authd", "event", "boot", "config", cfg.Redacted())

	store, err := filestore.OpenWithOptions(cfg.DatabaseDSN, filestore.Options{
		Namespace: cfg.StorageNamespace,
		Mode:      cfg.AuthMode,
	})
	if err != nil {
		logger.Error(context.Background(), "storage open failed", "event", "boot_failure", "reason", err.Error())
		os.Exit(1)
	}

	provider := huawei.NewWithOptions(huawei.Options{
		TokenURL:     cfg.HuaweiTokenURL,
		JWKSURL:      cfg.HuaweiJWKSURL,
		TokeninfoURL: cfg.HuaweiTokeninfoURL,
		Credentials: func(platform domain.Platform) (huawei.Credentials, bool) {
			if cfg.IsMock() {
				// mock 仅使用形态明显不同的占位凭据（闸 1）。
				return huawei.Credentials{ClientID: "hwsim-client", Secret: "hwsim-placeholder-secret"}, true
			}
			cred, ok := cfg.CredentialFor(string(platform))
			return huawei.Credentials{
				ClientID:       cred.ClientID,
				Secret:         cred.Secret,
				SecretPrevious: cred.SecretPrevious,
			}, ok
		},
		IssuerAllowlist: cfg.IssuerAllowlist,
		ClockSkew:       cfg.ClockSkew,
		JWKSMaxTTL:      cfg.JWKSMaxTTL,
		Timeout:         cfg.HuaweiTimeout,
		Logger:          logger,
		HTTP:            config.NewOutboundClient(cfg.HuaweiTimeout),
	})

	rewardStore, rerr := filestore.OpenRewards(cfg.DatabaseDSN+".rewards.json", filestore.Options{
		Namespace: cfg.StorageNamespace,
		Mode:      cfg.AuthMode,
	})
	if rerr != nil {
		logger.Error(context.Background(), "reward storage open failed", "event", "boot_failure", "reason", rerr.Error())
		os.Exit(1)
	}

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

	checkStore, cerr := filestore.OpenCheck(cfg.DatabaseDSN+".check.json", filestore.Options{
		Namespace: cfg.StorageNamespace,
		Mode:      cfg.AuthMode,
	})
	if cerr != nil {
		logger.Error(context.Background(), "check storage open failed", "event", "boot_failure", "reason", cerr.Error())
		os.Exit(1)
	}

	rewardService := &service.RewardService{
		Store: rewardStore, Clock: portClock{}, Logger: logger,
		CheckInLimiter: ratelimit.New(10, time.Minute),
		RedeemLimiter:  ratelimit.New(20, time.Minute),
	}

	checkService := &service.CheckService{
		Store: checkStore, Clock: portClock{}, Logger: logger,
		Limiter: ratelimit.New(60, time.Minute),
	}

	petStore, perr := filestore.OpenPet(cfg.DatabaseDSN+".pet.json", filestore.Options{
		Namespace: cfg.StorageNamespace,
		Mode:      cfg.AuthMode,
	})
	if perr != nil {
		logger.Error(context.Background(), "pet storage open failed", "event", "boot_failure", "reason", perr.Error())
		os.Exit(1)
	}
	petService := &service.PetService{
		Store: petStore, Points: pointsAdapter{store: rewardStore},
		WaterRate: waterRateAdapter{svc: checkService}, Clock: portClock{},
		Logger: logger, Invites: petStore,
	}

	srv := &handler.Server{Deps: handler.Deps{
		Cfg: cfg, Auth: authService, Reward: rewardService, Check: checkService,
		Pet: petService, Sessions: sessions, Provider: provider,
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

// pointsAdapter 复用奖励域积分账户（不新建账户，不改码表语义）。
type pointsAdapter struct {
	store *filestore.RewardStore
}

func (a pointsAdapter) Spend(ctx context.Context, userID string, amount int, ref string) error {
	if amount <= 0 {
		return nil
	}
	err := a.store.Do(ctx, userID, func(tx *port.RewardTx) error {
		if tx.Account.Balance < amount {
			return apperr.NewReward(apperr.Point002, nil)
		}
		tx.Account.Balance -= amount
		tx.Entries = append(tx.Entries, domain.PointsEntry{
			EntryID: domain.NewEntryID(), UserID: userID, Type: domain.EntryRewardSpend,
			Amount: -amount, BalanceAfter: tx.Account.Balance, OccurredAt: time.Now().UTC(),
			RefID: ref, RuleVersion: domain.RuleVersion,
		})
		return nil
	})
	if err != nil {
		return apperr.NewReward(apperr.Point005, err)
	}
	return nil
}

func (a pointsAdapter) Grant(ctx context.Context, userID string, amount int, ref string) error {
	if amount <= 0 {
		return nil
	}
	err := a.store.Do(ctx, userID, func(tx *port.RewardTx) error {
		applied, _ := domain.ApplyCap(tx.Account.Balance, amount)
		tx.Account.Balance += applied
		if applied > 0 {
			tx.Entries = append(tx.Entries, domain.PointsEntry{
				EntryID: domain.NewEntryID(), UserID: userID, Type: domain.EntryCheckInEarn,
				Amount: applied, BalanceAfter: tx.Account.Balance, OccurredAt: time.Now().UTC(),
				RefID: ref, RuleVersion: domain.RuleVersion,
			})
		}
		return nil
	})
	if err != nil {
		return apperr.NewReward(apperr.Point005, err)
	}
	return nil
}

// waterRateAdapter 提供 PK 计分所需的本周喝水达成率。
type waterRateAdapter struct {
	svc *service.CheckService
}

func (a waterRateAdapter) WeekRate(ctx context.Context, userID string) (float64, error) {
	stats, err := a.svc.Week(ctx, userID, "")
	if err != nil {
		return 0, err
	}
	return stats.AchievementRate, nil
}