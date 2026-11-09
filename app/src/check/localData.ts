// 服药 / 运动 / 英语 的本地数据层（游客与 Web 共用；登录用户后续接云端）
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENGLISH_ITEM_DEFAULTS, ENGLISH_ITEM_TARGETS, type EnglishSkill } from '../model/englishChecklist';

export type EnglishTargetPeriod = 'day' | 'week' | 'month';
import { businessToday } from '../model/waterGoal';

export const LOCAL_KEYS = {
  medication: 'local.medication.v1',
  sport: 'local.sport.v1',
  english: 'local.english.v1'
} as const;

export interface MedItem {
  id: string;
  name: string;
  dosage: string;
  slots: string[];
  status: 'active' | 'stopped';
}

export interface MedDose {
  id: string;
  itemId: string;
  day: string;
  slot: string;
  late: boolean;
}

export interface SportRecord {
  id: string;
  type: 'walking' | 'cycling' | 'running';
  day: string;
  distanceM: number;
  durationS: number;
  steps: number;
  continuous: boolean;
}

export interface EnglishData {
  target: number;
  wordsByDay: Record<string, number>;
  /** 历史累计词汇（从百词斩迁移，不计入今日和近 7 天） */
  baselineWords?: number;
  /** 每条清单的独立进度；target 在清单定义中维护 */
  itemProgress?: Record<string, number>;
  /** 每条清单的目标值，允许用户按自己的计划调整 */
  itemTargets?: Record<string, number>;
  /** 听说读写各技能的每日记录 */
  dailyBySkill?: Partial<Record<EnglishSkill, Record<string, number>>>;
  /** 听说读写各技能的每日目标 */
  targetsBySkill?: Partial<Record<EnglishSkill, number>>;
  /** 阅读目标周期 */
  targetPeriod?: EnglishTargetPeriod;
  /** 听说读写各技能的目标周期 */
  periodsBySkill?: Partial<Record<EnglishSkill, EnglishTargetPeriod>>;
}

export const MED_SLOTS: [string, string][] = [
  ['morning', '早上'],
  ['noon', '中午'],
  ['evening', '傍晚'],
  ['night', '睡前']
];

export const DEFAULT_ENGLISH: EnglishData = {
  target: 20,
  wordsByDay: {},
  baselineWords: 3000,
  itemProgress: { ...ENGLISH_ITEM_DEFAULTS },
  itemTargets: { ...ENGLISH_ITEM_TARGETS },
  targetPeriod: 'day',
  targetsBySkill: { listening: 1, speaking: 1, writing: 1 },
  periodsBySkill: { listening: 'day', speaking: 'day', writing: 'day' }
};

/** 内置演示数据：仅首次进入时写入，可整体清除 */
export function demoSportRecords(): SportRecord[] {
  const walkDays = ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-06', '2026-09-20', '2026-09-26', '2026-10-08', '2026-10-12'];
  const records: SportRecord[] = walkDays.map((day, i) => ({
    id: `demo_w${i}`, type: 'walking', day, distanceM: 0, durationS: 0, steps: 15000, continuous: false
  }));
  records.push({ id: 'demo_r1', type: 'running', day: '2026-08-30', distanceM: 1000, durationS: 330, steps: 0, continuous: true });
  records.push({ id: 'demo_r2', type: 'running', day: '2026-10-08', distanceM: 3000, durationS: 1050, steps: 0, continuous: true });
  records.push({ id: 'demo_r3', type: 'running', day: '2026-10-14', distanceM: 4930, durationS: 1650, steps: 0, continuous: true });
  records.push({ id: 'demo_r4', type: 'running', day: '2026-10-14', distanceM: 8550, durationS: 2900, steps: 0, continuous: true });
  records.push({ id: 'demo_r5', type: 'running', day: '2026-10-25', distanceM: 10000, durationS: 2660, steps: 0, continuous: true });
  records.push({ id: 'demo_c1', type: 'cycling', day: '2026-09-02', distanceM: 5200, durationS: 1200, steps: 0, continuous: false });
  records.push({ id: 'demo_c2', type: 'cycling', day: '2026-09-20', distanceM: 10090, durationS: 3503, steps: 0, continuous: false });
  return records;
}

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

async function writeJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function loadMedication(): Promise<{ items: MedItem[]; doses: MedDose[] }> {
  const fallback = { items: [] as MedItem[], doses: [] as MedDose[] };
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEYS.medication);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { items?: MedItem[]; doses?: MedDose[] };
    return { items: parsed.items ?? [], doses: parsed.doses ?? [] };
  } catch {
    return fallback;
  }
}

export function saveMedication(items: MedItem[], doses: MedDose[]): Promise<void> {
  return writeJSON(LOCAL_KEYS.medication, { items, doses });
}

export async function loadSport(): Promise<SportRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEYS.sport);
    if (raw) return JSON.parse(raw) as SportRecord[];
  } catch {
    /* ignore */
  }
  // 无用户记录时返回空数组：演示数据不得自动写入首屏（NAV-23）。
  return [];
}

export function saveSport(records: SportRecord[]): Promise<void> {
  return writeJSON(LOCAL_KEYS.sport, records);
}

export function loadEnglish(): Promise<EnglishData> {
  return readJSON<EnglishData>(LOCAL_KEYS.english, DEFAULT_ENGLISH);
}

export function saveEnglish(data: EnglishData): Promise<void> {
  return writeJSON(LOCAL_KEYS.english, data);
}

// ---- 派生：服药当日状态 ----
export interface DoseView {
  itemId: string;
  name: string;
  dosage: string;
  slot: string;
  status: 'pending' | 'taken' | 'late' | 'missed';
  doseId?: string;
}

export function medViews(items: MedItem[], doses: MedDose[], day: string, nowHour: number): DoseView[] {
  const slotIndex = (slot: string): number => MED_SLOTS.findIndex(([k]) => k === slot);
  const nowSlot = nowHour < 11 ? 0 : nowHour < 15 ? 1 : nowHour < 20 ? 2 : 3;
  const today = businessToday();
  const out: DoseView[] = [];
  for (const item of items) {
    if (item.status !== 'active') continue;
    for (const slot of item.slots) {
      const dose = doses.find((d) => d.itemId === item.id && d.day === day && d.slot === slot);
      let status: DoseView['status'] = 'pending';
      let doseId: string | undefined;
      if (dose) {
        status = dose.late ? 'late' : 'taken';
        doseId = dose.id;
      } else if (day < today || (day === today && slotIndex(slot) < nowSlot)) {
        status = 'missed';
      }
      out.push({ itemId: item.id, name: item.name, dosage: item.dosage, slot, status, doseId });
    }
  }
  return out;
}

export function medTodayDone(items: MedItem[], doses: MedDose[], nowHour: number): boolean {
  const views = medViews(items, doses, businessToday(), nowHour);
  return views.length > 0 && views.every((v) => v.status === 'taken' || v.status === 'late');
}

export function medStreak(items: MedItem[], doses: MedDose[], addDays: (day: string, n: number) => string): number {
  let streak = 0;
  let day = businessToday();
  for (let i = 0; i < 60; i++) {
    const views = medViews(items, doses, day, 23);
    if (views.length > 0 && views.every((v) => v.status === 'taken' || v.status === 'late')) streak += 1;
    else break;
    day = addDays(day, -1);
  }
  return streak;
}