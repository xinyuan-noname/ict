import { isNeutralCopy, wechatCopy, WECHAT_CANCELLED_COPY } from '../src/shared/wechatCopy';

describe('微信渠道文案', () => {
  test('按错误码返回渠道中立文案', () => {
    expect(wechatCopy('AUTH_003')).toContain('微信服务暂时不可用');
    expect(wechatCopy('AUTH_006')).toBe('授权校验失败，请重试');
    expect(wechatCopy('AUTH_008')).toContain('游客模式');
  });

  test('按内部 reason 优先映射', () => {
    expect(wechatCopy('AUTH_001', 'wechat_code_replayed')).toContain('重新扫码');
    expect(wechatCopy(undefined, 'unavailable')).toContain('游客模式');
  });

  test('取消文案不含错误技术术语', () => {
    expect(WECHAT_CANCELLED_COPY).toBe('已取消微信授权，可重试');
    expect(isNeutralCopy(WECHAT_CANCELLED_COPY)).toBe(true);
  });

  test('全部文案不含华为与 OAuth 术语', () => {
    for (const code of [
      'AUTH_001', 'AUTH_003', 'AUTH_006', 'AUTH_007', 'AUTH_008',
      'AUTH_009', 'AUTH_010', 'AUTH_011', 'AUTH_012', 'AUTH_014'
    ]) {
      const text = wechatCopy(code);
      expect(isNeutralCopy(text)).toBe(true);
    }
  });
});