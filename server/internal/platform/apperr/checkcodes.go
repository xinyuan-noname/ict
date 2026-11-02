package apperr

import (
	"encoding/json"
	"net/http"
)

// CheckCode 是清单域独立命名空间（CHECK_），与 AUTH_/POINT_/REWARD_ 互不复用。
type CheckCode string

const (
	Check001 CheckCode = "CHECK_001"
	Check002 CheckCode = "CHECK_002"
	Check003 CheckCode = "CHECK_003"
	Check004 CheckCode = "CHECK_004"
	Check005 CheckCode = "CHECK_005"
	Check006 CheckCode = "CHECK_006"
	Check007 CheckCode = "CHECK_007"
	Check008 CheckCode = "CHECK_008"
	Check009 CheckCode = "CHECK_009"
	Check010 CheckCode = "CHECK_010"
	Check011 CheckCode = "CHECK_011"
	Check012 CheckCode = "CHECK_012"
)

var checkDictionary = map[CheckCode]entry{
	Check001: {400, "请求参数有误，请重试", false},
	Check002: {404, "记录不存在", false},
	Check003: {409, "请求冲突，请重新提交", false},
	Check004: {409, "目标已更新，请刷新后重试", true},
	Check005: {422, "身体数据超出合理范围，请检查", false},
	Check006: {403, "请先完善身体档案", false},
	Check007: {429, "操作过于频繁，请稍后再试", true},
	Check008: {503, "清单服务暂时不可用，请稍后重试", true},
	Check009: {500, "操作失败，请稍后重试", true},
	Check010: {400, "日期格式有误，请重试", false},
	Check011: {409, "记录已存在", false},
	Check012: {413, "请求内容过大", false},
}

type CheckError struct {
	Code  CheckCode
	Cause error
}

func NewCheck(code CheckCode, cause error) *CheckError { return &CheckError{Code: code, Cause: cause} }
func (e *CheckError) Error() string {
	if e.Cause != nil {
		return string(e.Code) + ": " + e.Cause.Error()
	}
	return string(e.Code)
}
func (e *CheckError) Unwrap() error { return e.Cause }

func CheckStatus(code CheckCode) int {
	if e, ok := checkDictionary[code]; ok {
		return e.HTTPStatus
	}
	return http.StatusInternalServerError
}

func CheckMessage(code CheckCode) string {
	if e, ok := checkDictionary[code]; ok {
		return e.UserMessage
	}
	return "操作失败，请稍后重试"
}

func NormalizeCheck(err error) CheckCode {
	if err == nil {
		return Check009
	}
	if ce, ok := err.(*CheckError); ok {
		if _, registered := checkDictionary[ce.Code]; registered {
			return ce.Code
		}
	}
	return Check009
}

func WriteCheck(w http.ResponseWriter, code CheckCode, traceID string, retryAfter int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Trace-Id", traceID)
	if code == Check007 && retryAfter > 0 {
		w.Header().Set("Retry-After", itoa(retryAfter))
	}
	w.WriteHeader(CheckStatus(code))
	_ = json.NewEncoder(w).Encode(envelope{Code: string(code), Message: CheckMessage(code), TraceID: traceID})
}

func CheckCodes() []CheckCode {
	return []CheckCode{Check001, Check002, Check003, Check004, Check005, Check006,
		Check007, Check008, Check009, Check010, Check011, Check012}
}