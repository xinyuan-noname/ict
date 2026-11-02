import { createGuestProfile, parseGuestProfile, serializeGuestProfile } from './guestProfile';
import type { GuestStorage } from './GuestStorage';
import { StorageUnavailableError } from './GuestStorage';
import type { GuestProfile } from './types';

export interface GuestStoreDeps {
  storage: GuestStorage;
  now?: () => Date;
}

export type GuestLoadResult =
  | { kind: 'none' }
  | { kind: 'profile'; profile: GuestProfile }
  | { kind: 'reset' }
  | { kind: 'unavailable' };

// GuestStore：单飞加载、写后复核、损坏重建、清理复核、epoch 防迟到写入。
export class GuestStore {
  private profile: GuestProfile | null = null;
  private epoch = 0;
  private loadPromise: Promise<GuestLoadResult> | null = null;

  constructor(private readonly deps: GuestStoreDeps) {}

  getProfile(): GuestProfile | null {
    return this.profile;
  }

  load(): Promise<GuestLoadResult> {
    if (this.loadPromise) {
      return this.loadPromise;
    }
    this.loadPromise = this.doLoad();
    return this.loadPromise;
  }

  private async doLoad(): Promise<GuestLoadResult> {
    try {
      const raw = await this.deps.storage.read();
      if (raw === null || raw === undefined) {
        this.profile = null;
        return { kind: 'none' };
      }
      const parsed = parseGuestProfile(raw);
      if (!parsed) {
        // 损坏或迁移失败：删除并重建空状态。
        await this.deps.storage.remove();
        this.profile = null;
        return { kind: 'reset' };
      }
      this.profile = parsed;
      this.epoch = parsed.epoch;
      return { kind: 'profile', profile: parsed };
    } catch (err) {
      this.profile = null;
      return { kind: 'unavailable' };
    } finally {
      this.loadPromise = null;
    }
  }

  // 创建新档案；写入后必须复核，失败则视为不可用。
  async create(): Promise<GuestProfile> {
    const now = (this.deps.now ?? (() => new Date()))();
    this.epoch += 1;
    const profile = createGuestProfile(now.toISOString(), this.epoch);
    const raw = serializeGuestProfile(profile);
    try {
      await this.deps.storage.write(raw);
      const readBack = await this.deps.storage.read();
      if (readBack !== raw) {
        throw new StorageUnavailableError('write verification failed');
      }
    } catch (err) {
      throw err instanceof StorageUnavailableError ? err : new StorageUnavailableError('write failed');
    }
    this.profile = profile;
    return profile;
  }

  // 清理并复核；调用方据此判断是否可安全进入认证态。
  async clear(): Promise<boolean> {
    this.epoch += 1;
    this.profile = null;
    try {
      await this.deps.storage.remove();
      const readBack = await this.deps.storage.read();
      return readBack === null || readBack === undefined;
    } catch {
      return false;
    }
  }

  resetInMemory(): void {
    this.epoch += 1;
    this.profile = null;
  }
}