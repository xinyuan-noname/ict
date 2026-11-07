package filestore

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"sort"
	"sync"
	"time"

	"ict/server/internal/port"
)

// WeChatStateStore 是独立的 state 票据子空间文件：
// 只存摘要，不存 state 原文，不写入既有 auth.json。
type WeChatStateStore struct {
	mu   sync.Mutex
	path string
	data wechatStateData
}

type wechatStateData struct {
	Namespace string                      `json:"namespace"`
	Mode      string                      `json:"mode"`
	Subspace  string                      `json:"subspace"`
	Tickets   map[string]port.OAuthState  `json:"tickets"`
}

func newWeChatStateData() wechatStateData {
	return wechatStateData{Tickets: map[string]port.OAuthState{}}
}

// OpenWeChatState 打开子空间文件并校验 namespace/mode/subspace 文件头。
func OpenWeChatState(path string, opts Options) (*WeChatStateStore, error) {
	s := &WeChatStateStore{path: path, data: newWeChatStateData()}
	raw, err := os.ReadFile(path)
	if err == nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, &s.data); err != nil {
			return nil, err
		}
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if s.data.Tickets == nil {
		s.data = newWeChatStateData()
	}
	switch {
	case s.data.Namespace == "" && s.data.Mode == "":
		s.data.Namespace = opts.Namespace
		s.data.Mode = opts.Mode
		s.data.Subspace = "wechat_state"
		if err := s.flush(); err != nil {
			return nil, err
		}
	case s.data.Namespace != opts.Namespace || s.data.Mode != opts.Mode || s.data.Subspace != "wechat_state":
		return nil, ErrNamespaceMismatch
	}
	return s, nil
}

func (s *WeChatStateStore) flush() error {
	raw, err := json.MarshalIndent(&s.data, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// Issue 写入票据；同 origin 未消费数达到上限时作废最早一条。
func (s *WeChatStateStore) Issue(_ context.Context, state port.OAuthState, maxPending int) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	s.cleanupLocked(now)

	if maxPending <= 0 {
		maxPending = 3
	}
	pending := make([]port.OAuthState, 0)
	for _, ticket := range s.data.Tickets {
		if ticket.Origin != state.Origin || ticket.Terminal() || !now.Before(ticket.ExpiresAt) {
			continue
		}
		pending = append(pending, ticket)
	}
	sort.SliceStable(pending, func(i, j int) bool { return pending[i].IssuedAt.Before(pending[j].IssuedAt) })

	invalidated := make([]string, 0)
	for len(pending) >= maxPending {
		oldest := pending[0]
		pending = pending[1:]
		t := now
		oldest.InvalidatedAt = &t
		s.data.Tickets[oldest.StateDigest] = oldest
		invalidated = append(invalidated, oldest.StateDigest)
	}

	s.data.Tickets[state.StateDigest] = state
	if err := s.flush(); err != nil {
		return nil, err
	}
	return invalidated, nil
}

// Consume 以 CAS 语义原子消费；已消费/已作废/已过期均失败。
func (s *WeChatStateStore) Consume(_ context.Context, stateDigest, bindHandle string, now time.Time) (port.OAuthState, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ticket, ok := s.data.Tickets[stateDigest]
	if !ok {
		return port.OAuthState{}, false, nil
	}
	if ticket.Terminal() {
		return port.OAuthState{}, false, nil
	}
	if !now.Before(ticket.ExpiresAt) {
		t := now
		ticket.InvalidatedAt = &t
		s.data.Tickets[stateDigest] = ticket
		_ = s.flush()
		return port.OAuthState{}, false, nil
	}
	if ticket.BindHandle != bindHandle {
		return port.OAuthState{}, false, nil
	}
	t := now
	ticket.ConsumedAt = &t
	s.data.Tickets[stateDigest] = ticket
	if err := s.flush(); err != nil {
		return port.OAuthState{}, false, err
	}
	return ticket, true, nil
}

// Invalidate 将票据置为终态，供重放与作废使用。
func (s *WeChatStateStore) Invalidate(_ context.Context, stateDigest string, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	ticket, ok := s.data.Tickets[stateDigest]
	if !ok || ticket.Terminal() {
		return nil
	}
	t := now
	ticket.InvalidatedAt = &t
	s.data.Tickets[stateDigest] = ticket
	return s.flush()
}

// CleanupExpired 清理过期未消费票据。
func (s *WeChatStateStore) CleanupExpired(_ context.Context, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupLocked(now)
	return s.flush()
}

func (s *WeChatStateStore) cleanupLocked(now time.Time) {
	for digest, ticket := range s.data.Tickets {
		if ticket.Terminal() {
			continue
		}
		if !now.Before(ticket.ExpiresAt) {
			delete(s.data.Tickets, digest)
		}
	}
}

var _ port.OAuthStateRepository = (*WeChatStateStore)(nil)