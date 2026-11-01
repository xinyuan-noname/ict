import type { Platform } from '../../api/authApi';

export type AuthCodeResult =
  | { kind: 'code'; code: string; redirectUri?: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; reason: string };

export interface AuthProviderStrategy {
  readonly platform: Platform;
  requestAuthCode(): Promise<AuthCodeResult>;
}

// 能力探测：不可用时禁用登录，禁止降级为其他登录方式（任务 35.5）。
export interface CapabilityProbe {
  available(): Promise<boolean>;
}