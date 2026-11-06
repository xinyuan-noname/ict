import type { Platform } from '../../api/authApi';
import type { AuthCodeResult, AuthProviderStrategy } from './types';

// Web 端不接入 Account Kit / 回环授权：默认禁用华为登录，引导使用游客模式。
export class WebUnsupportedProvider implements AuthProviderStrategy {
  readonly platform = 'web' as unknown as Platform;

  async requestAuthCode(): Promise<AuthCodeResult> {
    return { kind: 'error', reason: 'web huawei sign-in disabled' };
  }
}