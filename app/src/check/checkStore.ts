import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CheckApi } from '../api/checkApi';
import {
  DEFAULT_CUP_ML,
  buildWeekStats,
  waterGoalMl,
  weekDays,
  weekStartOf,
  type DaySummary,
  type HealthProfile
} from '../model/waterGoal';
import {
  buildWaterSeries,
  rangeWeekStarts,
  summarizeWaterSeries,
  type DayTotal,
  type WaterPoint,
  type WaterRange,
  type WaterRangeStats
} from '../model/waterRange';
import {
  BUILTIN_WATER_UNITS,
  allWaterUnits,
  loadCustomWaterUnits,
  saveCustomWaterUnits,
  validateWaterUnit,
  type WaterUnit
} from '../model/waterUnits';

export const GUEST_CHECK_KEY = 'guest.check.v1';

export interface WaterRecordView {
  recordId: string;
  ml: number;
  createdAt: string;
  unitName?: string;
  amount?: number;
}

interface GuestRecord {
  recordId: string;
  day: string;
  ml: number;
  createdAt: string;
  unitName?: string;
  amount?: number;
}

interface GuestCheckData {
  schemaVersion: 1;
  profile: HealthProfile | null;
  goals: Record<string, number>;
  records: GuestRecord[];
}

const EMPTY: GuestCheckData = { schemaVersion: 1, profile: null, goals: {}, records: [] };

const EMPTY_RANGE_STATS: WaterRangeStats = {
  averageMl: null,
  achievementRate: 0,
  recordedDays: 0,
  achievedDays: 0,
  elapsedDays: 0
};

function todayOf(now: Date): string {
  const shifted = new Date(now.getTime() + 8 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function tomorrowOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function readLocal(): Promise<GuestCheckData> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_CHECK_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as GuestCheckData;
    if (parsed.schemaVersion !== 1) return { ...EMPTY };
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

async function writeLocal(data: GuestCheckData): Promise<void> {
  await AsyncStorage.setItem(GUEST_CHECK_KEY, JSON.stringify(data));
}

export interface CheckSnapshot {
  loading: boolean;
  day: string;
  targetMl: number;
  totalMl: number;
  cups: number;
  streak: number;
  achieved: boolean;
  profile: HealthProfile | null;
  week: { day: string; totalMl: number; targetMl: number; achieved: boolean }[];
  records: WaterRecordView[];
  averageMl: number | null;
  achievementRate: number;
  units: WaterUnit[];
  range: WaterRange;
  rangeSeries: WaterPoint[];
  rangeStats: WaterRangeStats;
  errorMessage?: string;
  notice?: string;
  isGuest: boolean;
}

export interface CheckStoreDeps {
  api: CheckApi;
  getToken: () => string | null;
  now?: () => Date;
}

let idemSeq = 0;

// CheckStore：登录用户走云端；游客走本地 AsyncStorage（零网络）。
export class CheckStore {
  private snapshot: CheckSnapshot = {
    loading: false, day: '', targetMl: 0, totalMl: 0, cups: 0, streak: 0, achieved: false,
    profile: null, week: [], records: [], averageMl: null, achievementRate: 0,
    units: BUILTIN_WATER_UNITS, range: 'week', rangeSeries: [], rangeStats: EMPTY_RANGE_STATS, isGuest: false
  };
  private readonly listeners = new Set<(s: CheckSnapshot) => void>();
  private data: GuestCheckData = { ...EMPTY };
  private customUnits: WaterUnit[] = [];
  // 远端按周取数缓存：月记/季度记复用，避免重复请求
  private readonly weekCache = new Map<string, DaySummary[]>();

  constructor(private readonly deps: CheckStoreDeps) {}

  getSnapshot(): CheckSnapshot {
    return this.snapshot;
  }

  subscribe(fn: (s: CheckSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(next: Partial<CheckSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const fn of this.listeners) fn(this.snapshot);
  }

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  private today(): string {
    return todayOf(this.now());
  }

  reset(): void {
    this.data = { ...EMPTY };
    this.weekCache.clear();
    this.set({
      loading: false, day: '', targetMl: 0, totalMl: 0, cups: 0, streak: 0, achieved: false,
      profile: null, week: [], records: [], averageMl: null, achievementRate: 0,
      rangeSeries: [], rangeStats: EMPTY_RANGE_STATS, errorMessage: undefined, notice: undefined, isGuest: false
    });
  }

  async load(): Promise<void> {
    const token = this.deps.getToken();
    this.set({ loading: true, errorMessage: undefined, isGuest: !token });
    try {
      this.customUnits = await loadCustomWaterUnits();
      this.set({ units: allWaterUnits(this.customUnits) });
      if (token) {
        await this.loadRemote(token);
      } else {
        await this.loadLocal();
      }
      await this.refreshRange(token);
      this.set({ loading: false });
    } catch (err) {
      this.set({ loading: false, errorMessage: '清单加载失败，请稍后重试' });
    }
  }

  private async loadRemote(token: string): Promise<void> {
    const today = this.today();
    const [profileRes, todayRes, weekRes] = await Promise.all([
      this.deps.api.profile(token).catch(() => null),
      this.deps.api.today(token).catch(() => null),
      this.deps.api.week(token).catch(() => null)
    ]);
    const profile = profileRes?.data.complete
      ? {
          heightCm: profileRes.data.profile.heightCm,
          weightG: profileRes.data.profile.weightG,
          age: profileRes.data.profile.age,
          gender: profileRes.data.profile.gender as HealthProfile['gender']
        }
      : null;
    if (weekRes) {
      this.weekCache.set(weekRes.data.weekStart, weekRes.data.days);
    }
    this.set({
      day: todayRes?.data.day ?? today,
      targetMl: todayRes?.data.targetMl ?? profileRes?.data.targetMl ?? 0,
      totalMl: todayRes?.data.totalMl ?? 0,
      cups: todayRes?.data.cups ?? 0,
      streak: todayRes?.data.streak ?? 0,
      achieved: todayRes?.data.achieved ?? false,
      profile,
      week: weekRes?.data.days ?? [],
      records: (todayRes?.data.records ?? []).map((r) => ({ recordId: r.recordId, ml: r.ml, createdAt: r.createdAt })),
      averageMl: weekRes?.data.averageMl ?? null,
      achievementRate: weekRes?.data.achievementRate ?? 0
    });
  }

  private async loadLocal(): Promise<void> {
    this.data = await readLocal();
    this.refreshLocal();
  }

  private targetForDay(day: string): number {
    return this.data.goals[day] ?? (this.data.profile ? waterGoalMl(this.data.profile) : 0);
  }

  private refreshLocal(): void {
    const today = this.today();
    const target = this.targetForDay(today);
    const records = this.data.records.filter((r) => r.day === today);
    const total = records.reduce((sum, r) => sum + r.ml, 0);
    const start = weekStartOf(today);
    const days: DaySummary[] = weekDays(start).map((day) => {
      const dayTarget = this.targetForDay(day);
      const dayTotal = this.data.records.filter((r) => r.day === day).reduce((s, r) => s + r.ml, 0);
      return { day, totalMl: dayTotal, targetMl: dayTarget, achieved: dayTarget > 0 && dayTotal >= dayTarget };
    });
    const stats = buildWeekStats(days, today);
    this.set({
      day: today, targetMl: target, totalMl: total, cups: Math.floor(total / DEFAULT_CUP_ML),
      achieved: target > 0 && total >= target,
      profile: this.data.profile,
      week: days,
      records: records.map((r) => ({ recordId: r.recordId, ml: r.ml, createdAt: r.createdAt, unitName: r.unitName, amount: r.amount })),
      averageMl: stats.averageMl, achievementRate: stats.achievementRate,
      streak: this.localStreak(today)
    });
  }

  private localStreak(today: string): number {
    let streak = 0;
    let day = today;
    for (let i = 0; i < 365; i++) {
      const target = this.targetForDay(day);
      const total = this.data.records.filter((r) => r.day === day).reduce((s, r) => s + r.ml, 0);
      if (target > 0 && total >= target) streak += 1;
      else break;
      const d = new Date(`${day}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      day = d.toISOString().slice(0, 10);
    }
    return streak;
  }

  // 切换统计区间：周记 / 月记 / 季度记
  async setRange(range: WaterRange): Promise<void> {
    const token = this.deps.getToken();
    this.set({ range });
    try {
      await this.refreshRange(token);
    } catch {
      this.set({ errorMessage: '统计加载失败，请稍后重试' });
    }
  }

  private async refreshRange(token: string | null): Promise<void> {
    const today = this.today();
    const range = this.snapshot.range;
    const totals = new Map<string, DayTotal>();
    if (token) {
      const starts = rangeWeekStarts(range, today);
      await Promise.all(
        starts.filter((ws) => !this.weekCache.has(ws)).map(async (ws) => {
          const res = await this.deps.api.week(token, ws).catch(() => null);
          if (res) this.weekCache.set(ws, res.data.days);
        })
      );
      for (const ws of starts) {
        for (const day of this.weekCache.get(ws) ?? []) {
          totals.set(day.day, { totalMl: day.totalMl, targetMl: day.targetMl });
        }
      }
    } else {
      for (const record of this.data.records) {
        const entry = totals.get(record.day) ?? { totalMl: 0, targetMl: this.targetForDay(record.day) };
        entry.totalMl += record.ml;
        totals.set(record.day, entry);
      }
      if (!totals.has(today)) {
        totals.set(today, { totalMl: 0, targetMl: this.targetForDay(today) });
      }
    }
    const series = buildWaterSeries(range, totals, today, this.snapshot.targetMl);
    this.set({ rangeSeries: series, rangeStats: summarizeWaterSeries(series, today) });
  }

  async saveProfile(profile: HealthProfile): Promise<boolean> {
    const token = this.deps.getToken();
    const today = this.today();
    try {
      if (token) {
        await this.deps.api.putProfile(token, profile);
      } else {
        const goal = waterGoalMl(profile);
        const effective = this.data.profile ? tomorrowOf(today) : today;
        this.data.profile = profile;
        this.data.goals[effective] = goal;
        await writeLocal(this.data);
      }
      this.set({ notice: '身体档案已保存' });
      await this.load();
      return true;
    } catch {
      this.set({ errorMessage: '身体数据超出合理范围，请检查' });
      return false;
    }
  }

  // meta 仅用于本地记录展示（如「1 杯 · 250 ml」），不改记账口径
  async addWater(ml: number, meta?: { unitName?: string; amount?: number }): Promise<void> {
    const token = this.deps.getToken();
    const today = this.today();
    try {
      if (token) {
        idemSeq += 1;
        await this.deps.api.addRecord(token, ml, `idem${Date.now().toString(36)}${idemSeq.toString(36)}`);
      } else {
        this.data.records.push({
          recordId: `wr_${Date.now()}_${idemSeq++}`,
          day: today,
          ml,
          createdAt: this.now().toISOString(),
          unitName: meta?.unitName,
          amount: meta?.amount
        });
        await writeLocal(this.data);
      }
      this.set({ notice: `已记录 ${ml} ml` });
      await this.load();
    } catch {
      this.set({ errorMessage: '记录失败，请重试' });
    }
  }

  // 点击单位按钮 = 记录 1 个该单位
  async logUnit(unitId: string): Promise<void> {
    const unit = this.snapshot.units.find((u) => u.id === unitId);
    if (!unit) return;
    await this.addWater(unit.ml, { unitName: unit.name, amount: 1 });
  }

  async addUnit(name: string, ml: number): Promise<string | null> {
    const existing = allWaterUnits(this.customUnits);
    const error = validateWaterUnit(name, ml, existing);
    if (error) return error;
    const unit: WaterUnit = { id: `unit_${Date.now()}`, name: name.trim(), ml, builtin: false };
    this.customUnits = [...this.customUnits, unit];
    try {
      await saveCustomWaterUnits(this.customUnits);
    } catch {
      return '单位保存失败，请重试';
    }
    this.set({ units: allWaterUnits(this.customUnits), notice: `已添加单位「${unit.name}」` });
    return null;
  }

  async removeRecord(recordId: string): Promise<void> {
    const token = this.deps.getToken();
    try {
      if (token) {
        await this.deps.api.deleteRecord(token, recordId);
      } else {
        this.data.records = this.data.records.filter((r) => r.recordId !== recordId);
        await writeLocal(this.data);
      }
      await this.load();
    } catch {
      this.set({ errorMessage: '删除失败，请重试' });
    }
  }
}