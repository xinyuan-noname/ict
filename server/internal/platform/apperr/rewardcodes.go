package apperr

import (
	"encoding/json"
	"net/http"
)

// RewardCode 是奖励域独立命名空间（POINT_/REWARD_），与 AUTH_xxx 互不复用。
type RewardCode string

const (
	Point001  RewardCode = "POINT_001"
	Point002  RewardCode = "POINT_002"
	Point003  RewardCode = "POINT_003"
	Point004  RewardCode = "POINT_004"
	Point005  RewardCode = "POINT_005"
	Point006  RewardCode = "POINT_006"
	Reward001 RewardCode = "REWARD_001"
	Reward002 RewardCode = "REWARD_002"
	Reward003 RewardCode = "REWARD_003"
	Reward004 RewardCode = "REWARD_004"
	Reward005 RewardCode = "REWARD_005"
	Reward006 RewardCode = "REWARD_006"
	Reward007 RewardCode = "REWARD_007"
	Reward008 RewardCode = "REWARD_008"
)

var rewardDictionary = map[RewardCode]entry{
	Point001:  {400, "请求参数有误，请重试", false},
	Point002:  {409, "积分不足，无法兑换", false},
	Point003:  {403, "积分账户不可用，请联系管理员", false},
	Point004:  {429, "操作过于频繁，请稍后再试", true},
	Point005:  {503, "积分服务暂时不可用，请稍后重试", true},
	Point006:  {500, "积分记录加载失败，请稍后重试", true},
	Reward001: {404, "头像框不存在", false},
	Reward002: {409, "该头像框已下架", false},
	Reward003: {409, "你已拥有该头像框", false},
	Reward004: {403, "尚未拥有该头像框", false},
	Reward005: {503, "头像框服务暂时不可用，请稍后重试", true},
	Reward006: {409, "请求冲突，请重新提交", false},
	Reward007: {409, "头像框信息已更新，请刷新后重试", true},
	Reward008: {400, "请求参数有误，请重试", false},
}

// RewardError 携带仅进日志的 Cause。
type RewardError struct {
	Code  RewardCode
	Cause error
}

func NewReward(code RewardCode, cause error) *RewardError { return &RewardError{Code: code, Cause: cause} }

func (e *RewardError) Error() string {
	if e.Cause != nil {
		return string(e.Code) + ": " + e.Cause.Error()
	}
	return string(e.Code)
}

func (e *RewardError) Unwrap() error { return e.Cause }

// RewardStatus 返回码表状态；未知码兜底 500。
func RewardStatus(code RewardCode) int {
	if e, ok := rewardDictionary[code]; ok {
		return e.HTTPStatus
	}
	return http.StatusInternalServerError
}

// RewardMessage 返回中文提示。
func RewardMessage(code RewardCode) string {
	if e, ok := rewardDictionary[code]; ok {
		return e.UserMessage
	}
	return "操作失败，请稍后重试"
}

// NormalizeReward 把任意错误折叠为已登记码。
func NormalizeReward(err error) RewardCode {
	if err == nil {
		return Point005
	}
	if re, ok := err.(*RewardError); ok {
		if _, registered := rewardDictionary[re.Code]; registered {
			return re.Code
		}
	}
	return Point005
}

// WriteReward 输出统一失败包络；Retry-After 仅 POINT_004 使用。
func WriteReward(w http.ResponseWriter, code RewardCode, traceID string, retryAfterSeconds int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Trace-Id", traceID)
	if code == Point004 && retryAfterSeconds > 0 {
		w.Header().Set("Retry-After", itoa(retryAfterSeconds))
	}
	w.WriteHeader(RewardStatus(code))
	_ = json.NewEncoder(w).Encode(envelope{Code: string(code), Message: RewardMessage(code), TraceID: traceID})
}

// RewardCodes 返回全部奖励域码，供契约测试断言 14 条。
func RewardCodes() []RewardCode {
	return []RewardCode{Point001, Point002, Point003, Point004, Point005, Point006,
		Reward001, Reward002, Reward003, Reward004, Reward005, Reward006, Reward007, Reward008}
}