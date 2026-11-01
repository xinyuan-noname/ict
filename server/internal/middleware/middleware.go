package middleware

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"

	"ict/server/internal/platform/apperr"
	"ict/server/internal/platform/logx"
)

// 中间件顺序固定：Recover → TraceID → AccessLog → BodyLimit（任务 9.1）。

var tracePattern = regexp.MustCompile(`^[A-Za-z0-9-]{16,64}$`)

// Recover 捕获 panic 并折叠为 AUTH_014，堆栈不外泄。
func Recover(log *logx.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					log.Error(r.Context(), "panic recovered", "event", "panic")
					apperr.Write(w, apperr.Auth014, logx.TraceID(r.Context()), 0)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// TraceID 透传合法的入站 X-Trace-Id，否则生成新的。
func TraceID() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tid := r.Header.Get("X-Trace-Id")
			if !tracePattern.MatchString(tid) {
				tid = newTraceID()
			}
			w.Header().Set("X-Trace-Id", tid)
			next.ServeHTTP(w, r.WithContext(logx.WithTraceID(r.Context(), tid)))
		})
	}
}

// AccessLog 只记录元数据，不含请求体。
func AccessLog(log *logx.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(sw, r)
			log.Info(r.Context(), "access", "event", "access",
				"method", r.Method, "path", r.URL.Path,
				"status", sw.status, "duration_ms", time.Since(start).Milliseconds())
		})
	}
}

// BodyLimit 限制请求体 8KB，超限返回 AUTH_006。
func BodyLimit(limit int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, limit)
			}
			next.ServeHTTP(w, r)
		})
	}
}

// CORS 仅允许同源，OPTIONS 直接 204。
func CORS() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// ClientIP 默认取 RemoteAddr；仅可信代理才解析 XFF 最后一跳（任务 19.3）。
func ClientIP(r *http.Request, trusted []string) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if len(trusted) == 0 || !contains(trusted, host) {
		return host
	}
	xff := r.Header.Get("X-Forwarded-For")
	if xff == "" {
		return host
	}
	parts := strings.Split(xff, ",")
	return strings.TrimSpace(parts[len(parts)-1])
}

func contains(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

func newTraceID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "trace-" + time.Now().UTC().Format("20060102150405")
	}
	return hex.EncodeToString(b)
}

// BearerToken 从 Authorization 头取出凭证。
func BearerToken(r *http.Request) (string, bool) {
	return logx.ClaimType(r.Header.Get("Authorization"))
}

// WithClientIP 把来源 IP 注入 context，供 service 限流键使用。
func WithClientIP(ctx context.Context, ip string) context.Context {
	return context.WithValue(ctx, clientIPKey{}, ip)
}

func FromContextIP(ctx context.Context) string {
	if v, ok := ctx.Value(clientIPKey{}).(string); ok {
		return v
	}
	return "unknown"
}

type clientIPKey struct{}