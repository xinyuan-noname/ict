package audit

import (
	"encoding/json"
	"io"
	"os"
	"sync"
	"sync/atomic"

	"ict/server/internal/domain"
)

// QueueSink 是非阻塞有界队列（任务 20.1）：满则丢弃并计数，绝不阻断登录。
type QueueSink struct {
	ch      chan domain.AuthEvent
	dropped atomic.Int64
	written atomic.Int64
	wg      sync.WaitGroup
	sink    func(domain.AuthEvent)
}

func NewQueueSink(size int, sink func(domain.AuthEvent)) *QueueSink {
	if size <= 0 {
		size = 4096
	}
	q := &QueueSink{ch: make(chan domain.AuthEvent, size), sink: sink}
	q.wg.Add(1)
	go q.worker()
	return q
}

func (q *QueueSink) Emit(event domain.AuthEvent) {
	select {
	case q.ch <- event:
	default:
		q.dropped.Add(1)
	}
}

func (q *QueueSink) worker() {
	defer q.wg.Done()
	for ev := range q.ch {
		if q.sink != nil {
			q.sink(ev)
		}
		q.written.Add(1)
	}
}

func (q *QueueSink) Close() {
	close(q.ch)
	q.wg.Wait()
}

func (q *QueueSink) Dropped() int64 { return q.dropped.Load() }
func (q *QueueSink) Written() int64 { return q.written.Load() }

// JSONL 写入文件；不含授权码、凭证、密钥、手机号原文。
func NewJSONLWriter(path string) (func(domain.AuthEvent), error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	var mu sync.Mutex
	return func(ev domain.AuthEvent) {
		mu.Lock()
		defer mu.Unlock()
		_ = json.NewEncoder(f).Encode(ev)
	}, nil
}

// DiscardSink 仅用于测试；production 由配置自检拒绝。
type DiscardSink struct {
	dropped atomic.Int64
}

func (d *DiscardSink) Emit(domain.AuthEvent) { d.dropped.Add(1) }

// DiscardWriter 满足 io.Writer 的占位实现。
type DiscardWriter struct{}

func (DiscardWriter) Write(p []byte) (int, error) { return io.Discard.Write(p) }