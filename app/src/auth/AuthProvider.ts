import { ApiError, NetworkError, ProtocolError } from '../api/client';
import type { AuthApi, Platform, UserBrief } from '../api/authApi';
import type { GuestNetworkGuard } from '../guest/GuestNetworkGuard';
import type { GuestStore } from '../guest/GuestStore';
import { GUEST_COPY } from '../guest/types';
import type { SecureVault } from '../native/SecureVault';
import { EXPIRES_KEY, SESSION_KEY, USER_KEY, VaultWriteError } from '../native/SecureVault';
import { shouldClearCredential } from '../shared/errorCatalog';
import { WECHAT_CANCELLED_COPY, wechatCopy } from '../shared/wechatCopy';
import { logEvent } from '../shared/logger';
import type { WeChatAuthApi } from '../api/wechatAuthApi';
import { isCancelledResult } from '../api/wechatAuthApi';
import type { AuthProviderStrategy, CapabilityProbe } from './providers/types';

export type AuthState = 'restoring' | 'guest' | 'authenticated' | 'anonymous' | 'unsupported';

export interface AuthProviderDeps {
  api: AuthApi;
  vault: SecureVault;
  provider: AuthProviderStrategy;
  capability?: CapabilityProbe;
  clientVersion: string;
  deviceLabel?: string;
  guestStore?: GuestStore;
  networkGuard?: GuestNetworkGuard;
  /** 冷启动无会话时是否自动恢复游客档案；Web 传 false，其余端省略（默认 true） */
  resumeGuestOnBoot?: boolean;
  /** Web 微信登录 API；三端不传，保证零影响 */
  wechatApi?: WeChatAuthApi;
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
  private weChatBusy = false;
  private weChatOrigin: 'guest' | 'anonymous' | null = null;

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

  // 冷启动严格顺序：凭证只读 → 游客档案 → 能力探测（游客恢复不调接口、不探测）。
  async bootstrap(): Promise<void> {
    const token = await this.deps.vault.get(SESSION_KEY);
    if (token) {
      this.deps.networkGuard?.leaveGuestMode();
      this.sessionToken = token;
      await this.restore(token);
      return;
    }

    if (this.deps.guestStore && this.deps.resumeGuestOnBoot !== false) {
      const result = await this.deps.guestStore.load();
      if (result.kind === 'profile') {
        this.deps.networkGuard?.enterGuestMode();
        this.set({
          state: 'guest',
          user: { userId: result.profile.guestId, displayName: result.profile.displayName },
          expiresAt: null,
          lastError: null
        });
        return;
      }
      if (result.kind === 'reset') {
        this.set({ lastError: { message: GUEST_COPY.dataReset } });
      }
      if (result.kind === 'unavailable') {
        this.set({ lastError: { message: GUEST_COPY.storageUnavailable } });
      }
    }

    if (this.deps.capability) {
      const ok = await this.deps.capability.available();
      if (!ok) {
        this.set({ state: 'unsupported', user: null, expiresAt: null });
        return;
      }
    }
    this.set({ state: 'anonymous', user: null, expiresAt: null });
  }

  // 游客进入：仅本地生成档案，不触发任何网络请求。
  async enterGuest(): Promise<void> {
    if (this.snapshot.state === 'authenticated') {
      this.set({ lastError: { message: '请先退出华为账号' } });
      return;
    }
    if (!this.deps.guestStore) {
      this.set({ state: 'anonymous', lastError: { message: GUEST_COPY.storageUnavailable } });
      return;
    }
    try {
      const loaded = await this.deps.guestStore.load();
      if (loaded.kind === 'unavailable') {
        this.deps.networkGuard?.leaveGuestMode();
        this.set({ state: 'anonymous', user: null, expiresAt: null, lastError: { message: GUEST_COPY.storageUnavailable } });
        return;
      }
      // 复用既有档案，避免刷新后 guestId 变化；仅在无档案或档案损坏重建时才创建。
      const profile = loaded.kind === 'profile' ? loaded.profile : await this.deps.guestStore.create();
      this.deps.networkGuard?.enterGuestMode();
      this.sessionToken = null;
      this.set({
        state: 'guest',
        user: { userId: profile.guestId, displayName: profile.displayName },
        expiresAt: null,
        lastError: null
      });
      logEvent('guest_entered');
    } catch {
      this.deps.networkGuard?.leaveGuestMode();
      this.set({ state: 'anonymous', user: null, expiresAt: null, lastError: { message: GUEST_COPY.storageUnavailable } });
    }
  }

  // 游客退出：仅本地清理，不调用 /v1/auth/logout。
  async exitGuest(): Promise<void> {
    await this.deps.guestStore?.clear();
    this.deps.networkGuard?.leaveGuestMode();
    this.sessionToken = null;
    this.set({ state: 'anonymous', user: null, expiresAt: null, lastError: null });
    logEvent('guest_exited');
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
    const wasGuest = this.snapshot.state === 'guest';
    // 升级流程：先离开游客窗口再发起授权，避免网络闸门误伤。
    if (wasGuest) {
      this.deps.networkGuard?.leaveGuestMode();
    }
    const backToGuest = (message?: string, code?: string): void => {
      if (wasGuest) {
        this.deps.networkGuard?.enterGuestMode();
        this.set({ state: 'guest', lastError: message ? { code, message } : null });
        return;
      }
      this.set({ state: 'anonymous', lastError: message ? { code, message } : null });
    };

    const result = await this.deps.provider.requestAuthCode();
    if (result.kind === 'cancelled') {
      backToGuest('已取消授权，可重新登录', 'AUTH_002');
      return;
    }
    if (result.kind === 'error') {
      const detail = result.reason.length > 160 ? `${result.reason.slice(0, 160)}…` : result.reason;
      backToGuest(`华为账号登录失败：${detail}`);
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
        backToGuest('本地安全存储不可用，登录失败');
        return;
      }
      // 升级：写凭证 → 清游客档案 → 认证态；清理失败必须回退。
      if (wasGuest) {
        const cleared = (await this.deps.guestStore?.clear()) ?? true;
        if (!cleared) {
          try {
            await this.deps.api.logout(data.sessionToken);
          } catch {
            /* 尽力吊销 */
          }
          await this.deps.vault.clear(SESSION_KEY);
          await this.deps.vault.clear(EXPIRES_KEY);
          await this.deps.vault.clear(USER_KEY);
          this.sessionToken = null;
          backToGuest('切换失败，已保留游客模式');
          return;
        }
      }
      await this.deps.vault.set(EXPIRES_KEY, data.expiresAt);
      await this.deps.vault.set(USER_KEY, JSON.stringify(data.user));
      this.sessionToken = data.sessionToken;
      this.timeoutStreak = 0;
      this.deps.networkGuard?.leaveGuestMode();
      this.set({ state: 'authenticated', user: data.user, expiresAt: data.expiresAt, lastError: null });
    } catch (err) {
      backToGuest(toErrorInfo(err).message);
    }
  }

  // 微信第一段：服务端生成 state 后跳转官方授权页；busy 期间拒绝重入。
  async beginWeChatLogin(): Promise<void> {
    if (!this.deps.wechatApi || this.weChatBusy || this.snapshot.state === 'authenticated') {
      return;
    }
    this.weChatBusy = true;
    this.weChatOrigin = this.snapshot.state === 'guest' ? 'guest' : 'anonymous';
    if (this.weChatOrigin === 'guest') {
      this.deps.networkGuard?.leaveGuestMode();
    }
    try {
      const { data } = await this.deps.wechatApi.authorize();
      if (typeof window !== 'undefined' && window.location) {
        window.location.assign(data.authorizeUrl);
      }
    } catch (err) {
      this.weChatBusy = false;
      this.restoreOrigin(toErrorInfo(err).message);
    }
  }

  // 微信第二段：回跳后换取会话；取消/失败按来源回退，游客标识保持不变。
  async completeWeChatLogin(input: {
    code: string;
    state: string;
    cancelled?: boolean;
    clientVersion?: string;
  }): Promise<void> {
    if (!this.deps.wechatApi) {
      return;
    }
    const wasGuest = this.weChatOrigin === 'guest';
    try {
      const { data } = await this.deps.wechatApi.callback(input);
      if (isCancelledResult(data)) {
        this.restoreOrigin(WECHAT_CANCELLED_COPY);
        return;
      }
      await this.persistSession(data, wasGuest);
    } catch (err) {
      const info = toErrorInfo(err);
      this.restoreOrigin(wechatCopy(info.code));
    } finally {
      this.weChatOrigin = null;
      this.weChatBusy = false;
    }
  }

  private restoreOrigin(message?: string): void {
    if (this.weChatOrigin === 'guest') {
      this.deps.networkGuard?.enterGuestMode();
      this.set({ state: 'guest', lastError: message ? { message } : null });
      return;
    }
    this.set({ state: 'anonymous', lastError: message ? { message } : null });
  }

  // 公共落盘：写凭证 → 升级时清游客档案 → 写有效期与用户 → 认证态。
  private async persistSession(
    data: { sessionToken: string; expiresAt: string; user: UserBrief },
    wasGuest: boolean
  ): Promise<boolean> {
    try {
      await this.deps.vault.set(SESSION_KEY, data.sessionToken);
    } catch (writeErr) {
      logEvent('vault_write_failed', {
        reason: writeErr instanceof VaultWriteError ? writeErr.message : 'unknown'
      });
      try {
        await this.deps.api.logout(data.sessionToken);
      } catch {
        /* 吊销失败不影响本地失败结论 */
      }
      this.failBack(wasGuest, '本地安全存储不可用，登录失败');
      return false;
    }
    if (wasGuest) {
      const cleared = (await this.deps.guestStore?.clear()) ?? true;
      if (!cleared) {
        try {
          await this.deps.api.logout(data.sessionToken);
        } catch {
          /* 尽力吊销 */
        }
        await this.deps.vault.clear(SESSION_KEY);
        await this.deps.vault.clear(EXPIRES_KEY);
        await this.deps.vault.clear(USER_KEY);
        this.sessionToken = null;
        this.failBack(true, '切换失败，已保留游客模式');
        return false;
      }
    }
    await this.deps.vault.set(EXPIRES_KEY, data.expiresAt);
    await this.deps.vault.set(USER_KEY, JSON.stringify(data.user));
    this.sessionToken = data.sessionToken;
    this.timeoutStreak = 0;
    this.deps.networkGuard?.leaveGuestMode();
    this.set({ state: 'authenticated', user: data.user, expiresAt: data.expiresAt, lastError: null });
    return true;
  }

  private failBack(wasGuest: boolean, message: string): void {
    if (wasGuest) {
      this.deps.networkGuard?.enterGuestMode();
      this.set({ state: 'guest', lastError: { message } });
      return;
    }
    this.set({ state: 'anonymous', lastError: { message } });
  }

  async logout(): Promise<void> {
    if (this.snapshot.state === 'guest') {
      await this.exitGuest();
      return;
    }
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
  if (err instanceof ProtocolError) {
    return { message: '服务端响应异常，请检查 API 地址或后端服务' };
  }
  if (err instanceof Error && err.message) {
    return { message: `登录失败：${err.message}` };
  }
  return { message: '操作失败，请稍后重试' };
}