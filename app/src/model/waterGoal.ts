// 与 Go water-goal-v1 同构的定点整数实现（1e-6 kg / 1e-6 ml）。
export const WATER_GOAL_VERSION = 'water-goal-v1';
export const DEFAULT_CUP_ML = 250;
export const WATER_MIN_ADULT = 1200;
export const WATER_MAX_ADULT = 3500;
export const WATER_MIN_TEEN = 1000;
export const WATER_MAX_TEEN = 3000;

export type Gender = 'male' | 'female' | 'other';

export interface HealthProfile {
  heightCm: number;
  weightG: number;
  age: number;
  gender: Gender;
}

export function assertProfile(p: HealthProfile): void {
  if (!(p.heightCm >= 100 && p.heightCm <= 250)) throw new Error('height out of range');
  if (!(p.weightG >= 20000 && p.weightG <= 300000)) throw new Error('weight out of range');
  if (!(p.age >= 14 && p.age <= 120)) throw new Error('age out of range');
  if (p.gender !== 'male' && p.gender !== 'female' && p.gender !== 'other') throw new Error('gender invalid');
}

export function waterGoalMl(p: HealthProfile): number {
  assertProfile(p);
  const h = p.heightCm;
  const sbwUKg = 22 * h * h * 100;
  const weightUKg = p.weightG * 1000;
  const effUKg = Math.floor((7 * weightUKg + 3 * sbwUKg) / 10);
  let mlMicro = effUKg * 32;

  let agePermille = 1000;
  if (p.age >= 80) agePermille = 900;
  else if (p.age >= 65) agePermille = 920;
  else if (p.age >= 50) agePermille = 950;
  else if (p.age >= 30) agePermille = 980;

  let genderPermille = 1000;
  if (p.gender === 'female') genderPermille = 950;
  else if (p.gender === 'other') genderPermille = 975;

  mlMicro = Math.floor((mlMicro * agePermille) / 1000);
  mlMicro = Math.floor((mlMicro * genderPermille) / 1000);

  let ml = Math.floor((mlMicro + 500000) / 1000000);
  ml = Math.round(ml / 50) * 50;

  const low = p.age < 18 ? WATER_MIN_TEEN : WATER_MIN_ADULT;
  const high = p.age < 18 ? WATER_MAX_TEEN : WATER_MAX_ADULT;
  return Math.min(high, Math.max(low, ml));
}

export interface DaySummary {
  day: string;
  totalMl: number;
  targetMl: number;
  achieved: boolean;
}

export interface WeekStats {
  averageMl: number | null;
  totalMl: number;
  achievedDays: number;
  elapsedDays: number;
  achievementRate: number;
  targetMl: number;
}

// 周平均 = 有记录日均值；达成率按已过天数；空周 averageMl 为 null。
export function buildWeekStats(days: DaySummary[], today: string): WeekStats {
  let total = 0;
  let recorded = 0;
  let achieved = 0;
  let elapsed = 0;
  let target = 0;
  for (const d of days) {
    total += d.totalMl;
    if (d.totalMl > 0) recorded += 1;
    if (d.achieved) achieved += 1;
    if (d.day <= today) elapsed += 1;
    if (d.targetMl > 0) target = d.targetMl;
  }
  return {
    averageMl: recorded > 0 ? Math.round(total / recorded) : null,
    totalMl: total,
    achievedDays: achieved,
    elapsedDays: elapsed,
    achievementRate: elapsed > 0 ? achieved / elapsed : 0,
    targetMl: target
  };
}

export function weekStartOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (weekday - 1));
  return date.toISOString().slice(0, 10);
}

export function weekDays(weekStart: string): string[] {
  const [y, m, d] = weekStart.split('-').map(Number);
  const base = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

export function formatML(ml: number | null): string {
  if (ml === null || ml === undefined) return '—';
  return ml >= 1000 ? `${(ml / 1000).toFixed(2).replace(/\.?0+$/, '')} L` : `${ml} ml`;
}

// 出生日期 → 年龄（按业务日 +08:00 计算）；无效返回 null。
export function ageFromBirthDate(birthDate: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const b = new Date(`${birthDate}T00:00:00Z`);
  const t = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(b.getTime()) || Number.isNaN(t.getTime())) return null;
  let age = t.getUTCFullYear() - b.getUTCFullYear();
  const monthDiff = t.getUTCMonth() - b.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && t.getUTCDate() < b.getUTCDate())) age -= 1;
  return age >= 0 ? age : null;
}

export function businessToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}