import { GuestStore } from '../src/guest/GuestStore';
import { MemoryGuestStorage, StorageUnavailableError } from '../src/guest/GuestStorage';
import { parseGuestProfile } from '../src/guest/guestProfile';

describe('GuestStore', () => {
  it('无档案时返回 none', async () => {
    const store = new GuestStore({ storage: new MemoryGuestStorage() });
    expect((await store.load()).kind).toBe('none');
  });

  it('创建后写后复核并落盘', async () => {
    const storage = new MemoryGuestStorage();
    const store = new GuestStore({ storage });
    const profile = await store.create();
    expect(store.getProfile()?.guestId).toBe(profile.guestId);
    expect(parseGuestProfile(storage.snapshot() ?? '')).toEqual(profile);
  });

  it('写入失败抛 StorageUnavailableError', async () => {
    const storage = new MemoryGuestStorage();
    storage.failWrite = true;
    const store = new GuestStore({ storage });
    await expect(store.create()).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(store.getProfile()).toBeNull();
  });

  it('损坏数据删除并返回 reset', async () => {
    const storage = new MemoryGuestStorage();
    await storage.write('{broken');
    const store = new GuestStore({ storage });
    expect((await store.load()).kind).toBe('reset');
    expect(storage.snapshot()).toBeNull();
  });

  it('清理并复核成功返回 true，失败返回 false', async () => {
    const storage = new MemoryGuestStorage();
    const store = new GuestStore({ storage });
    await store.create();
    expect(await store.clear()).toBe(true);
    expect(storage.snapshot()).toBeNull();

    const failing = new MemoryGuestStorage();
    failing.failRemove = true;
    const store2 = new GuestStore({ storage: failing });
    await store2.create();
    expect(await store2.clear()).toBe(false);
  });

  it('存储不可用时返回 unavailable', async () => {
    const storage = new MemoryGuestStorage();
    storage.failRead = true;
    const store = new GuestStore({ storage });
    expect((await store.load()).kind).toBe('unavailable');
  });

  it('并发 load 单飞只读一次', async () => {
    const storage = new MemoryGuestStorage();
    const spy = jest.spyOn(storage, 'read');
    const store = new GuestStore({ storage });
    await Promise.all([store.load(), store.load(), store.load()]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('重启后仍能恢复同一档案', async () => {
    const storage = new MemoryGuestStorage();
    const first = new GuestStore({ storage });
    const profile = await first.create();
    const second = new GuestStore({ storage });
    const result = await second.load();
    expect(result.kind).toBe('profile');
    if (result.kind === 'profile') {
      expect(result.profile.guestId).toBe(profile.guestId);
    }
  });
});