import { NativeModules, Platform } from 'react-native';
import type { AuthProviderStrategy, AuthCodeResult } from './types';

interface HmsAccountModule {
  requestAuthCode(options: { scope: string }): Promise<{
    code?: string;
    cancelled?: boolean;
    error?: string;
  }>;
}

// Android/iOS 走 Account Kit 原生授权；对外签名三端一致（任务 31）。
export class NativeAccountKitProvider implements AuthProviderStrategy {
  readonly platform = Platform.OS === 'ios' ? 'ios' : 'android';

  async requestAuthCode(): Promise<AuthCodeResult> {
    const mod = (NativeModules as Record<string, unknown>).HmsAccountModule as HmsAccountModule | undefined;
    if (!mod) {
      return { kind: 'error', reason: 'AccountKit module unavailable' };
    }
    try {
      const result = await mod.requestAuthCode({ scope: 'openid,profile' });
      if (result.cancelled) {
        return { kind: 'cancelled' };
      }
      if (result.code) {
        return { kind: 'code', code: result.code };
      }
      return { kind: 'error', reason: result.error ?? 'empty auth code' };
    } catch (err) {
      return { kind: 'error', reason: err instanceof Error ? err.message : 'native error' };
    }
  }
}