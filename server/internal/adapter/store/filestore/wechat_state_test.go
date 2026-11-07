package filestore

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"ict/server/internal/port"
)

func newStateStore(t *testing.T) *WeChatStateStore {
	t.Helper()
	path := filepath.Join(t.TempDir(), "auth.json.wechat.json")
	s, err := OpenWeChatState(path, Options{Namespace: "test", Mode: "mock"})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	return s
}

func ticket(digest, origin string, now time.Time, ttl time.Duration) port.OAuthState {
	return port.OAuthState{
		StateDigest: digest, BindHandle: "bind_handle", Origin: origin,
		IssuedAt: now, ExpiresAt: now.Add(ttl),
	}
}

// WXO-08/17/26：一次性消费且不可回退。
func TestWeChatStateConsumeOnce(t *testing.T) {
	s := newStateStore(t)
	ctx := context.Background()
	now := time.Now().UTC()
	if _, err := s.Issue(ctx, ticket("digest_1", "1.1.1.1", now, 10*time.Minute), 3); err != nil {
		t.Fatalf("issue: %v", err)
	}

	first, ok, err := s.Consume(ctx, "digest_1", "bind_handle", now.Add(time.Minute))
	if err != nil || !ok {
		t.Fatalf("首次消费应成功: %v %v", ok, err)
	}
	if first.ConsumedAt == nil {
		t.Fatal("消费后应记录 consumedAt")
	}
	if _, ok, _ := s.Consume(ctx, "digest_1", "bind_handle", now.Add(2*time.Minute)); ok {
		t.Fatal("同一 state 不可二次消费")
	}
	if _, ok, _ := s.Consume(ctx, "digest_1", "other_handle", now.Add(3*time.Minute)); ok {
		t.Fatal("终态后不同 handle 也不可消费")
	}
}

// bindHandle 不匹配不消费。
func TestWeChatStateBindHandleMismatch(t *testing.T) {
	s := newStateStore(t)
	ctx := context.Background()
	now := time.Now().UTC()
	_, _ = s.Issue(ctx, ticket("digest_2", "1.1.1.1", now, 10*time.Minute), 3)

	if _, ok, _ := s.Consume(ctx, "digest_2", "wrong", now.Add(time.Minute)); ok {
		t.Fatal("handle 不匹配应失败")
	}
	if _, ok, _ := s.Consume(ctx, "digest_2", "bind_handle", now.Add(2*time.Minute)); !ok {
		t.Fatal("错误 handle 不应消耗票据")
	}
}

// 过期票据不可用。
func TestWeChatStateExpires(t *testing.T) {
	s := newStateStore(t)
	ctx := context.Background()
	now := time.Now().UTC()
	_, _ = s.Issue(ctx, ticket("digest_3", "1.1.1.1", now, time.Minute), 3)

	if _, ok, _ := s.Consume(ctx, "digest_3", "bind_handle", now.Add(2*time.Minute)); ok {
		t.Fatal("过期票据不应可消费")
	}
}

// 并发 2 次消费只有 1 次成功。
func TestWeChatStateConcurrentConsume(t *testing.T) {
	s := newStateStore(t)
	ctx := context.Background()
	now := time.Now().UTC()
	_, _ = s.Issue(ctx, ticket("digest_4", "1.1.1.1", now, 10*time.Minute), 3)

	results := make(chan bool, 2)
	for i := 0; i < 2; i++ {
		go func() {
			_, ok, _ := s.Consume(ctx, "digest_4", "bind_handle", now.Add(time.Minute))
			results <- ok
		}()
	}
	okCount := 0
	for i := 0; i < 2; i++ {
		if <-results {
			okCount++
		}
	}
	if okCount != 1 {
		t.Fatalf("并发消费成功次数=%d，期望 1", okCount)
	}
}

// WXO-26：单 IP 未消费上限 3，超限作废最早。
func TestWeChatPendingLimit(t *testing.T) {
	s := newStateStore(t)
	ctx := context.Background()
	now := time.Now().UTC()
	for i := 0; i < 5; i++ {
		ts := now.Add(time.Duration(i) * time.Second)
		_, err := s.Issue(ctx, ticket("digest_"+string(rune('a'+i)), "9.9.9.9", ts, 10*time.Minute), 3)
		if err != nil {
			t.Fatalf("issue %d: %v", i, err)
		}
	}
	// 最早的 a、b 应被作废，c、d、e 可用。
	for _, d := range []string{"digest_a", "digest_b"} {
		if _, ok, _ := s.Consume(ctx, d, "bind_handle", now.Add(time.Minute)); ok {
			t.Fatalf("%s 应已作废", d)
		}
	}
	for _, d := range []string{"digest_c", "digest_d", "digest_e"} {
		if _, ok, _ := s.Consume(ctx, d, "bind_handle", now.Add(time.Minute)); !ok {
			t.Fatalf("%s 应仍可用", d)
		}
	}
}

// 不同 IP 互不影响。
func TestWeChatPendingLimitPerOrigin(t *testing.T) {
	s := newStateStore(t)
	ctx := context.Background()
	now := time.Now().UTC()
	_, _ = s.Issue(ctx, ticket("digest_x", "1.1.1.1", now, 10*time.Minute), 1)
	_, _ = s.Issue(ctx, ticket("digest_y", "2.2.2.2", now, 10*time.Minute), 1)

	if _, ok, _ := s.Consume(ctx, "digest_x", "bind_handle", now.Add(time.Minute)); !ok {
		t.Fatal("不同 IP 的票据不应被互相作废")
	}
	if _, ok, _ := s.Consume(ctx, "digest_y", "bind_handle", now.Add(time.Minute)); !ok {
		t.Fatal("第二个 IP 的票据应可用")
	}
}