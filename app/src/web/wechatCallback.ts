// 微信回跳捕获必须在 React 挂载前执行：
// 只把 code/state 放在模块级内存变量，不写 localStorage / sessionStorage。

export type WeChatCallbackContext =
  | { kind: 'success'; code: string; state: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string }
  | { kind: 'none' };

let pending: WeChatCallbackContext | null = null;

const ERROR_COPY = '授权校验失败，请重试';

export function captureWeChatCallback(search: string): WeChatCallbackContext {
  const params = new URLSearchParams(search || '');
  const code = params.get('code') ?? '';
  const state = params.get('state') ?? '';
  if (!code && !state) {
    pending = { kind: 'none' };
    return pending;
  }
  if (!code) {
    pending = { kind: 'cancelled' };
    return pending;
  }
  if (!state || code.length > 512 || state.length > 512) {
    pending = { kind: 'error', message: ERROR_COPY };
    return pending;
  }
  pending = { kind: 'success', code, state };
  return pending;
}

// 挂载后由 AppRoot 消费一次，避免重复兑换。
export function takePendingWeChatCallback(): WeChatCallbackContext | null {
  const value = pending;
  pending = null;
  return value;
}

// 仅保留 pathname 与哈希，移除 code/state（不进入历史记录）。
export function cleanWeChatSearch(pathname: string, hash = ''): string {
  return (pathname || '/') + (hash || '');
}