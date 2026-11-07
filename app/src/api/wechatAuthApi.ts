import type { ApiClient, RawResponse } from './client';
import type { UserBrief } from './authApi';

// 微信链路只接受同源请求（WXO-54 / P5）：baseUrl 由装配层固定为 window.location.origin。

export interface WeChatAuthorizeResult {
  authorizeUrl: string;
  callbackPath: string;
  expiresAt: string;
  traceId: string;
}

export interface WeChatCallbackResult {
  sessionToken: string;
  expiresAt: string;
  user: UserBrief;
  firstLogin: boolean;
  platform: 'wechat';
  traceId: string;
}

export interface WeChatCancelledResult {
  cancelled: true;
  traceId: string;
}

export interface WeChatAvailabilityResult {
  enabled: boolean;
  reason?: 'disabled' | 'unconfigured' | 'misconfigured' | 'unavailable';
  traceId: string;
}

export interface WeChatCallbackRequest {
  code: string;
  state: string;
  cancelled?: boolean;
  clientVersion?: string;
}

export class WeChatAuthApi {
  constructor(private readonly client: ApiClient) {}

  // 请求体不含 platform / redirectUri：由服务端固定配置决定。
  authorize(): Promise<RawResponse<WeChatAuthorizeResult>> {
    return this.client.request<WeChatAuthorizeResult>('/v1/auth/wechat/authorize', {
      method: 'POST',
      body: {}
    });
  }

  callback(req: WeChatCallbackRequest): Promise<RawResponse<WeChatCallbackResult | WeChatCancelledResult>> {
    return this.client.request<WeChatCallbackResult | WeChatCancelledResult>('/v1/auth/wechat/callback', {
      method: 'POST',
      body: req
    });
  }

  availability(): Promise<RawResponse<WeChatAvailabilityResult>> {
    return this.client.request<WeChatAvailabilityResult>('/v1/auth/wechat/availability');
  }
}

export function isCancelledResult(
  result: WeChatCallbackResult | WeChatCancelledResult
): result is WeChatCancelledResult {
  return (result as WeChatCancelledResult).cancelled === true;
}

// 仅在装配层使用：保证微信请求同源；非浏览器/非 http(s) 环境返回空串并禁用微信。
// 注意 file:// 打开时 location.origin 是字符串 "null"，必须视为不可用，
// 否则会构造出非法 baseUrl 并在渲染期抛 ProtocolError（白屏）。
export function weChatOrigin(): string {
  if (typeof window === 'undefined' || !window.location) {
    return '';
  }
  const origin = window.location.origin;
  if (!origin || origin === 'null' || !/^https?:\/\//.test(origin)) {
    return '';
  }
  return origin;
}