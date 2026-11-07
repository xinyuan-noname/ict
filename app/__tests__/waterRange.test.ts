import {
  buildWaterSeries,
  rangeWeekStarts,
  summarizeWaterSeries,
  type DayTotal
} from '../src/model/waterRange';
import {
  BUILTIN_WATER_UNITS,
  allWaterUnits,
  validateWaterUnit,
  type WaterUnit
} from '../src/model/waterUnits';
import { weekStartOf } from '../src/model/waterGoal';

const TODAY = '2026-11-05'; // 周四

function totalsOf(entries: Record<string, { ml: number; target?: number }>): Map<string, DayTotal> {
  const map = new Map<string, DayTotal>();
  for (const [day, v] of Object.entries(entries)) {
    map.set(day, { totalMl: v.ml, targetMl: v.target ?? 2000 });
  }
  return map;
}

describe('饮水统计区间', () => {
  test('周记固定为本周 7 天（周一起）', () => {
    expect(weekStartOf(TODAY)).toBe('2026-11-02');
    const series = buildWaterSeries('week', totalsOf({ '2026-11-02': { ml: 2000 } }), TODAY, 2000);
    expect(series).toHaveLength(7);
    expect(series[0]).toEqual({ label: '11-02', day: '2026-11-02', value: 2000, achieved: true });
    expect(series[1]).toEqual({ label: '11-03', day: '2026-11-03', value: 0, achieved: false });
  });

  test('月记为近 30 天且以今天结尾', () => {
    const series = buildWaterSeries('month', totalsOf({ '2026-10-07': { ml: 1500 } }), TODAY, 2000);
    expect(series).toHaveLength(30);
    expect(series[0].day).toBe('2026-10-07');
    expect(series[0].value).toBe(1500);
    expect(series[0].achieved).toBe(false);
    expect(series[29].day).toBe(TODAY);
  });

  test('季度记为近 13 周，按有记录日日均聚合', () => {
    const start = weekStartOf(TODAY);
    const series = buildWaterSeries(
      'quarter',
      totalsOf({ '2026-11-02': { ml: 2000 }, '2026-11-03': { ml: 1000 } }),
      TODAY,
      2000
    );
    expect(series).toHaveLength(13);
    const current = series[12];
    expect(current.day).toBe(start);
    expect(current.value).toBe(1500);
    expect(current.achieved).toBe(false);
  });

  test('无目标时不计达成', () => {
    const series = buildWaterSeries('week', totalsOf({ '2026-11-02': { ml: 2000, target: 0 } }), TODAY, 0);
    expect(series[0].achieved).toBe(false);
  });

  test('区间平均只统计有记录日，达成率按已过天数', () => {
    const series = buildWaterSeries(
      'week',
      totalsOf({ '2026-11-02': { ml: 2000 }, '2026-11-03': { ml: 1000 } }),
      TODAY,
      2000
    );
    const stats = summarizeWaterSeries(series, TODAY);
    expect(stats.averageMl).toBe(1500);
    expect(stats.recordedDays).toBe(2);
    expect(stats.achievedDays).toBe(1);
    expect(stats.elapsedDays).toBe(4);
    expect(stats.achievementRate).toBeCloseTo(0.25);
  });

  test('月记/季度记需要的周起点可预先算出', () => {
    expect(rangeWeekStarts('week', TODAY)).toEqual(['2026-11-02']);
    const month = rangeWeekStarts('month', TODAY);
    expect(month[0]).toBe('2026-10-05');
    expect(month[month.length - 1]).toBe('2026-11-02');
    const quarter = rangeWeekStarts('quarter', TODAY);
    expect(quarter).toHaveLength(13);
    expect(quarter[12]).toBe('2026-11-02');
  });
});

describe('饮水单位', () => {
  const customs: WaterUnit[] = [{ id: 'unit_1', name: '马克杯', ml: 400, builtin: false }];

  test('内置单位与自定义单位合并', () => {
    expect(allWaterUnits(customs).map((u) => u.name)).toEqual(['毫升', '杯', '农夫山泉', '马克杯']);
    expect(BUILTIN_WATER_UNITS[1].ml).toBe(250);
  });

  test('名称与容量校验', () => {
    expect(validateWaterUnit('', 400, allWaterUnits(customs))).not.toBeNull();
    expect(validateWaterUnit('一二三四五六七八九十十一十二', 400, allWaterUnits(customs))).not.toBeNull();
    expect(validateWaterUnit('保温杯', 49, allWaterUnits(customs))).not.toBeNull();
    expect(validateWaterUnit('保温杯', 2001, allWaterUnits(customs))).not.toBeNull();
    expect(validateWaterUnit('保温杯', 300.5, allWaterUnits(customs))).not.toBeNull();
    expect(validateWaterUnit('马克杯', 400, allWaterUnits(customs))).toBe('该单位名称已存在');
    expect(validateWaterUnit('保温杯', 400, allWaterUnits(customs))).toBeNull();
  });
});