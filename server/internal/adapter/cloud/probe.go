// Package cloud 提供华为云资源的最小只读探活能力。
//
// 设计原则：
//   - 只返回 ok / degraded / fail / not_configured，不返回连接串、账号或密钥；
//   - 探活失败不影响主业务，/v1/health 以 degraded 呈现；
//   - 未配置资源时保持本地零依赖运行，方便离线 Demo。
package cloud

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
)

// Prober 由 handler 以只读方式调用。
type Prober interface {
	Probe(ctx context.Context) string
}

// TCPProbe 检查 RDS / Redis 的 VPC 内网端口是否可达。
// 说明：这是连接层探活，不执行 SQL 或 Redis 命令。
type TCPProbe struct {
	Name    string
	Addr    string
	Timeout time.Duration
}

func (p TCPProbe) Probe(ctx context.Context) string {
	if strings.TrimSpace(p.Addr) == "" {
		return "not_configured"
	}
	timeout := p.Timeout
	if timeout <= 0 {
		timeout = 800 * time.Millisecond
	}
	dialer := net.Dialer{Timeout: timeout}
	conn, err := dialer.DialContext(ctx, "tcp", p.Addr)
	if err != nil {
		return "fail"
	}
	_ = conn.Close()
	return "ok"
}

// HTTPProbe 检查 MaaS / 模型网关的健康端点。
type HTTPProbe struct {
	URL     string
	Token   string
	Timeout time.Duration
	Client  *http.Client
}

func (p HTTPProbe) Probe(ctx context.Context) string {
	if strings.TrimSpace(p.URL) == "" {
		return "not_configured"
	}
	timeout := p.Timeout
	if timeout <= 0 {
		timeout = 1200 * time.Millisecond
	}
	client := p.Client
	if client == nil {
		client = &http.Client{Timeout: timeout}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.URL, nil)
	if err != nil {
		return "fail"
	}
	req.Header.Set("Accept", "application/json")
	if p.Token != "" {
		req.Header.Set("Authorization", "Bearer "+p.Token)
	}
	resp, err := client.Do(req)
	if err != nil {
		return "fail"
	}
	defer func() { _ = resp.Body.Close() }()
	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return "ok"
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		return "degraded"
	default:
		return "fail"
	}
}

// Describe 用于日志，避免把地址写进普通日志。
func Describe(state string) string {
	return fmt.Sprintf("cloud_probe=%s", state)
}
