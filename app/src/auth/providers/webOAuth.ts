import { NativeModules } from 'react-native';
import type { AuthProviderStrategy, AuthCodeResult } from './types';

interface LoopbackOAuthModule {
  startOAuth(options: {
    authorizeUrl: string;
    redirectUri: string;
    timeoutMs: number;
  }): Promise<{ code?: string; cancelled?: boolean; error?: string }>;
}

export interface WebOAuthOptions {
  authorizeUrl: string;
  redirectUri: string;
  timeoutMs?: number;
}

// Windows 端：系统浏览器 + 127.0.0.1 回环回调（任务 35）。
// state 由原生侧生成并只在内存持有，不通过 JS 传递（避免持久化）。
export class WebOAuthProvider implements AuthProviderStrategy {
  readonly platform = 'windows' as const;

  constructor(private readonly options: WebOAuthOptions) {}

  async requestAuthCode(): Promise<AuthCodeResult> {
    const mod = (NativeModules as Record<string, unknown>).LoopbackOAuthModule as LoopbackOAuthModule | undefined;
    if (!mod) {
      return { kind: 'error', reason: 'loopback module unavailable' };
    }
    try {
      const result = await mod.startOAuth({
        authorizeUrl: this.options.authorizeUrl,
        redirectUri: this.options.redirectUri,
        timeoutMs: this.options.timeoutMs ?? 120_000
      });
      if (result.cancelled) {
        return { kind: 'cancelled' };
      }
      if (result.code) {
        return { kind: 'code', code: result.code, redirectUri: this.options.redirectUri };
      }
      return { kind: 'error', reason: result.error ?? 'empty auth code' };
    } catch (err) {
      return { kind: 'error', reason: err instanceof Error ? err.message : 'native error' };
    }
  }
}

// 能力探测：浏览器可用且回环端口可绑定，否则 unsupported。
export class WindowsCapabilityProbe {
  async available(): Promise<boolean> {
    const mod = (NativeModules as Record<string, unknown>).LoopbackOAuthModule as
      | (LoopbackOAuthModule & { canBindLoopback(): Promise<boolean> })
      | undefined;
    if (!mod || typeof mod.canBindLoopback !== 'function') {
      return false;
    }
    try {
      return await mod.canBindLoopback();
    } catch {
      return false;
    }
  }
}