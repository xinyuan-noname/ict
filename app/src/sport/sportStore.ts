import type { AchievementStateView, AddRecordRequest, SportApi } from '../api/sportApi';

export type BalanceSource = 'server' | 'cache' | 'local';

export interface SportSnapshot {
  loading: boolean;
  achievements: AchievementStateView[];
  pointsBalance: number | null;
  balanceSource: BalanceSource;
  offline: boolean;
  notice?: string;
  errorMessage?: string;
  isGuest: boolean;
  unlockedCount: number;
}

type Listener = (snapshot: SportSnapshot) => void;

const initial: SportSnapshot = {
  loading: false,
  achievements: [],
  pointsBalance: null,
  balanceSource: 'local',
  offline: false,
  isGuest: true,
  unlockedCount: 0
};

// SportStore：登录后以服务端成就快照为权威；游客/断网保留缓存并显式标注来源。
export class SportStore {
  private snapshot: SportSnapshot = initial;
  private readonly listeners = new Set<Listener>();
  private cache: AchievementStateView[] = [];
  private cachedBalance: number | null = null;

  constructor(
    private readonly deps: {
      api: SportApi;
      getToken: () => string | null;
    }
  ) {}

  getSnapshot(): SportSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private set(next: Partial<SportSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  reset(): void {
    this.cache = [];
    this.cachedBalance = null;
    this.set({ ...initial });
  }

  // 游客/演示态：使用本地判定结果，不产生任何网络请求。
  applyLocal(achievements: AchievementStateView[]): void {
    this.set({
      achievements,
      unlockedCount: achievements.filter((a) => a.status !== 'locked').length,
      pointsBalance: null,
      balanceSource: 'local',
      isGuest: true,
      offline: false,
      errorMessage: undefined,
      notice: '游客模式，本地判定'
    });
  }

  async loadRemote(): Promise<void> {
    const token = this.deps.getToken();
    if (!token) {
      this.set({ isGuest: true, balanceSource: 'local' });
      return;
    }
    this.set({ loading: true, errorMessage: undefined });
    try {
      const { data } = await this.deps.api.achievements(token);
      this.cache = data.achievements;
      this.cachedBalance = data.pointsBalance;
      this.set({
        loading: false,
        achievements: data.achievements,
        unlockedCount: data.unlockedCount,
        pointsBalance: data.pointsBalance,
        balanceSource: 'server',
        isGuest: false,
        offline: false,
        errorMessage: undefined,
        notice: undefined
      });
    } catch {
      this.set({
        loading: false,
        achievements: this.cache,
        unlockedCount: this.cache.filter((a) => a.status !== 'locked').length,
        pointsBalance: this.cachedBalance,
        balanceSource: this.cachedBalance === null ? 'local' : 'cache',
        isGuest: false,
        offline: true,
        errorMessage: '离线：成就与积分为缓存值'
      });
    }
  }

  // 新增记录：幂等键由 recordId 派生，重复提交不会重复入账。
  async addRecord(record: AddRecordRequest): Promise<{ unlocked: AchievementStateView[]; earnedPoints: number }> {
    const token = this.deps.getToken();
    if (!token) {
      return { unlocked: [], earnedPoints: 0 };
    }
    const { data } = await this.deps.api.addRecord(token, record, `sport_${record.recordId}`);
    this.cachedBalance = data.pointsBalance;
    if (data.unlocked.length > 0) {
      this.cache = mergeAchievements(this.cache, data.unlocked);
    }
    this.set({
      achievements: mergeAchievements(this.snapshot.achievements, data.unlocked),
      unlockedCount: this.snapshot.unlockedCount + data.unlocked.length,
      pointsBalance: data.pointsBalance,
      balanceSource: 'server',
      offline: false,
      notice:
        data.unlocked.length === 0
          ? undefined
          : `新解锁 ${data.unlocked.length} 个成就，+${data.earnedPoints} 分${data.balanceCapped ? '（已达积分上限）' : ''}`
    });
    return { unlocked: data.unlocked, earnedPoints: data.earnedPoints };
  }

  async removeRecord(recordId: string): Promise<number | null> {
    const token = this.deps.getToken();
    if (!token) {
      return null;
    }
    const { data } = await this.deps.api.deleteRecord(token, recordId);
    this.cache = data.achievements;
    this.cachedBalance = data.pointsBalance;
    this.set({
      achievements: data.achievements,
      unlockedCount: data.achievements.filter((a) => a.status !== 'locked').length,
      pointsBalance: data.pointsBalance,
      balanceSource: 'server',
      offline: false
    });
    return data.pointsBalance;
  }
}

function mergeAchievements(current: AchievementStateView[], updates: AchievementStateView[]): AchievementStateView[] {
  if (updates.length === 0) {
    return current;
  }
  const byId = new Map(updates.map((a) => [a.achievementId, a]));
  const seen = new Set<string>();
  const merged = current.map((item) => {
    const update = byId.get(item.achievementId);
    if (!update) {
      return item;
    }
    seen.add(item.achievementId);
    return update;
  });
  for (const update of updates) {
    if (!seen.has(update.achievementId)) {
      merged.push(update);
    }
  }
  return merged;
}