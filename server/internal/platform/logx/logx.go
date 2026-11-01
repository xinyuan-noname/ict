package logx

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Logger 输出结构化 JSON 日志，键名与值双重脱敏（任务 7.2/7.3）。
type Logger struct {
	mu    sync.Mutex
	out   io.Writer
	level string
}

var sensitiveKeys = map[string]bool{
	"auth_code": true, "code": true, "token": true, "session_token": true, "sessionToken": true,
	"client_secret": true, "password": true, "phone": true, "mobile": true, "id_card": true, "email": true,
}

var (
	reToken  = regexp.MustCompile(`s1_[A-Za-z0-9_-]{43}`)
	rePhone  = regexp.MustCompile(`\b1[3-9]\d{9}\b`)
	reBearer = regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9._-]+`)
)

func New(out io.Writer, level string) *Logger {
	if out == nil {
		out = os.Stdout
	}
	return &Logger{out: out, level: level}
}

// Digest 返回 sha256 前 8 位，用于日志关联而不泄漏原文。
func Digest(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])[:8]
}

func RedactValue(s string) string {
	s = reToken.ReplaceAllStringFunc(s, func(m string) string { return "sha256:" + Digest(m) })
	s = reBearer.ReplaceAllString(s, "Bearer ***")
	s = rePhone.ReplaceAllString(s, "***")
	return s
}

// Info 写一条 info 日志；kv 必须是标量，禁止传入请求对象。
func (l *Logger) Info(ctx context.Context, msg string, kv ...any) {
	l.write("info", ctx, msg, kv...)
}

func (l *Logger) Warn(ctx context.Context, msg string, kv ...any) {
	l.write("warn", ctx, msg, kv...)
}

func (l *Logger) Error(ctx context.Context, msg string, kv ...any) {
	l.write("error", ctx, msg, kv...)
}

func (l *Logger) write(level string, ctx context.Context, msg string, kv ...any) {
	if !l.enabled(level) {
		return
	}
	fields := map[string]any{
		"ts":     time.Now().UTC().Format(time.RFC3339Nano),
		"level":  level,
		"msg":    RedactValue(msg),
		"event":  "log",
	}
	if ctx != nil {
		if tid, ok := ctx.Value(TraceIDKey{}).(string); ok && tid != "" {
			fields["trace_id"] = tid
		}
	}
	for i := 0; i+1 < len(kv); i += 2 {
		key, _ := kv[i].(string)
		if key == "" {
			continue
		}
		if sensitiveKeys[key] {
			fields[key] = "***"
			continue
		}
		switch v := kv[i+1].(type) {
		case string:
			fields[key] = RedactValue(v)
		case error:
			fields[key] = RedactValue(v.Error())
		default:
			fields[key] = v
		}
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	_ = json.NewEncoder(l.out).Encode(fields)
}

func (l *Logger) enabled(level string) bool {
	order := map[string]int{"debug": 0, "info": 1, "warn": 2, "error": 3}
	return order[level] >= order[l.level]
}

// TraceIDKey 是 traceId 的 context 键。
type TraceIDKey struct{}

func WithTraceID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, TraceIDKey{}, id)
}

func TraceID(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if v, ok := ctx.Value(TraceIDKey{}).(string); ok {
		return v
	}
	return ""
}

// ClaimType 拆分 Bearer 头，避免调用方手写解析。
func ClaimType(header string) (string, bool) {
	if !strings.HasPrefix(strings.ToLower(header), "bearer ") {
		return "", false
	}
	tok := strings.TrimSpace(header[7:])
	if tok == "" {
		return "", false
	}
	return tok, true
}