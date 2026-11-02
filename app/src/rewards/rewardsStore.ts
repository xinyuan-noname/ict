import { ApiError } from '../api/client';
import type { CheckInStatus, FrameCatalog, LedgerPage, RewardsApi } from '../api/rewardsApi';
import { rewardMessage } from '../../../contracts/generated/ts/reward-catalog';

export interface RewardsSnapshot {
  loading: boolean;
  checkingIn: boolean;
  redeemingFrameId: string | null;
  status: CheckInStatus | null;
  catalog: FrameCatalog | null;
  ledger: LedgerPage | null;
  errorCode?: string;
  errorMessage?: string;
  notice?: string;
}

export interface RewardsStoreDeps {
  api: RewardsApi;
  getToken: () => string | null;
  now?: () => number;
}

// 客户端幂等键：长度 ≥8，符合 [A-Za-z0-9_-]。
let idemSeq = 0;
export function newIdempotencyKey(now: number): string {
  idemSeq += 1;
  return `idem${now.toString(36)}${idemSeq.toString(36)}`;
}

export class RewardsStore {
  private snapshot: RewardsSnapshot = {
    loading: false,
    checkingIn: false,
    redeemingFrameId: null,
    status: null,
    catalog: null,
    ledger: null
  };
  private readonly listeners = new Set<(s: RewardsSnapshot) => void>();
  private inFlightCheckIn: Promise<void> | null = null;

  constructor(private readonly deps: RewardsStoreDeps) {}

  getSnapshot(): RewardsSnapshot {
    return this.snapshot;
  }

  subscribe(fn: (s: RewardsSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(next: Partial<RewardsSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const fn of this.listeners) {
      fn(this.snapshot);
    }
  }

  reset(): void {
    this.inFlightCheckIn = null;
    this.set({
      loading: false, checkingIn: false, redeemingFrameId: null,
      status: null, catalog: null, ledger: null, errorCode: undefined, errorMessage: undefined, notice: undefined
    });
  }

  async load(): Promise<void> {
    const token = this.deps.getToken();
    if (!token) {
      this.reset();
      return;
    }
    this.set({ loading: true, errorCode: undefined, errorMessage: undefined });
    try {
      const [status, catalog] = await Promise.all([
        this.deps.api.status(token),
        this.deps.api.frames(token)
      ]);
      this.set({ loading: false, status: status.data, catalog: catalog.data });
    } catch (err) {
      this.applyError(err);
      this.set({ loading: false });
    }
  }

  // 并发/连点只发一次请求（spec 7.3 语义 3）。
  checkIn(): Promise<void> {
    if (this.inFlightCheckIn) {
      return this.inFlightCheckIn;
    }
    const token = this.deps.getToken();
    if (!token) {
      this.set({ errorMessage: '登录状态已失效，请重新登录' });
      return Promise.resolve();
    }
    this.inFlightCheckIn = (async () => {
      this.set({ checkingIn: true, errorCode: undefined, errorMessage: undefined });
      try {
        const result = await this.deps.api.checkIn(token);
        const status = this.snapshot.status;
        this.set({
          checkingIn: false,
          notice: result.data.alreadyCheckedIn
            ? '今日已签到'
            : `签到成功，获得 ${result.data.earnedPoints} 积分`,
          status: status
            ? {
                ...status,
                checkedIn: true,
                canCheckIn: false,
                streakDays: result.data.streakDays,
                pointsBalance: result.data.balanceAfter,
                todayReward: 0,
                nextReward: result.data.nextReward
              }
            : status
        });
        await this.load();
      } catch (err) {
        this.applyError(err);
        this.set({ checkingIn: false });
      } finally {
        this.inFlightCheckIn = null;
      }
    })();
    return this.inFlightCheckIn;
  }

  async redeem(frameId: string): Promise<void> {
    const token = this.deps.getToken();
    if (!token || !this.snapshot.catalog) {
      this.set({ errorMessage: '目录尚未加载，请稍后重试' });
      return;
    }
    const frame = this.snapshot.catalog.frames.find((f) => f.frameId === frameId);
    if (!frame || !frame.purchasable) {
      this.set({ errorCode: 'REWARD_003', errorMessage: frame?.owned ? '你已拥有该头像框' : '该头像框暂不可兑换' });
      return;
    }
    this.set({ redeemingFrameId: frameId, errorCode: undefined, errorMessage: undefined });
    try {
      const now = (this.deps.now ?? Date.now)();
      const result = await this.deps.api.redeem(
        token, frameId, this.snapshot.catalog.catalogVersion, newIdempotencyKey(now)
      );
      this.set({
        redeemingFrameId: null,
        notice: result.data.replayed ? '兑换已生效' : `兑换成功，消耗 ${result.data.price} 积分`
      });
      await this.load();
    } catch (err) {
      this.applyError(err);
      this.set({ redeemingFrameId: null });
    }
  }

  async equip(frameId: string | null): Promise<void> {
    const token = this.deps.getToken();
    if (!token) {
      this.set({ errorMessage: '登录状态已失效，请重新登录' });
      return;
    }
    try {
      await this.deps.api.equip(token, frameId);
      await this.load();
    } catch (err) {
      this.applyError(err);
    }
  }

  async loadLedger(): Promise<void> {
    const token = this.deps.getToken();
    if (!token) {
      return;
    }
    try {
      const page = await this.deps.api.ledger(token);
      this.set({ ledger: page.data });
    } catch (err) {
      this.applyError(err);
    }
  }

  private applyError(err: unknown): void {
    if (err instanceof ApiError) {
      this.set({
        errorCode: err.code,
        errorMessage: rewardMessage(err.code)
      });
      return;
    }
    this.set({ errorCode: undefined, errorMessage: '网络异常，请稍后重试' });
  }
}