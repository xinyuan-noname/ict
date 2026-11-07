package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
)

// 微信身份命名空间：与华为 openid 同字面值也不相交（规格 WXO-30）。
const (
	WeChatOpenIDPrefix     = "wechat:"
	WeChatCodeDigestPrefix = "wechat:code:"
	WeChatDefaultName      = "微信用户"
)

// WeChatIdentity 值对象：仅承载建档所需最小字段（WXO-28），
// 不引入手机号、地理位置等额外信息。UnionID 仅记录，不参与唯一键。
type WeChatIdentity struct {
	OpenID      string
	UnionID     string
	DisplayName string
	AvatarURL   string
	IssuerAppID string
}

// NamespacedOpenID 返回微信 openid 的存储键；非法或空值返回失败。
func NamespacedOpenID(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if !ValidOpenID(raw) {
		return "", false
	}
	return WeChatOpenIDPrefix + raw, true
}

// ValidateWeChatIdentity 校验开放平台身份；空昵称/空头像不算失败，
// IssuerAppID 必须与当前应用一致，防止跨应用 openid 混用。
func ValidateWeChatIdentity(id WeChatIdentity, expectedAppID string) error {
	if strings.TrimSpace(id.OpenID) == "" || !ValidOpenID(id.OpenID) {
		return errors.New("wechat identity invalid")
	}
	if strings.TrimSpace(id.IssuerAppID) == "" || id.IssuerAppID != expectedAppID {
		return errors.New("wechat identity issuer mismatch")
	}
	return nil
}

// WeChatCodeDigest 是授权码消费去重键；只存摘要，不落原文。
func WeChatCodeDigest(code string) string {
	sum := sha256.Sum256([]byte(code))
	return WeChatCodeDigestPrefix + hex.EncodeToString(sum[:])
}

// NormalizeWeChatProfile 复用既有清洗规则，仅保留昵称与头像两项。
func NormalizeWeChatProfile(id WeChatIdentity) (displayName, avatarURL string) {
	displayName = SanitizeDisplayName(id.DisplayName)
	avatarURL = SanitizeAvatarURL(id.AvatarURL)
	return displayName, avatarURL
}