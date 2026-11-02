import { ProtocolError } from '../src/api/client';
import { ApiClient } from '../src/api/client';
import type { AuthApi } from '../src/api/authApi';
import { AuthProvider } from '../src/auth/AuthProvider';
import type { AuthProviderStrategy } from '../src/auth/providers/types';
import { GuestNetworkGuard } from '../src/guest/GuestNetworkGuard';
import { GuestStore } from '../src/guest/GuestStore';
import { MemoryGuestStorage } from '../src/guest/GuestStorage';
import { MemoryVault } from '../src/native/SecureVault';

function makeApi(): jest.Mocked<AuthApi> {
  return {
    login: jest.fn(),
    validate: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
    health: jest.fn()
  } as unknown as jest.Mocked<AuthApi>;
}

function makeStrategy(): jest.Mocked<AuthProviderStrategy> {
  return { platform: 'android', requestAuthCode: jest.fn() } as unknown as jest.Mocked<AuthProviderStrategy>;
}

interface Harness {
  provider: AuthProvider;
  api: jest.Mocked<AuthApi>;
  vault: MemoryVault;
  storage: MemoryGuestStorage;
  guard: GuestNetworkGuard;
  strategy: jest.Mocked<AuthProviderStrategy>;
}

function buildHarness(storage = new MemoryGuestStorage()): Harness {
  const api = makeApi();
  const vault = new MemoryVault();
  const guard = new GuestNetworkGuard();
  const strategy = makeStrategy();
  const provider = new AuthProvider({
    api,
    vault,
    provider: strategy,
    clientVersion: '1.0.0',
    guestStore: new GuestStore({ storage }),
    networkGuard: guard
  });
  return { provider, api, vault, storage, guard, strategy };
}

describe('游客模式五态与零网络', () => {
  it('无凭证无档案进入 anonymous', async () => {
    const h = buildHarness();
    await h.provider.bootstrap();
    expect(h.provider.getSnapshot().state).toBe('anonymous');
    expect(h.api.validate).not.toHaveBeenCalled();
  });

  it('游客进入后为 guest，且 currentToken 为 null', async () => {
    const h = buildHarness();
    await h.provider.bootstrap();
    await h.provider.enterGuest();
    expect(h.provider.getSnapshot().state).toBe('guest');
    expect(h.provider.getSnapshot().user?.displayName).toBe('游客');
    expect(h.provider.currentToken()).toBeNull();
    expect(h.guard.stats().guestWindow).toBe(true);
  });

  it('冷启动优先恢复游客档案，不探测能力', async () => {
    const storage = new MemoryGuestStorage();
    const first = buildHarness(storage);
    await first.provider.bootstrap();
    await first.provider.enterGuest();

    const capability = { available: jest.fn().mockResolvedValue(false) };
    const api = makeApi();
    const second = new AuthProvider({
      api,
      vault: new MemoryVault(),
      provider: makeStrategy(),
      clientVersion: '1.0.0',
      capability,
      guestStore: new GuestStore({ storage }),
      networkGuard: new GuestNetworkGuard()
    });
    await second.bootstrap();
    expect(second.getSnapshot().state).toBe('guest');
    expect(capability.available).not.toHaveBeenCalled();
  });

  it('凭证优先于游客档案', async () => {
    const storage = new MemoryGuestStorage();
    const guestStore = new GuestStore({ storage });
    await guestStore.create();

    const api = makeApi();
    api.validate.mockResolvedValue({
      data: { valid: true, user: { userId: 'u1' }, expiresAt: '2030-01-01T00:00:00Z', traceId: 't' },
      traceId: 't'
    });
    const vault = new MemoryVault();
    await vault.set('huawei.sessionToken', 's1_token');
    const provider = new AuthProvider({
      api, vault, provider: makeStrategy(), clientVersion: '1.0.0',
      guestStore: new GuestStore({ storage })
    });
    await provider.bootstrap();
    expect(provider.getSnapshot().state).toBe('authenticated');
  });

  it('退出游客仅清理本地，不调用 logout', async () => {
    const h = buildHarness();
    await h.provider.bootstrap();
    await h.provider.enterGuest();
    await h.provider.exitGuest();
    expect(h.provider.getSnapshot().state).toBe('anonymous');
    expect(h.storage.snapshot()).toBeNull();
    expect(h.api.logout).not.toHaveBeenCalled();
    expect(h.guard.stats().guestWindow).toBe(false);
  });

  it('升级成功：写凭证 → 清档案 → authenticated', async () => {
    const h = buildHarness();
    await h.provider.bootstrap();
    await h.provider.enterGuest();
    h.strategy.requestAuthCode.mockResolvedValue({ kind: 'code', code: 'auth-code' });
    h.api.login.mockResolvedValue({
      data: { sessionToken: 's1_new', expiresAt: '2030-01-01T00:00:00Z', user: { userId: 'u1' }, firstLogin: false, traceId: 't' },
      traceId: 't'
    });
    await h.provider.login();
    expect(h.provider.getSnapshot().state).toBe('authenticated');
    expect(h.storage.snapshot()).toBeNull();
    expect(h.guard.stats().guestWindow).toBe(false);
    expect(await h.vault.get('huawei.sessionToken')).toBe('s1_new');
  });

  it('升级取消回到 guest 并保留档案', async () => {
    const h = buildHarness();
    await h.provider.bootstrap();
    await h.provider.enterGuest();
    const before = h.storage.snapshot();
    h.strategy.requestAuthCode.mockResolvedValue({ kind: 'cancelled' });
    await h.provider.login();
    expect(h.provider.getSnapshot().state).toBe('guest');
    expect(h.storage.snapshot()).toBe(before);
    expect(h.guard.stats().guestWindow).toBe(true);
  });

  it('升级时清理失败：吊销新会话并回 guest', async () => {
    const h = buildHarness();
    await h.provider.bootstrap();
    await h.provider.enterGuest();
    h.storage.failRemove = true;
    h.strategy.requestAuthCode.mockResolvedValue({ kind: 'code', code: 'auth-code' });
    h.api.login.mockResolvedValue({
      data: { sessionToken: 's1_new', expiresAt: '2030-01-01T00:00:00Z', user: { userId: 'u1' }, firstLogin: false, traceId: 't' },
      traceId: 't'
    });
    h.api.logout.mockResolvedValue({ data: { success: true, traceId: 't' }, traceId: 't' });
    await h.provider.login();
    expect(h.provider.getSnapshot().state).toBe('guest');
    expect(h.api.logout).toHaveBeenCalledWith('s1_new');
    expect(await h.vault.get('huawei.sessionToken')).toBeNull();
    expect(h.provider.getSnapshot().lastError?.message).toContain('切换失败');
  });

  it('存储不可用时禁止进入游客', async () => {
    const storage = new MemoryGuestStorage();
    storage.failWrite = true;
    const h = buildHarness(storage);
    await h.provider.bootstrap();
    await h.provider.enterGuest();
    expect(h.provider.getSnapshot().state).toBe('anonymous');
    expect(h.provider.getSnapshot().lastError?.message).toContain('存储不可用');
  });

  it('游客窗口内 ApiClient 阻断出网并计数', async () => {
    const guard = new GuestNetworkGuard();
    const fetchMock = jest.fn();
    const client = new ApiClient({ baseUrl: 'https://api.test', fetchImpl: fetchMock as unknown as typeof fetch, guard });
    guard.enterGuestMode();
    await expect(client.request('/v1/health')).rejects.toBeInstanceOf(ProtocolError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(guard.stats()).toEqual({ guestWindow: true, attempts: 1, outbound: 0 });

    guard.leaveGuestMode();
    (fetchMock as jest.Mock).mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: true })
    });
    await client.request('/v1/health');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});