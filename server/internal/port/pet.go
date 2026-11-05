package port

import (
	"context"

	"ict/server/internal/domain"
)

// PetTx 是单用户宠物域事务视图（好友关系按双方各存一条边）。
type PetTx struct {
	Pet        *domain.Pet
	Inventory  map[string]int
	Friends    []domain.FriendEdge
	Invites    map[string]domain.InviteCode
	PkMatches  []domain.PkMatch
	ItemIdem   map[string]string // idemKey -> itemId
	PkDaily    map[string]int    // day -> 发起次数
	PkPairDay  map[string]bool   // "day|friendId"
}

type PetStore interface {
	Do(ctx context.Context, userID string, fn func(*PetTx) error) error
	View(ctx context.Context, userID string, fn func(*PetTx) error) error
}

// PointsPort 复用既有积分账户（奖励域），余额不足映射 POINT_002。
type PointsPort interface {
	Spend(ctx context.Context, userID string, amount int, ref string) error
	Grant(ctx context.Context, userID string, amount int, ref string) error
}

// WaterRatePort 提供本周喝水达成率（用于 PK 计分）。
type WaterRatePort interface {
	WeekRate(ctx context.Context, userID string) (float64, error)
}