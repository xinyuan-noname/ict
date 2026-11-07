/**
 * @jest-environment jsdom
 */
import {
  captureWeChatCallback,
  cleanWeChatSearch,
  takePendingWeChatCallback
} from '../../src/web/wechatCallback';

// WXO-07/22/42/43：回跳三分类 + URL 清理 + 不写存储。
describe('微信回跳捕获', () => {
  test('无参数时不拦截且不设置上下文', () => {
    const ctx = captureWeChatCallback('');
    expect(ctx.kind).toBe('none');
    expect(takePendingWeChatCallback()?.kind).toBe('none');
  });

  test('code+state 判定为成功', () => {
    const ctx = captureWeChatCallback('?code=abc123&state=xyz789');
    expect(ctx).toEqual({ kind: 'success', code: 'abc123', state: 'xyz789' });
    expect(takePendingWeChatCallback()?.kind).toBe('success');
    expect(takePendingWeChatCallback()).toBeNull();
  });

  test('仅 state 判定为取消，不调服务端', () => {
    expect(captureWeChatCallback('?state=xyz789').kind).toBe('cancelled');
  });

  test('有 code 无 state 或超长判定为异常', () => {
    expect(captureWeChatCallback('?code=abc123').kind).toBe('error');
    expect(captureWeChatCallback(`?code=${'a'.repeat(513)}&state=s`).kind).toBe('error');
  });

  test('清理后仅保留 pathname', () => {
    expect(cleanWeChatSearch('/index.html')).toBe('/index.html');
    expect(cleanWeChatSearch('', '#/home')).toBe('/#/home');
  });

  test('捕获不写入 localStorage/sessionStorage', () => {
    localStorage.clear();
    sessionStorage.clear();
    captureWeChatCallback('?code=abc&state=def');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});