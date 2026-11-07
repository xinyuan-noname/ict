// 饮水统计区间：周记（本周 7 天）/ 月记（近 30 天）/ 季度记（近 13 周）
import { weekStartOf } from './waterGoal';

export type WaterRange = 'week' | 'month' | 'quarter';

export const WATER_RANGES: [WaterRange, string][] = [
  ['week', '周记'],
  ['month', '月记'],
  ['quarter', '季度记']
];

export const WATER_RANGE_LABEL: Record<WaterRange, string> = {
  week: '周记',
  month: '月记',
  quarter: '季度记'
};

export interface WaterPoint {
  label: string;
  day: string;
  value: number;
  achieved: boolean;
}

export interface DayTotal {
  totalMl: number;
  targetMl: number;
}

export interface WaterRangeStats {
  averageMl: number | null;
  achievementRate: number;
  recordedDays: number;
  achievedDays: number;
  elapsedDays: number;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

// 月记需要拉取的周起点（含当前周），远端按周取数时使用
export function rangeWeekStarts(range: WaterRange, today: string): string[] {
  if (range === 'quarter') {
    const currentWeek = weekStartOf(today);
    return Array.from({ length: 13 }, (_, i) => addDays(currentWeek, -(12 - i) * 7));
  }
  if (range === 'month') {
    const starts: string[] = [];
    let day = addDays(today, -29);
    while (day <= today) {
      const ws = weekStartOf(day);
      if (starts[starts.length - 1] !== ws) starts.push(ws);
      day = addDays(day, 1);
    }
    return starts;
  }
  return [weekStartOf(today)];
}

function pointOf(day: string, totals: Map<string, DayTotal>, fallbackTarget: number): { value: number; achieved: boolean } {
  const entry = totals.get(day);
  const value = entry?.totalMl ?? 0;
  const target = entry && entry.targetMl > 0 ? entry.targetMl : fallbackTarget;
  return { value, achieved: target > 0 && value >= target };
}

export function buildWaterSeries(
  range: WaterRange,
  totals: Map<string, DayTotal>,
  today: string,
  fallbackTarget: number
): WaterPoint[] {
  if (range === 'month') {
    return Array.from({ length: 30 }, (_, i) => {
      const day = addDays(today, -(29 - i));
      const p = pointOf(day, totals, fallbackTarget);
      return { label: day.slice(5), day, ...p };
    });
  }
  if (range === 'quarter') {
    const currentWeek = weekStartOf(today);
    return Array.from({ length: 13 }, (_, i) => {
      const ws = addDays(currentWeek, -(12 - i) * 7);
      const days = Array.from({ length: 7 }, (_, d) => addDays(ws, d)).filter((d) => d <= today);
      let total = 0;
      let recorded = 0;
      for (const day of days) {
        const value = totals.get(day)?.totalMl ?? 0;
        total += value;
        if (value > 0) recorded += 1;
      }
      const value = recorded > 0 ? Math.round(total / recorded) : 0;
      return { label: ws.slice(5), day: ws, value, achieved: fallbackTarget > 0 && value >= fallbackTarget };
    });
  }
  const start = weekStartOf(today);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start, i);
    const p = pointOf(day, totals, fallbackTarget);
    return { label: day.slice(5), day, ...p };
  });
}

export function summarizeWaterSeries(points: WaterPoint[], today: string): WaterRangeStats {
  let total = 0;
  let recorded = 0;
  let achieved = 0;
  let elapsed = 0;
  for (const p of points) {
    if (p.value > 0) {
      total += p.value;
      recorded += 1;
    }
    if (p.day <= today) {
      elapsed += 1;
      if (p.achieved) achieved += 1;
    }
  }
  return {
    averageMl: recorded > 0 ? Math.round(total / recorded) : null,
    achievementRate: elapsed > 0 ? achieved / elapsed : 0,
    recordedDays: recorded,
    achievedDays: achieved,
    elapsedDays: elapsed
  };
}