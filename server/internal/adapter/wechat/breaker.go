package wechat

import (
	"sync"
	"time"
)

// breaker 是独立熔断器：连续 threshold 次失败后打开 openFor，
// 打开期快速失败；半开只放行一个探测请求。
type breaker struct {
	mu        sync.Mutex
	threshold int
	openFor   time.Duration
	failures  int
	openedAt  time.Time
	probing   bool
}

func newBreaker(threshold int, openFor time.Duration) *breaker {
	if threshold <= 0 {
		threshold = 5
	}
	if openFor <= 0 {
		openFor = 15 * time.Second
	}
	return &breaker{threshold: threshold, openFor: openFor}
}

func (b *breaker) allow(now time.Time) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.openedAt.IsZero() {
		return true
	}
	if now.Sub(b.openedAt) < b.openFor {
		return false
	}
	if b.probing {
		return false
	}
	b.probing = true
	return true
}

func (b *breaker) success() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.failures = 0
	b.openedAt = time.Time{}
	b.probing = false
}

func (b *breaker) failure(now time.Time) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.failures++
	b.probing = false
	if b.failures >= b.threshold {
		b.openedAt = now
		b.failures = 0
	}
}

func (b *breaker) isOpen(now time.Time) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return !b.openedAt.IsZero() && now.Sub(b.openedAt) < b.openFor
}