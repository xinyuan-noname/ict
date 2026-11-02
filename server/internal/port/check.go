package port

import (
	"context"

	"ict/server/internal/domain"
)

// CheckTx 是单用户清单事务视图；回调报错时存储层回滚。
type CheckTx struct {
	Profile *domain.HealthProfile
	Goals   map[string]int // day -> target ml
	Records []domain.WaterRecord
	Idem    map[string]string // idempotency key -> recordId
}

type CheckStore interface {
	Do(ctx context.Context, userID string, fn func(*CheckTx) error) error
	View(ctx context.Context, userID string, fn func(*CheckTx) error) error
}