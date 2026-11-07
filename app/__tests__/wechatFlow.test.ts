import type { AuthApi } from '../src/api/authApi';
import type { WeChatAuthApi } from '../src/api/wechatAuthApi';
import { ApiError } from '../src/api/client';
import { AuthProvider } from '../src/auth/AuthProvider';
import type { AuthProviderStrategy } from '../src/auth/providers/types';
import { GuestNetworkGuard } from '../src/guest/GuestNetworkGuard';
import { GuestStore } from '../src/guest/GuestStore';
import { MemoryGuestStorage } from '../src/guest/GuestStorage';
import { createGuestProfile, serializeGuestProfile } from '../src/guest/guestProfile';
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

function makeWeChatApi(): jest.Mocked<WeChatAuthApi> {
  return {
    authorize: jest.fn(),
    callback: jest.fn(),
    availability: jest.fn()
  } as unknown as jest.Mocked<WeChatAuthApi>;
}

function makeStrategy(): jest.Mocked<AuthProviderStrategy> {
  return { platform: 'android', requestAuthCode: jest.fn() } as unknown as jest.Mocked<AuthProviderStrategy>;
}

function build(wechatApi: jest.Mocked<WeChatAuthApi>, storage: MemoryGuestStorage) {
  const vault = new MemoryVault();
  const provider = new AuthProvider({
    api: makeApi(),
    vault,
    provider: makeStrategy(),
    clientVersion: '1.0.0',
    guestStore: new GuestStore({ storage }),
    networkGuard: new GuestNetworkGuard(),
    resumeGuestOnBoot: false,
    wechatApi
  });
  return { provider, vault };
}

describe('微信两段式登录', () => {
  test('连续点击只发起一次 authorize', async () => {
    const wechatApi = makeWeChatApi();
    let resolveAuthorize: (v: unknown) => void = () => undefined;
    wechatApi.authorize.mockReturnValue(
      new Promise((resolve) => {
        resolveAuthorize = resolve as (v: unknown) => void;
      }) as never
    );
    const { provider } = build(wechatApi, new MemoryGuestStorage());
    await provider.bootstrap();

    const first = provider.beginWeChatLogin();
    const second = provider.beginWeChatLogin();
    const third = provider.beginWeChatLogin();
    expect(wechatApi.authorize).toHaveBeenCalledTimes(1);

    resolveAuthorize({
      data: { authorizeUrl: 'https://open.weixin.qq.com/x', callbackPath: '/', expiresAt: '', traceId: 't' },
      traceId: 't'
    });
    await Promise.all([first, second, third]);
  });

  test('回调成功后进入已登录态并写入会话', async () => {
    const wechatApi = makeWeChatApi();
    wechatApi.callback.mockResolvedValue({
      data: {
        sessionToken: 'wx_token',
        expiresAt: '2026-11-08T00:00:00Z',
        user: { userId: 'u_wx', displayName: '微信用户' },
        firstLogin: true,
        platform: 'wechat',
        traceId: 't'
      },
      traceId: 't'
    });
    const { provider, vault } = build(wechatApi, new MemoryGuestStorage());
    await provider.bootstrap();

    await provider.completeWeChatLogin({ code: 'c1', state: 's1' });

    expect(provider.getSnapshot().state).toBe('authenticated');
    expect(provider.getSnapshot().user?.userId).toBe('u_wx');
    expect(await vault.get(SESSION_KEY)).toBe('wx_token');
  });

  test('取消后回退游客且档案标识不变', async () => {
    const wechatApi = makeWeChatApi();
    wechatApi.callback.mockResolvedValue({ data: { cancelled: true, traceId: 't' }, traceId: 't' });
    const storage = new MemoryGuestStorage();
    const profile = createGuestProfile('2026-01-01T00:00:00Z', 1);
    await storage.write(serializeGuestProfile(profile));

    const { provider } = build(wechatApi, storage);
    await provider.enterGuest();
    expect(provider.getSnapshot().user?.userId).toBe(profile.guestId);

    // 模拟游客升级：先进入发起态，再处理取消回跳。
    await provider.beginWeChatLogin().catch(() => undefined);
    await provider.completeWeChatLogin({ code: 'c1', state: 's1' });

    expect(provider.getSnapshot().state).toBe('guest');
    expect(provider.getSnapshot().user?.userId).toBe(profile.guestId);
  });

  test('失败提示使用渠道中立文案且不进入已登录态', async () => {
    const wechatApi = makeWeChatApi();
    wechatApi.callback.mockRejectedValue(new ApiError(503, 'AUTH_003', 't'));
    const { provider } = build(wechatApi, new MemoryGuestStorage());
    await provider.bootstrap();

    await provider.completeWeChatLogin({ code: 'c1', state: 's1' });

    expect(provider.getSnapshot().state).toBe('anonymous');
    const message = provider.getSnapshot().lastError?.message ?? '';
    expect(message).toContain('微信服务暂时不可用');
    expect(message).not.toContain('华为');
  });
});