import { ApiError, NetworkError } from '../src/api/client';
import type { AuthApi } from '../src/api/authApi';
import { AuthProvider } from '../src/auth/AuthProvider';
import type { AuthProviderStrategy } from '../src/auth/providers/types';
import { MemoryVault, SESSION_KEY } from '../src/native/SecureVault';

function makeApi(): jest.Mocked<AuthApi> {
  return {
    login: jest.fn(),
    validate: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
    health: jest.fn()
  } as unknown as jest.Mocked<AuthApi>;
}

function makeProvider(): jest.Mocked<AuthProviderStrategy> {
  return { platform: 'android', requestAuthCode: jest.fn() } as unknown as jest.Mocked<AuthProviderStrategy>;
}

function build(api: jest.Mocked<AuthApi>, vault: MemoryVault, strategy: jest.Mocked<AuthProviderStrategy>): AuthProvider {
  return new AuthProvider({ api, vault, provider: strategy, clientVersion: '1.0.0' });
}

describe('AuthProvider 状态机', () => {
  it('无本地凭证直接 anonymous 且不调用接口', async () => {
    const api = makeApi();
    const vault = new MemoryVault();
    const p = build(api, vault, makeProvider());
    await p.bootstrap();
    expect(p.getSnapshot().state).toBe('anonymous');
    expect(api.validate).not.toHaveBeenCalled();
  });

  it('有效凭证恢复为 authenticated', async () => {
    const api = makeApi();
    const vault = new MemoryVault();
    await vault.set(SESSION_KEY, 's1_token');
    api.validate.mockResolvedValue({
      data: { valid: true, user: { userId: 'u1', displayName: '华小为' }, expiresAt: '2030-01-01T00:00:00Z', traceId: 't1' },
      traceId: 't1'
    });
    const p = build(api, vault, makeProvider());
    await p.bootstrap();
    expect(p.getSnapshot().state).toBe('authenticated');
    expect(p.getSnapshot().user?.userId).toBe('u1');
  });

  it('AUTH_004 清凭证并回登录页', async () => {
    const api = makeApi();
    const vault = new MemoryVault();
    await vault.set(SESSION_KEY, 's1_token');
    api.validate.mockRejectedValue(new ApiError(401, 'AUTH_004', 't2'));
    const p = build(api, vault, makeProvider());
    await p.bootstrap();
    expect(p.getSnapshot().state).toBe('anonymous');
    expect(await vault.get(SESSION_KEY)).toBeNull();
    expect(p.getSnapshot().lastError?.code).toBe('AUTH_004');
  });

  it('网络失败保留凭证，连续三次才清除', async () => {
    const api = makeApi();
    const vault = new MemoryVault();
    await vault.set(SESSION_KEY, 's1_keep');
    api.validate.mockRejectedValue(new NetworkError('timeout'));
    const p = build(api, vault, makeProvider());

    await p.bootstrap();
    expect(await vault.get(SESSION_KEY)).toBe('s1_keep');
    await p.bootstrap();
    expect(await vault.get(SESSION_KEY)).toBe('s1_keep');
    await p.bootstrap();
    expect(await vault.get(SESSION_KEY)).toBeNull();
    expect(p.getSnapshot().state).toBe('anonymous');
  });

  it('续期时写入新凭证', async () => {
    const api = makeApi();
    const vault = new MemoryVault();
    await vault.set(SESSION_KEY, 's1_old');
    api.validate.mockResolvedValue({
      data: {
        valid: true,
        user: { userId: 'u1' },
        expiresAt: '2030-01-01T00:00:00Z',
        sessionToken: 's1_new',
        traceId: 't3'
      },
      traceId: 't3'
    });
    const p = build(api, vault, makeProvider());
    await p.bootstrap();
    expect(p.getSnapshot().state).toBe('authenticated');
    expect(await vault.get(SESSION_KEY)).toBe('s1_new');
  });

  it('取消授权不调用登录接口', async () => {
    const api = makeApi();
    const vault = new MemoryVault();
    const strategy = makeProvider();
    strategy.requestAuthCode.mockResolvedValue({ kind: 'cancelled' });
    const p = build(api, vault, strategy);
    await p.login();
    expect(api.login).not.toHaveBeenCalled();
    expect(p.getSnapshot().lastError?.code).toBe('AUTH_002');
  });

  it('登录成功后写入凭证并进入 authenticated', async () => {
    const api = makeApi();
    const vault = new MemoryVault();
    const strategy = makeProvider();
    strategy.requestAuthCode.mockResolvedValue({ kind: 'code', code: 'auth-code' });
    api.login.mockResolvedValue({
      data: {
        sessionToken: 's1_new',
        expiresAt: '2030-01-01T00:00:00Z',
        user: { userId: 'u9' },
        firstLogin: true,
        traceId: 't4'
      },
      traceId: 't4'
    });
    const p = build(api, vault, strategy);
    await p.login();
    expect(api.login).toHaveBeenCalledWith(expect.objectContaining({ authCode: 'auth-code', platform: 'android' }));
    expect(await vault.get(SESSION_KEY)).toBe('s1_new');
    expect(p.getSnapshot().state).toBe('authenticated');
  });

  it('安全存储写入失败视为登录失败且尽力吊销', async () => {
    const api = makeApi();
    const vault = new MemoryVault();
    jest.spyOn(vault, 'set').mockRejectedValue(new Error('keystore unavailable'));
    const strategy = makeProvider();
    strategy.requestAuthCode.mockResolvedValue({ kind: 'code', code: 'auth-code' });
    api.login.mockResolvedValue({
      data: { sessionToken: 's1_x', expiresAt: '2030-01-01T00:00:00Z', user: { userId: 'u1' }, firstLogin: false, traceId: 't5' },
      traceId: 't5'
    });
    api.logout.mockResolvedValue({ data: { success: true, traceId: 't6' }, traceId: 't6' });
    const p = build(api, vault, strategy);
    await p.login();
    expect(p.getSnapshot().state).toBe('anonymous');
    expect(api.logout).toHaveBeenCalledWith('s1_x');
  });

  it('退出失败仍清本地凭证并明确提示', async () => {
    const api = makeApi();
    const vault = new MemoryVault();
    await vault.set(SESSION_KEY, 's1_t');
    api.logout.mockRejectedValue(new NetworkError('offline'));
    const p = build(api, vault, makeProvider());
    await p.logout();
    expect(await vault.get(SESSION_KEY)).toBeNull();
    expect(p.getSnapshot().state).toBe('anonymous');
    expect(p.getSnapshot().lastError?.message).toContain('退出未完成');
  });

  it('能力不可用时进入 unsupported', async () => {
    const api = makeApi();
    const vault = new MemoryVault();
    const p = new AuthProvider({
      api,
      vault,
      provider: makeProvider(),
      capability: { available: async () => false },
      clientVersion: '1.0.0'
    });
    await p.bootstrap();
    expect(p.getSnapshot().state).toBe('unsupported');
    expect(api.validate).not.toHaveBeenCalled();
  });
});