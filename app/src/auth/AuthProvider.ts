import { ApiError, NetworkError, ProtocolError } from '../api/client';
import type { AuthApi, Platform, UserBrief } from '../api/authApi';
import type { SecureVault } from '../native/SecureVault';
import { EXPIRES_KEY, SESSION_KEY, USER_KEY, VaultWriteError } from '../native/SecureVault';
import { shouldClearCredential } from '../shared/errorCatalog';
import { logEvent } from '../shared/logger';
import type { AuthProviderStrategy, CapabilityProbe } from './providers/types';

export type AuthState = 'restoring' | 'authenticated' | 'anonymous' | 'unsupported';

export interface AuthProviderDeps {
  api: AuthApi;
  vault: SecureVault;
  provider: AuthProviderStrategy;
  capability?: CapabilityProbe;
  clientVersion: string;
  deviceLabel?: string;
}

export interface AuthSnapshot {
  state: AuthState;
  user: UserBrief | null;
  expiresAt: string | null;
  lastError: { code?: string; message: string; traceId?: string; retryAfter?: number } | null;
}

type Listener = (snapshot: AuthSnapshot) => void;

// 登录态机：restoring / authenticated / anonymous / unsupported（任务 32.1）。
export class AuthProvider {
  private snapshot: AuthSnapshot = { state: 'restoring', user: null, expiresAt: null, lastError: null };
  private readonly listeners = new Set<Listener>();
  private sessionToken: string | null = null;
  private timeoutStreak = 0;

  constructor(private readonly deps: AuthProviderDeps) {}

  getSnapshot(): AuthSnapshot {
    return this.snapshot;
  }

  // 奖励域等只读调用方通过该方法取当前会话凭证，不暴露写能力。
  currentToken(): string | null {
    return this.sessionToken;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private set(next: Partial<AuthSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  // 冷启动：无本地凭证直接 anonymous，不调接口（任务 32.2）。
  async bootstrap(): Promise<void> {
    if (this.deps.capability) {
      const ok = await this.deps.capability.available();
      if (!ok) {
        this.set({ state: 'unsupported', user: null, expiresAt: null });
        return;
      }
    }
    const token = await this.deps.vault.get(SESSION_KEY);
    if (!token) {
      this.set({ state: 'anonymous', user: null, expiresAt: null, lastError: null });
      return;
    }
    this.sessionToken = token;
    await this.restore(token);
  }

  private async restore(token: string): Promise<void> {
    try {
      const { data } = await this.deps.api.validate(token);
      this.timeoutStreak = 0;
      if (data.sessionToken) {
        await this.replaceCredential(data.sessionToken);
      }
      await this.deps.vault.set(EXPIRES_KEY, data.expiresAt);
      await this.deps.vault.set(USER_KEY, JSON.stringify(data.user));
      this.set({ state: 'authenticated', user: data.user, expiresAt: data.expiresAt, lastError: null });
    } catch (err) {
      if (err instanceof ApiError && err.code && shouldClearCredential(err.code)) {
        await this.clearLocal();
        this.set({
          state: 'anonymous',
          user: null,
          expiresAt: null,
          lastError: { code: err.code, message: err.message, traceId: err.traceId }
        });
        return;
      }
      if (err instanceof NetworkError) {
        this.timeoutStreak += 1;
        // 非 4xx 失败保留凭证，连续 3 次超时才提示重新登录（任务 32.3）。
        if (this.timeoutStreak < 3) {
          this.set({
            state: 'anonymous',
            lastError: { message: '网络异常，请重试' }
          });
          return;
        }
        await this.clearLocal();
        this.set({ state: 'anonymous', user: null, expiresAt: null, lastError: { message: '网络异常，请重新登录' } });
        return;
      }
      await this.clearLocal();
      this.set({
        state: 'anonymous',
        user: null,
        expiresAt: null,
        lastError: { message: err instanceof ProtocolError ? '服务响应异常，请重试' : '登录状态校验失败' }
      });
    }
  }

  async login(): Promise<void> {
    const result = await this.deps.provider.requestAuthCode();
    if (result.kind === 'cancelled') {
      // 取消授权是本地事件：不调用服务端、不清既有登录态。
      this.set({ lastError: { code: 'AUTH_002', message: '已取消授权，可重新登录' } });
      return;
    }
    if (result.kind === 'error') {
      this.set({ lastError: { message: '唤起华为账号授权失败，请重试' } });
      logEvent('auth_provider_error', { reason: result.reason });
      return;
    }
    try {
      const { data } = await this.deps.api.login({
        platform: this.deps.provider.platform as Platform,
        authCode: result.code,
        redirectUri: result.redirectUri,
        clientVersion: this.deps.clientVersion,
        deviceLabel: this.deps.deviceLabel
      });
      // 先写新凭证；写入失败按登录失败处理，并尽力吊销（任务 32.6）。
      try {
        await this.deps.vault.set(SESSION_KEY, data.sessionToken);
      } catch (writeErr) {
        logEvent('vault_write_failed', { reason: writeErr instanceof VaultWriteError ? writeErr.message : 'unknown' });
        try {
          await this.deps.api.logout(data.sessionToken);
        } catch {
          /* 吊销失败不影响本地失败结论 */
        }
        this.set({ state: 'anonymous', lastError: { message: '本地安全存储不可用，登录失败' } });
        return;
      }
      await this.deps.vault.set(EXPIRES_KEY, data.expiresAt);
      await this.deps.vault.set(USER_KEY, JSON.stringify(data.user));
      this.sessionToken = data.sessionToken;
      this.timeoutStreak = 0;
      this.set({ state: 'authenticated', user: data.user, expiresAt: data.expiresAt, lastError: null });
    } catch (err) {
      this.set({ state: 'anonymous', lastError: toErrorInfo(err) });
    }
  }

  async logout(): Promise<void> {
    const token = this.sessionToken ?? (await this.deps.vault.get(SESSION_KEY));
    let failed = false;
    if (token) {
      try {
        await this.deps.api.logout(token);
      } catch {
        failed = true;
      }
    }
    // 无论成败都清本地；失败时明确提示，不谎报"已安全退出"（任务 32.7）。
    await this.clearLocal();
    this.set({
      state: 'anonymous',
      user: null,
      expiresAt: null,
      lastError: failed ? { message: '退出未完成，请重试' } : null
    });
  }

  async refreshProfile(): Promise<UserBrief | null> {
    const token = this.sessionToken ?? (await this.deps.vault.get(SESSION_KEY));
    if (!token) {
      return null;
    }
    try {
      const { data } = await this.deps.api.me(token);
      this.set({ user: data.user, expiresAt: data.expiresAt });
      return data.user;
    } catch (err) {
      if (err instanceof ApiError && err.code && shouldClearCredential(err.code)) {
        await this.clearLocal();
        this.set({ state: 'anonymous', user: null, expiresAt: null, lastError: toErrorInfo(err) });
      }
      return null;
    }
  }

  // 原子替换：同一 key 覆盖写入，成功后才更新内存。
  private async replaceCredential(next: string): Promise<void> {
    await this.deps.vault.set(SESSION_KEY, next);
    this.sessionToken = next;
  }

  private async clearLocal(): Promise<void> {
    this.sessionToken = null;
    await this.deps.vault.clear(SESSION_KEY);
    await this.deps.vault.clear(EXPIRES_KEY);
    await this.deps.vault.clear(USER_KEY);
  }
}

function toErrorInfo(err: unknown): NonNullable<AuthSnapshot['lastError']> {
  if (err instanceof ApiError) {
    return { code: err.code, message: err.message, traceId: err.traceId, retryAfter: err.retryAfter };
  }
  if (err instanceof NetworkError) {
    return { message: '网络异常，请重试' };
  }
  return { message: '操作失败，请稍后重试' };
}