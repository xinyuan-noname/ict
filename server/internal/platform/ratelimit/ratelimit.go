package ratelimit

import (
	"sync"
	"time"
)

// Limiter 是滑动窗口失败计数限流器（任务 19.1/19.2）。
type Limiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	buckets map[string][]time.Time
}

func New(limit int, window time.Duration) *Limiter {
	return &Limiter{limit: limit, window: window, buckets: map[string][]time.Time{}}
}

func (l *Limiter) prune(key string, now time.Time) []time.Time {
	cut := now.Add(-l.window)
	ts := l.buckets[key]
	i := 0
	for i < len(ts) && !ts[i].After(cut) {
		i++
	}
	ts = ts[i:]
	if len(ts) == 0 {
		delete(l.buckets, key)
	} else {
		l.buckets[key] = ts
	}
	return ts
}

// Allow 返回是否放行；不放行时给出窗口剩余整数秒。
func (l *Limiter) Allow(key string) (bool, int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	ts := l.prune(key, now)
	if len(ts) < l.limit {
		return true, 0
	}
	retry := int(ts[0].Add(l.window).Sub(now).Seconds()) + 1
	if retry < 1 {
		retry = 1
	}
	if retry > int(l.window.Seconds()) {
		retry = int(l.window.Seconds())
	}
	return false, retry
}

// Fail 记录一次失败；成功路径应调用 Reset。
func (l *Limiter) Fail(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	ts := l.prune(key, now)
	l.buckets[key] = append(ts, now)
}

func (l *Limiter) Reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.buckets, key)
}

// Count 返回当前窗口内失败次数（测试用）。
func (l *Limiter) Count(key string) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.prune(key, time.Now()))
}