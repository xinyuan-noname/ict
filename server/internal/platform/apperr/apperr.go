package apperr

import (
	"encoding/json"
	"net/http"
)

// Code 是编译期受约束的错误码枚举（任务 8.1）。
type Code string

const (
	Auth001 Code = "AUTH_001"
	Auth002 Code = "AUTH_002"
	Auth003 Code = "AUTH_003"
	Auth004 Code = "AUTH_004"
	Auth005 Code = "AUTH_005"
	Auth006 Code = "AUTH_006"
	Auth007 Code = "AUTH_007"
	Auth008 Code = "AUTH_008"
	Auth009 Code = "AUTH_009"
	Auth010 Code = "AUTH_010"
	Auth011 Code = "AUTH_011"
	Auth012 Code = "AUTH_012"
	Auth013 Code = "AUTH_013"
	Auth014 Code = "AUTH_014"
)

type entry struct {
	HTTPStatus  int
	UserMessage string
	Retryable   bool
}

// 由 contracts/error-codes.json 同步而来，禁止单端改动（任务 8.3）。
var dictionary = map[Code]entry{
	Auth001: {400, "登录已过期，请重新登录", true},
	Auth002: {0, "已取消授权，可重新登录", true}, // 客户端本地码，服务端不得构造
	Auth003: {503, "华为账号服务暂时不可用，请稍后重试", true},
	Auth004: {401, "登录状态已失效，请重新登录", false},
	Auth005: {401, "登录已过期，请重新登录", false},
	Auth006: {400, "登录请求异常，请重新登录", false},
	Auth007: {429, "操作过于频繁，请稍后再试", true},
	Auth008: {503, "服务配置异常，请联系管理员", false},
	Auth009: {400, "当前平台暂不支持华为账号登录", false},
	Auth010: {403, "账号不可用，请联系管理员", false},
	Auth011: {502, "登录信息异常，请稍后重试", true},
	Auth012: {500, "登录失败，请稍后重试", true},
	Auth013: {401, "登录状态已失效，请重新登录", false},
	Auth014: {500, "操作失败，请稍后重试", true},
}

// Error 携带仅进日志的 Cause 与仅进审计的 Reason（任务 8.2/8.5）。
type Error struct {
	Code   Code
	Cause  error
	Reason string
}

func New(code Code, cause error) *Error { return &Error{Code: code, Cause: cause} }

func (e *Error) Error() string {
	if e.Cause != nil {
		return string(e.Code) + ": " + e.Cause.Error()
	}
	return string(e.Code)
}

func (e *Error) Unwrap() error { return e.Cause }

// HTTPStatus 返回字典中的状态码；未登记码折叠为 AUTH_014。
func HTTPStatus(code Code) int {
	e, ok := dictionary[code]
	if !ok || e.HTTPStatus == 0 && code != Auth002 {
		return http.StatusInternalServerError
	}
	return e.HTTPStatus
}

// Message 返回字典中文文案。
func Message(code Code) string {
	if e, ok := dictionary[code]; ok {
		return e.UserMessage
	}
	return dictionary[Auth014].UserMessage
}

// Normalize 把任意错误折叠为已登记码（任务 8.6）。
func Normalize(err error) Code {
	if err == nil {
		return Auth014
	}
	if ae, ok := err.(*Error); ok && ae.Code != Auth002 {
		if _, registered := dictionary[ae.Code]; registered {
			return ae.Code
		}
	}
	return Auth014
}

type envelope struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	TraceID string `json:"traceId"`
}

// Write 输出统一失败包络；Retry-After 仅 AUTH_007 输出（任务 8.4）。
func Write(w http.ResponseWriter, code Code, traceID string, retryAfterSeconds int) {
	if code == Auth002 {
		code = Auth014
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Trace-Id", traceID)
	if code == Auth007 && retryAfterSeconds > 0 {
		w.Header().Set("Retry-After", itoa(retryAfterSeconds))
	}
	w.WriteHeader(HTTPStatus(code))
	_ = json.NewEncoder(w).Encode(envelope{Code: string(code), Message: Message(code), TraceID: traceID})
}

func itoa(n int) string {
	if n <= 0 {
		return "1"
	}
	buf := [8]byte{}
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

// All 返回全部服务端可产出的码，供契约测试断言 14 条。
func All() []Code {
	return []Code{Auth001, Auth002, Auth003, Auth004, Auth005, Auth006, Auth007, Auth008, Auth009, Auth010, Auth011, Auth012, Auth013, Auth014}
}