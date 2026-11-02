package port

import (
	"context"

	"ict/server/internal/domain"
)

// RewardTx 是单用户奖励域事务视图；回调返回错误时存储层回滚。
type RewardTx struct {
	Account  domain.PointsAccount
	CheckIns map[string]domain.CheckInRecord
	Entries  []domain.PointsEntry
	Owned    map[string]domain.OwnedFrame
	Orders   map[string]domain.RedeemOrder
	Equipped string
	// HighWater 记录已处理的最大签到日，用于检测时钟回拨（未来日期）。
	HighWater string
}

// RewardStore 是奖励域持久化端口；未来替换 SQLite 时只需换实现。
type RewardStore interface {
	Do(ctx context.Context, userID string, fn func(*RewardTx) error) error
	View(ctx context.Context, userID string, fn func(*RewardTx) error) error
}