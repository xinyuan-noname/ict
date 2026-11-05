package apperr

import (
	"encoding/json"
	"net/http"
)

// PetCode 覆盖宠物/道具/好友/PK 四域，独立于 AUTH/POINT/REWARD/CHECK。
type PetCode string

const (
	Pet001 PetCode = "PET_001"
	Pet002 PetCode = "PET_002"
	Pet003 PetCode = "PET_003"
	Pet004 PetCode = "PET_004"
	Pet005 PetCode = "PET_005"
	Pet006 PetCode = "PET_006"
	Pet007 PetCode = "PET_007"
	Pet008 PetCode = "PET_008"

	Item001 PetCode = "ITEM_001"
	Item002 PetCode = "ITEM_002"
	Item003 PetCode = "ITEM_003"
	Item004 PetCode = "ITEM_004"
	Item005 PetCode = "ITEM_005"
	Item006 PetCode = "ITEM_006"

	Friend001 PetCode = "FRIEND_001"
	Friend002 PetCode = "FRIEND_002"
	Friend003 PetCode = "FRIEND_003"
	Friend004 PetCode = "FRIEND_004"
	Friend005 PetCode = "FRIEND_005"
	Friend006 PetCode = "FRIEND_006"

	Pk001 PetCode = "PK_001"
	Pk002 PetCode = "PK_002"
	Pk003 PetCode = "PK_003"
	Pk004 PetCode = "PK_004"
	Pk005 PetCode = "PK_005"
	Pk006 PetCode = "PK_006"
	Pk007 PetCode = "PK_007"
	Pk008 PetCode = "PK_008"
)

var petDictionary = map[PetCode]entry{
	Pet001: {400, "请求参数有误，请重试", false},
	Pet002: {404, "请先领养宠物", false},
	Pet003: {409, "你已经有宠物了", false},
	Pet004: {409, "今日改名次数已用完", false},
	Pet005: {409, "没有可分配的点数", false},
	Pet006: {422, "该属性已达上限", false},
	Pet007: {503, "宠物服务暂时不可用", true},
	Pet008: {500, "操作失败，请稍后重试", true},

	Item001: {404, "道具不存在", false},
	Item002: {409, "道具数量不足", false},
	Item003: {409, "请求冲突，请重新提交", false},
	Item004: {410, "该道具已下架", false},
	Item005: {403, "游客模式暂不支持该道具", false},
	Item006: {503, "道具服务暂时不可用", true},

	Friend001: {400, "邀请码格式有误", false},
	Friend002: {409, "邀请码无效或已过期", false},
	Friend003: {409, "好友数量已达上限", false},
	Friend004: {409, "你们已经是好友了", false},
	Friend005: {403, "请先登录后再使用好友功能", false},
	Friend006: {404, "好友不存在", false},

	Pk001: {400, "请求参数有误", false},
	Pk002: {403, "仅可向好友发起 PK", false},
	Pk003: {409, "对局已过期", false},
	Pk004: {429, "今日 PK 次数已用完", true},
	Pk005: {409, "该对局已结算", false},
	Pk006: {403, "无权操作该对局", false},
	Pk007: {409, "今日已与该好友 PK 过", false},
	Pk008: {503, "PK 服务暂时不可用", true},
}

type PetError struct {
	Code  PetCode
	Cause error
}

func NewPet(code PetCode, cause error) *PetError { return &PetError{Code: code, Cause: cause} }
func (e *PetError) Error() string {
	if e.Cause != nil {
		return string(e.Code) + ": " + e.Cause.Error()
	}
	return string(e.Code)
}
func (e *PetError) Unwrap() error { return e.Cause }

func PetStatus(code PetCode) int {
	if e, ok := petDictionary[code]; ok {
		return e.HTTPStatus
	}
	return http.StatusInternalServerError
}

func PetMessage(code PetCode) string {
	if e, ok := petDictionary[code]; ok {
		return e.UserMessage
	}
	return "操作失败，请稍后重试"
}

func NormalizePet(err error) PetCode {
	if err == nil {
		return Pet008
	}
	if pe, ok := err.(*PetError); ok {
		if _, registered := petDictionary[pe.Code]; registered {
			return pe.Code
		}
	}
	return Pet008
}

func WritePet(w http.ResponseWriter, code PetCode, traceID string, retryAfter int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Trace-Id", traceID)
	if code == Pk004 && retryAfter > 0 {
		w.Header().Set("Retry-After", itoa(retryAfter))
	}
	w.WriteHeader(PetStatus(code))
	_ = json.NewEncoder(w).Encode(envelope{Code: string(code), Message: PetMessage(code), TraceID: traceID})
}

// PetCodes 返回 28 个宠物域码，供契约测试断言。
func PetCodes() []PetCode {
	return []PetCode{
		Pet001, Pet002, Pet003, Pet004, Pet005, Pet006, Pet007, Pet008,
		Item001, Item002, Item003, Item004, Item005, Item006,
		Friend001, Friend002, Friend003, Friend004, Friend005, Friend006,
		Pk001, Pk002, Pk003, Pk004, Pk005, Pk006, Pk007, Pk008,
	}
}