import { NativeModules, Platform } from 'react-native';

// 统一安全存储抽象：业务层只能通过这三个方法访问凭证（任务 30.1）。
// 写入失败必须视为登录失败，绝不退化为明文文件。
export interface SecureVault {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  clear(key: string): Promise<void>;
}

interface NativeVaultModule {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  clear(key: string): Promise<void>;
}

export class VaultWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultWriteError';
  }
}

function nativeModule(): NativeVaultModule | undefined {
  const mod = (NativeModules as Record<string, unknown>).SecureVaultModule;
  if (mod && typeof mod === 'object') {
    return mod as NativeVaultModule;
  }
  return undefined;
}

export class KeychainVault implements SecureVault {
  async get(key: string): Promise<string | null> {
    const mod = nativeModule();
    if (!mod) {
      throw new VaultWriteError(`SecureVault unavailable on ${Platform.OS}`);
    }
    return mod.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    const mod = nativeModule();
    if (!mod) {
      throw new VaultWriteError(`SecureVault unavailable on ${Platform.OS}`);
    }
    await mod.set(key, value);
  }

  async clear(key: string): Promise<void> {
    const mod = nativeModule();
    if (!mod) {
      return;
    }
    await mod.clear(key);
  }
}

// 仅测试使用；release 构建不得注入。
export class MemoryVault implements SecureVault {
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async clear(key: string): Promise<void> {
    this.map.delete(key);
  }
}

export const SESSION_KEY = 'huawei.sessionToken';
export const EXPIRES_KEY = 'huawei.expiresAt';
export const USER_KEY = 'huawei.user';