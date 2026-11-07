/**
 * @jest-environment jsdom
 */
import { sanitizeErrorMessage } from '../../src/web/bootGuard';

// FST-06：启动期错误文本不得带出 token、授权码与长标识。
describe('bootGuard 错误脱敏', () => {
  test('移除 Bearer 凭证与 sessionToken 值', () => {
    const raw = 'startup failed: Authorization: Bearer abcdefgh12345678 sessionToken=secret_token_value';
    const safe = sanitizeErrorMessage(raw);

    expect(safe).not.toContain('abcdefgh12345678');
    expect(safe).not.toContain('secret_token_value');
    expect(safe).toContain('Bearer ***');
  });

  test('抹除超长标识并截断到 800 字符', () => {
    const longId = 'a'.repeat(64);
    const safe = sanitizeErrorMessage(`guestId=${longId} ${'x'.repeat(1200)}`);

    expect(safe).not.toContain(longId);
    expect(safe.length).toBeLessThanOrEqual(800);
  });
});