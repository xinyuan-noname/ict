import { ALL_CATALOG_CODES, GENERIC_UNKNOWN_MESSAGE, LOCAL_CANCELLED, isCancelled, lookup, shouldClearCredential, userMessageFor } from '../src/shared/errorCatalog';

describe('errorCatalog', () => {
  it('包含 14 个服务端码与 1 个客户端本地码', () => {
    expect(ALL_CATALOG_CODES).toHaveLength(15);
    expect(ALL_CATALOG_CODES).toContain('AUTH_001');
    expect(ALL_CATALOG_CODES).toContain('AUTH_014');
    expect(ALL_CATALOG_CODES).toContain(LOCAL_CANCELLED);
  });

  it('文案与契约一致', () => {
    expect(userMessageFor('AUTH_001')).toBe('登录已过期，请重新登录');
    expect(userMessageFor('AUTH_010')).toBe('账号不可用，请联系管理员');
    expect(userMessageFor('AUTH_013')).toBe('登录状态已失效，请重新登录');
  });

  it('本地取消码没有 HTTP 状态', () => {
    expect(lookup('AUTH_002')?.httpStatus).toBeNull();
    expect(isCancelled('AUTH_002')).toBe(true);
    expect(isCancelled('AUTH_001')).toBe(false);
  });

  it('未登记码与空码走通用兜底且不返回空白', () => {
    expect(userMessageFor('AUTH_999')).toBe(GENERIC_UNKNOWN_MESSAGE);
    expect(userMessageFor(undefined)).toBe(GENERIC_UNKNOWN_MESSAGE);
    expect(userMessageFor('AUTH_999').length).toBeGreaterThan(0);
  });

  it('终态失效族触发清凭证', () => {
    for (const code of ['AUTH_004', 'AUTH_005', 'AUTH_013', 'AUTH_010']) {
      expect(shouldClearCredential(code)).toBe(true);
    }
    expect(shouldClearCredential('AUTH_003')).toBe(false);
    expect(shouldClearCredential('AUTH_007')).toBe(false);
  });
});