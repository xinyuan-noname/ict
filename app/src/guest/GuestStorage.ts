import AsyncStorage from '@react-native-async-storage/async-storage';
import { GUEST_PROFILE_KEY } from './types';

// GuestStorage Port：业务层只依赖该接口，便于测试与替换。
export interface GuestStorage {
  read(): Promise<string | null>;
  write(raw: string): Promise<void>;
  remove(): Promise<void>;
}

export class StorageUnavailableError extends Error {
  constructor(message = 'guest storage unavailable') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export class AsyncStorageGuestStorage implements GuestStorage {
  async read(): Promise<string | null> {
    return AsyncStorage.getItem(GUEST_PROFILE_KEY);
  }

  async write(raw: string): Promise<void> {
    await AsyncStorage.setItem(GUEST_PROFILE_KEY, raw);
  }

  async remove(): Promise<void> {
    await AsyncStorage.removeItem(GUEST_PROFILE_KEY);
  }
}

// 仅测试使用；支持注入失败以覆盖降级路径。
export class MemoryGuestStorage implements GuestStorage {
  private value: string | null = null;
  failRead = false;
  failWrite = false;
  failRemove = false;

  async read(): Promise<string | null> {
    if (this.failRead) throw new StorageUnavailableError('read failed');
    return this.value;
  }

  async write(raw: string): Promise<void> {
    if (this.failWrite) throw new StorageUnavailableError('write failed');
    this.value = raw;
  }

  async remove(): Promise<void> {
    if (this.failRemove) throw new StorageUnavailableError('remove failed');
    this.value = null;
  }

  snapshot(): string | null {
    return this.value;
  }
}