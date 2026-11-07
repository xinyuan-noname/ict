import type { AuthApi } from '../../src/api/authApi';
import { AuthProvider } from '../../src/auth/AuthProvider';
import type { AuthProviderStrategy } from '../../src/auth/providers/types';
import { GuestStore } from '../../src/guest/GuestStore';
import { MemoryGuestStorage } from '../../src/guest/GuestStorage';
import { createGuestProfile, serializeGuestProfile } from '../../src/guest/guestProfile';
import { MemoryVault } from '../../src/native/SecureVault';

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

async function seedProfile(storage: MemoryGuestStorage) {
  const profile = createGuestProfile('2026-01-01T00:00:00Z', 1);
  await storage.write(serializeGuestProfile(profile));
  return profile;
}

function build(api: jest.Mocked<AuthApi>, storage: MemoryGuestStorage, resumeGuestOnBoot: boolean): AuthProvider {
  return new AuthProvider({
    api,
    vault: new MemoryVault(),
    provider: makeStrategy(),
    clientVersion: '1.0.0',
    guestStore: new GuestStore({ storage }),
    resumeGuestOnBoot
  });
}

// FST-01/05：Web（resumeGuestOnBoot=false）即使本地保留游客档案，启动也只到登录页。
test('保留游客档案时启动仍停在登录页', async () => {
  const storage = new MemoryGuestStorage();
  await seedProfile(storage);
  const api = makeApi();
  const provider = build(api, storage, false);

  await provider.bootstrap();

  expect(provider.getSnapshot().state).toBe('anonymous');
  expect(provider.getSnapshot().user).toBeNull();
  expect(api.validate).not.toHaveBeenCalled();
});

// FST-03：点击游客后复用既有档案，不重写本地存储，guestId 保持不变。
test('点击游客复用既有档案且不写盘', async () => {
  const storage = new MemoryGuestStorage();
  const profile = await seedProfile(storage);
  const provider = build(makeApi(), storage, false);

  await provider.bootstrap();
  const writeSpy = jest.spyOn(storage, 'write');
  await provider.enterGuest();

  expect(provider.getSnapshot().state).toBe('guest');
  expect(provider.getSnapshot().user?.userId).toBe(profile.guestId);
  expect(writeSpy).not.toHaveBeenCalled();
});

// FST-03：无档案时才创建；重复进入复用同一标识。
test('无档案时创建一次，重复进入标识不变', async () => {
  const storage = new MemoryGuestStorage();
  const provider = build(makeApi(), storage, false);

  await provider.bootstrap();
  await provider.enterGuest();
  const first = provider.getSnapshot().user?.userId;

  await provider.enterGuest();
  const second = provider.getSnapshot().user?.userId;

  expect(first).toBeTruthy();
  expect(second).toBe(first);
  expect(storage.snapshot()).toContain(String(first));
});