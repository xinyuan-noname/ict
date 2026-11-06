package apperr

import (
	"encoding/json"
	"net/http"
)

// SportCode 覆盖运动记录与成就域，独立于 AUTH/POINT/REWARD/CHECK。
type SportCode string

const (
	Sport001 SportCode = "SPORT_001"
	Sport002 SportCode = "SPORT_002"
	Sport003 SportCode = "SPORT_003"
	Sport004 SportCode = "SPORT_004"
	Sport005 SportCode = "SPORT_005"
	Sport006 SportCode = "SPORT_006"
	Sport007 SportCode = "SPORT_007"
	Sport008 SportCode = "SPORT_008"
	Sport009 SportCode = "SPORT_009"
	Sport010 SportCode = "SPORT_010"
	Sport011 SportCode = "SPORT_011"
	Sport012 SportCode = "SPORT_012"
)

var sportDictionary = map[SportCode]entry{
	Sport001: {400, "运动记录信息有误，请检查", false},
	Sport002: {404, "运动记录不存在", false},
	Sport003: {409, "请勿重复提交", false},
	Sport004: {422, "距离、时长或步数超出合理范围", false},
	Sport005: {403, "请先完善身体档案", false},
	Sport006: {429, "操作过于频繁，请稍后再试", true},
	Sport007: {503, "运动服务暂时不可用，请稍后重试", true},
	Sport008: {500, "成就评估失败，请稍后重试", true},
	Sport009: {409, "该成就已解锁", false},
	Sport010: {400, "日期格式有误", false},
	Sport011: {403, "游客模式暂不支持该功能", false},
	Sport012: {500, "成就积分发放失败，稍后将补发", true},
}

type SportError struct {
	Code  SportCode
	Cause error
}

func NewSport(code SportCode, cause error) *SportError { return &SportError{Code: code, Cause: cause} }
func (e *SportError) Error() string {
	if e.Cause != nil {
		return string(e.Code) + ": " + e.Cause.Error()
	}
	return string(e.Code)
}
func (e *SportError) Unwrap() error { return e.Cause }

func SportStatus(code SportCode) int {
	if e, ok := sportDictionary[code]; ok {
		return e.HTTPStatus
	}
	return http.StatusInternalServerError
}

func SportMessage(code SportCode) string {
	if e, ok := sportDictionary[code]; ok {
		return e.UserMessage
	}
	return "操作失败，请稍后重试"
}

func NormalizeSport(err error) SportCode {
	if err == nil {
		return Sport008
	}
	if se, ok := err.(*SportError); ok {
		if _, registered := sportDictionary[se.Code]; registered {
			return se.Code
		}
	}
	return Sport008
}

func WriteSport(w http.ResponseWriter, code SportCode, traceID string, retryAfter int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Trace-Id", traceID)
	if code == Sport006 && retryAfter > 0 {
		w.Header().Set("Retry-After", itoa(retryAfter))
	}
	w.WriteHeader(SportStatus(code))
	_ = json.NewEncoder(w).Encode(envelope{Code: string(code), Message: SportMessage(code), TraceID: traceID})
}

func SportCodes() []SportCode {
	return []SportCode{Sport001, Sport002, Sport003, Sport004, Sport005,
		Sport006, Sport007, Sport008, Sport009, Sport010, Sport011, Sport012}
}