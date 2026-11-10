package ollama

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Options struct {
	BaseURL string
	Model   string
	Timeout time.Duration
	HTTP    *http.Client
}

type Client struct {
	baseURL string
	model   string
	http    *http.Client
}

func New(opts Options) *Client {
	baseURL := strings.TrimRight(strings.TrimSpace(opts.BaseURL), "/")
	if baseURL == "" {
		baseURL = "http://127.0.0.1:11434"
	}
	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	httpClient := opts.HTTP
	if httpClient == nil {
		httpClient = &http.Client{Timeout: timeout}
	}
	model := strings.TrimSpace(opts.Model)
	if model == "" {
		model = "qwen2.5:0.5b"
	}
	return &Client{baseURL: baseURL, model: model, http: httpClient}
}

type chatRequest struct {
	Model    string         `json:"model"`
	Messages []chatMessage  `json:"messages"`
	Stream   bool           `json:"stream"`
	Format   string         `json:"format,omitempty"`
	Options  map[string]any `json:"options,omitempty"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatResponse struct {
	Message chatMessage `json:"message"`
	Error   string      `json:"error"`
}

// GenerateJSON 调用 Ollama /api/chat 并返回 message.content。
func (c *Client) GenerateJSON(ctx context.Context, system, user string) (string, error) {
	body := chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		Stream: false,
		Format: "json",
		Options: map[string]any{
			"temperature": 0.4,
			"num_predict": 1400,
		},
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/chat", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("ollama request: %w", err)
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return "", fmt.Errorf("ollama read: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("ollama status %d: %s", resp.StatusCode, strings.TrimSpace(string(payload)))
	}
	var out chatResponse
	if err := json.Unmarshal(payload, &out); err != nil {
		return "", fmt.Errorf("ollama decode: %w", err)
	}
	if out.Error != "" {
		return "", fmt.Errorf("ollama: %s", out.Error)
	}
	content := strings.TrimSpace(out.Message.Content)
	if content == "" {
		return "", fmt.Errorf("ollama returned empty content")
	}
	return content, nil
}

// Model 返回当前模型名，便于健康检查/日志。
func (c *Client) Model() string { return c.model }
