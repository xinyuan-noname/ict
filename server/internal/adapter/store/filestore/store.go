// Package filestore 是零依赖持久化实现。
// 设计文档原定 SQLite（modernc.org/sqlite），但当前构建环境无法访问
// Go 模块代理，故以「原子写入的 JSON 文件 + 进程内互斥锁」实现同等仓储语义：
// open_id 唯一、会话按 token_hash 主键、授权码摘要一次性消费。
package filestore

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"ict/server/internal/domain"
)

type persisted struct {
	// 文件头：模式与命名空间，用于 real/mock 隔离校验。
	Namespace string                      `json:"namespace,omitempty"`
	Mode      string                      `json:"mode,omitempty"`
	Users     map[string]domain.UserProfile `json:"users"`   // key: userId
	OpenIDs   map[string]string             `json:"openIds"` // openId -> userId
	Sessions  map[string]domain.Session    `json:"sessions"`
	Codes     map[string]int64             `json:"codes"` // codeDigest -> expiresAt unix
	Events    []domain.AuthEvent           `json:"events"`
}

type Store struct {
	mu   sync.RWMutex
	path string
	data persisted
}

// Options 用于 real/mock 存储隔离（design 2.6.4 闸 3）。
type Options struct {
	Namespace string
	Mode      string
}

// ErrNamespaceMismatch 表示存储文件属于另一模式/命名空间。
var ErrNamespaceMismatch = errors.New("storage namespace mismatch")

// OpenWithOptions 打开存储并强制校验文件头；空文件写入当前标识。
func OpenWithOptions(path string, opts Options) (*Store, error) {
	s, err := Open(path)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	switch {
	case s.data.Namespace == "" && s.data.Mode == "":
		s.data.Namespace = opts.Namespace
		s.data.Mode = opts.Mode
		if err := s.flushLocked(); err != nil {
			return nil, err
		}
	case s.data.Namespace != opts.Namespace || s.data.Mode != opts.Mode:
		return nil, ErrNamespaceMismatch
	}
	return s, nil
}

// Namespace 返回当前存储命名空间。
func (s *Store) Namespace() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.data.Namespace
}

// Mode 返回存储所属模式。
func (s *Store) Mode() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.data.Mode
}

// Open 打开（或创建）存储文件，不做模式断言。
func Open(path string) (*Store, error) {
	if dir := filepath.Dir(path); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return nil, err
		}
	}
	s := &Store{path: path, data: persisted{
		Users:    map[string]domain.UserProfile{},
		OpenIDs:  map[string]string{},
		Sessions: map[string]domain.Session{},
		Codes:    map[string]int64{},
	}}
	raw, err := os.ReadFile(path)
	if err == nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, &s.data); err != nil {
			return nil, err
		}
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if s.data.Users == nil {
		s.data.Users = map[string]domain.UserProfile{}
	}
	if s.data.OpenIDs == nil {
		s.data.OpenIDs = map[string]string{}
	}
	if s.data.Sessions == nil {
		s.data.Sessions = map[string]domain.Session{}
	}
	if s.data.Codes == nil {
		s.data.Codes = map[string]int64{}
	}
	return s, nil
}

// flushLocked 原子写：临时文件 + rename，避免半写状态。
func (s *Store) flushLocked() error {
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

// Ping 供 readiness 检查使用。
func (s *Store) Ping(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, err := os.Stat(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (s *Store) FindByID(_ context.Context, userID string) (domain.UserProfile, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, ok := s.data.Users[userID]
	return p, ok, nil
}

func (s *Store) FindByOpenID(_ context.Context, openID string) (domain.UserProfile, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	id, ok := s.data.OpenIDs[openID]
	if !ok {
		return domain.UserProfile{}, false, nil
	}
	p, ok := s.data.Users[id]
	return p, ok, nil
}

func (s *Store) UpsertByOpenID(_ context.Context, openID, unionID string, now time.Time) (domain.UserProfile, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if id, ok := s.data.OpenIDs[openID]; ok {
		if p, ok := s.data.Users[id]; ok {
			if unionID != "" && p.UnionID == "" {
				p.UnionID = unionID
			}
			s.data.Users[id] = p
			return p, false, nil
		}
	}
	userID, err := newUserID()
	if err != nil {
		return domain.UserProfile{}, false, err
	}
	p := domain.UserProfile{
		UserID:      userID,
		OpenID:      openID,
		UnionID:     unionID,
		Status:      domain.StatusActive,
		CreatedAt:   now.UTC(),
		LastLoginAt: now.UTC(),
	}
	s.data.Users[userID] = p
	s.data.OpenIDs[openID] = userID
	if err := s.flushLocked(); err != nil {
		return domain.UserProfile{}, false, err
	}
	return p, true, nil
}

func (s *Store) UpdateProfile(_ context.Context, userID, displayName, avatarURL string, lastLogin time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.data.Users[userID]
	if !ok {
		return errors.New("profile not found")
	}
	p.DisplayName = displayName
	p.AvatarURL = avatarURL
	p.LastLoginAt = lastLogin.UTC()
	s.data.Users[userID] = p
	return s.flushLocked()
}

func (s *Store) SetStatus(_ context.Context, userID string, status domain.ProfileStatus) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.data.Users[userID]
	if !ok {
		return errors.New("profile not found")
	}
	p.Status = status
	s.data.Users[userID] = p
	return s.flushLocked()
}

func (s *Store) Insert(_ context.Context, sess domain.Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.data.Sessions[sess.TokenHash]; ok {
		return errors.New("session hash conflict")
	}
	s.data.Sessions[sess.TokenHash] = sess
	return s.flushLocked()
}

func (s *Store) FindByHash(_ context.Context, hash string) (domain.Session, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.data.Sessions[hash]
	return sess, ok, nil
}

func (s *Store) Revoke(_ context.Context, hash string, now time.Time) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.data.Sessions[hash]
	if !ok || sess.RevokedAt != nil {
		return false, nil
	}
	t := now.UTC()
	sess.RevokedAt = &t
	s.data.Sessions[hash] = sess
	return true, s.flushLocked()
}

func (s *Store) TouchLastActive(_ context.Context, hash string, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.data.Sessions[hash]
	if !ok {
		return nil
	}
	t := now.UTC()
	sess.LastActive = &t
	s.data.Sessions[hash] = sess
	return s.flushLocked()
}

func (s *Store) Consume(_ context.Context, codeDigest string, expiresAt time.Time) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.data.Codes[codeDigest]; ok {
		return false, nil
	}
	s.data.Codes[codeDigest] = expiresAt.UTC().Unix()
	return true, s.flushLocked()
}

func (s *Store) Exists(_ context.Context, codeDigest string) (bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.data.Codes[codeDigest]
	return ok, nil
}

// AppendEvent 供 file audit sink 复用同一原子写通道。
func (s *Store) AppendEvent(event domain.AuthEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Events = append(s.data.Events, event)
	if len(s.data.Events) > 10000 {
		s.data.Events = s.data.Events[len(s.data.Events)-10000:]
	}
	_ = s.flushLocked()
}

// Events 返回按时间升序的事件副本，供验收/测试断言。
func (s *Store) Events() []domain.AuthEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.AuthEvent, len(s.data.Events))
	copy(out, s.data.Events)
	sort.SliceStable(out, func(i, j int) bool { return out[i].OccurredAt < out[j].OccurredAt })
	return out
}

func newUserID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "u_" + hex.EncodeToString(b), nil
}