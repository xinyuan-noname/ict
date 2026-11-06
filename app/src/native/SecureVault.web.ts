// Web 平台的安全存储实现（覆盖 SecureVault.ts）
// 契约：会话凭证只存内存 + sessionStorage（禁止 localStorage），关闭标签页即失效。
import { Platform } from 'react-native';

export interface SecureVault {
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

export const SESSION_KEY = 'huawei.sessionToken';
export const EXPIRES_KEY = 'huawei.expiresAt';
export const USER_KEY = 'huawei.user';

const memory = new Map<string, string>();

function sessionStorageRef(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    /* 隐私模式等场景不可用 */
  }
  return null;
}

export class KeychainVault implements SecureVault {
  async get(key: string): Promise<string | null> {
    const cached = memory.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const storage = sessionStorageRef();
    if (!storage) {
      return null;
    }
    try {
      const value = storage.getItem(key);
      if (value !== null) {
        memory.set(key, value);
      }
      return value;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    const storage = sessionStorageRef();
    if (!storage) {
      throw new VaultWriteError(`browser storage unavailable on ${Platform.OS}`);
    }
    try {
      storage.setItem(key, value);
      memory.set(key, value);
    } catch {
      throw new VaultWriteError('browser sessionStorage write failed');
    }
  }

  async clear(key: string): Promise<void> {
    memory.delete(key);
    const storage = sessionStorageRef();
    if (!storage) {
      return;
    }
    try {
      storage.removeItem(key);
    } catch {
      /* 清理失败不阻塞退出 */
    }
  }
}

// 仅测试使用
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