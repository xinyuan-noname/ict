import { buildWeekStats, formatML, waterGoalMl, weekDays, weekStartOf, type HealthProfile } from '../src/model/waterGoal';

const base: HealthProfile = { heightCm: 175, weightG: 70000, age: 30, gender: 'male' };

describe('water-goal-v1 (TS 与 Go 同构)', () => {
  it('基准档案落在成人区间且按 50ml 取整', () => {
    const ml = waterGoalMl(base);
    expect(ml).toBeGreaterThanOrEqual(1200);
    expect(ml).toBeLessThanOrEqual(3500);
    expect(ml % 50).toBe(0);
  });

  it('体重越大目标越高', () => {
    expect(waterGoalMl({ ...base, weightG: 95000 })).toBeGreaterThan(waterGoalMl({ ...base, weightG: 55000 }));
  });

  it('女性与年长系数不更高', () => {
    expect(waterGoalMl({ ...base, gender: 'female' })).toBeLessThanOrEqual(waterGoalMl(base));
    expect(waterGoalMl({ ...base, age: 75 })).toBeLessThanOrEqual(waterGoalMl(base));
  });

  it('青少年区间与极端值限幅', () => {
    const teen = waterGoalMl({ heightCm: 150, weightG: 40000, age: 15, gender: 'male' });
    expect(teen).toBeGreaterThanOrEqual(1000);
    expect(teen).toBeLessThanOrEqual(3000);
    expect(waterGoalMl({ heightCm: 250, weightG: 300000, age: 14, gender: 'male' })).toBeLessThanOrEqual(3000);
    expect(waterGoalMl({ heightCm: 100, weightG: 20000, age: 30, gender: 'male' })).toBeGreaterThanOrEqual(1200);
  });

  it('非法输入抛错', () => {
    expect(() => waterGoalMl({ ...base, heightCm: 90 })).toThrow();
    expect(() => waterGoalMl({ ...base, weightG: 5000 })).toThrow();
    expect(() => waterGoalMl({ ...base, age: 10 })).toThrow();
  });
});

describe('周统计', () => {
  it('周平均按有记录日计算', () => {
    const stats = buildWeekStats([
      { day: '2026-11-02', totalMl: 2000, targetMl: 2000, achieved: true },
      { day: '2026-11-03', totalMl: 1000, targetMl: 2000, achieved: false },
      { day: '2026-11-04', totalMl: 0, targetMl: 2000, achieved: false }
    ], '2026-11-04');
    expect(stats.averageMl).toBe(1500);
    expect(stats.achievedDays).toBe(1);
    expect(stats.elapsedDays).toBe(3);
    expect(stats.achievementRate).toBeCloseTo(1 / 3, 5);
  });

  it('空周平均为 null 而不是 0', () => {
    expect(buildWeekStats([{ day: '2026-11-02', totalMl: 0, targetMl: 2000, achieved: false }], '2026-11-02').averageMl).toBeNull();
  });

  it('周一与格式化', () => {
    expect(weekStartOf('2026-11-04')).toBe('2026-11-02');
    expect(weekStartOf('2026-11-02')).toBe('2026-11-02');
    expect(weekDays('2026-11-02')).toHaveLength(7);
    expect(formatML(null)).toBe('—');
    expect(formatML(500)).toBe('500 ml');
    expect(formatML(1500)).toBe('1.5 L');
  });
});