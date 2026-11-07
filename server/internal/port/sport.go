package port

import (
	"context"

	"ict/server/internal/domain"
)

// SportTx 是单用户运动域事务视图；回调返回错误时存储层回滚。
type SportTx struct {
	Records    map[string]domain.SportRecord
	Evidence   map[string]domain.AchievementEvidence
	Tombstones map[string]domain.SportTombstone
	// Seq 是该用户运动域的单调序号，用于同步增量游标。
	Seq int64
}

// SportStore 是运动域持久化端口；与奖励域分文件、各自持锁（不跨域事务）。
type SportStore interface {
	Do(ctx context.Context, userID string, fn func(*SportTx) error) error
	View(ctx context.Context, userID string, fn func(*SportTx) error) error
}