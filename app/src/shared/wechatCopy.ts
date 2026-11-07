// 微信渠道展示文案集中映射：契约文案保持不变，仅覆盖展示层（WXO-57/59/60）。

export type WeChatCopyContext = 'authorize' | 'callback' | 'availability';

const CODE_COPY: Record<string, string> = {
  AUTH_001: '微信授权已失效，请重新扫码',
  AUTH_003: '微信服务暂时不可用，请稍后重试',
  AUTH_006: '授权校验失败，请重试',
  AUTH_007: '操作过于频繁，请稍后再试',
  AUTH_008: '微信登录暂不可用，可使用游客模式继续体验',
  AUTH_009: '当前渠道暂不支持该登录方式',
  AUTH_010: '账号已停用，请联系客服',
  AUTH_011: '未能获取微信身份，请重试',
  AUTH_012: '账号创建失败，请稍后重试',
  AUTH_014: '操作失败，请稍后重试'
};

const REASON_COPY: Record<string, string> = {
  wechat_app_unconfigured: '微信登录暂未开放，可使用游客模式继续体验',
  wechat_state_invalid: '授权校验失败，请重试',
  wechat_state_missing: '授权校验失败，请重试',
  wechat_state_expired: '授权已过期，请重新扫码',
  wechat_state_replayed: '授权已使用，请重新扫码',
  wechat_code_replayed: '授权已使用，请重新扫码',
  wechat_code_invalid: '授权码无效，请重新扫码',
  wechat_code_invalid_format: '授权码无效，请重新扫码',
  wechat_upstream_unavailable: '微信服务暂时不可用，请稍后重试',
  wechat_identity_missing: '未能获取微信身份，请重试',
  wechat_profile_failed: '账号创建失败，请稍后重试',
  wechat_account_disabled: '账号已停用，请联系客服',
  unavailable: '微信登录暂不可用，可使用游客模式继续体验'
};

export const WECHAT_CANCELLED_COPY = '已取消微信授权，可重试';
export const WECHAT_FALLBACK_COPY = '微信登录失败，请重试或使用游客模式';

export function wechatCopy(code?: string, reason?: string): string {
  if (reason && REASON_COPY[reason]) {
    return REASON_COPY[reason];
  }
  if (code && CODE_COPY[code]) {
    return CODE_COPY[code];
  }
  return WECHAT_FALLBACK_COPY;
}

// 校验文案渠道中立：不含华为、OAuth、openid、token、code、state 等技术术语。
export function isNeutralCopy(text: string): boolean {
  return !/华为|OAuth|openid|token|code|state/i.test(text);
}