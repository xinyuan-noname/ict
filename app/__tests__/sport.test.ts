import {
  ACHIEVEMENTS,
  formatPace,
  paceSecPerKm,
  totalAchievementPoints,
  evaluate,
  effectivePaceThreshold,
  paceLimitSec,
  paceScale,
  type AthleteProfile,
  type SportRecord
} from '../src/model/sport';

const A: AthleteProfile = { gender: 'male', age: 30, weightG: 70000, heightCM: 175 };
const B: AthleteProfile = { gender: 'female', age: 45, weightG: 60000, heightCM: 165 };
const C: AthleteProfile = { gender: 'male', age: 20, weightG: 85000, heightCM: 178 };

describe('sport achievements', () => {
  it('33 个成就、5 组、总分 1560', () => {
    expect(ACHIEVEMENTS).toHaveLength(33);
    expect(totalAchievementPoints()).toBe(1560);
    const groups = new Map<string, number>();
    for (const a of ACHIEVEMENTS) groups.set(a.group, (groups.get(a.group) ?? 0) + 1);
    expect(groups.get('walking')).toBe(9);
    expect(groups.get('cycling')).toBe(4);
    expect(groups.get('pace')).toBe(7);
    expect(groups.get('distance')).toBe(7);
    expect(groups.get('combo')).toBe(6);
  });

  it('配速极限：女性基准更慢、同龄同体重年轻人更快、缩放钳制', () => {
    expect(paceLimitSec(B)).toBeGreaterThan(paceLimitSec(A));
    const young = { ...A, age: 20 };
    expect(paceLimitSec(young)).toBeLessThan(paceLimitSec(A));
    for (const p of [A, B, C]) {
      const s = paceScale(p);
      expect(s).toBeGreaterThanOrEqual(0.92);
      expect(s).toBeLessThanOrEqual(1.12);
    }
  });

  it('个性化阈值取整到 5 秒', () => {
    for (let std = 210; std <= 300; std += 10) {
      expect(effectivePaceThreshold(std, A) % 5).toBe(0);
    }
  });

  it('配速与连击判定', () => {
    const records: SportRecord[] = [
      { recordId: 'r1', type: 'running', day: '2026-10-25', distanceM: 10000, durationS: 2660, continuous: true }
    ];
    const byId = new Map(ACHIEVEMENTS.map((d) => [d.id, d]));
    expect(evaluate(records, byId.get('pace_440')!, A).unlocked).toBe(true);
    expect(evaluate(records, byId.get('pace_420')!, A).unlocked).toBe(false);
    expect(evaluate(records, byId.get('run_cont_10k')!, A).unlocked).toBe(true);
    expect(evaluate(records, byId.get('combo_5k_430')!, A).unlocked).toBe(true);
  });

  it('步行累计天数去重、骑行次数、累计里程', () => {
    const records: SportRecord[] = [
      { recordId: 'w1', type: 'walking', day: '2026-08-30', distanceM: 0, durationS: 0, steps: 15000 },
      { recordId: 'w2', type: 'walking', day: '2026-09-01', distanceM: 0, durationS: 0, steps: 15000 },
      { recordId: 'w3', type: 'walking', day: '2026-09-01', distanceM: 0, durationS: 0, steps: 15000 },
      { recordId: 'c1', type: 'cycling', day: '2026-09-02', distanceM: 12000, durationS: 2400, steps: 0 },
      { recordId: 'r1', type: 'running', day: '2026-10-14', distanceM: 4930, durationS: 1500, steps: 0 },
      { recordId: 'r2', type: 'running', day: '2026-10-14', distanceM: 8550, durationS: 2600, steps: 0 }
    ];
    const byId = new Map(ACHIEVEMENTS.map((d) => [d.id, d]));
    expect(evaluate(records, byId.get('walk_15k')!, A).days).toHaveLength(2);
    const cum = evaluate(records, byId.get('walk_15k_3d')!, A);
    expect(cum.progress).toBe(2);
    expect(cum.unlocked).toBe(false);
    expect(evaluate(records, byId.get('cycle_10k')!, A).unlocked).toBe(true);
    const total = evaluate(records, byId.get('run_total_10k')!, A);
    expect(total.progress).toBe(13480);
    expect(total.unlocked).toBe(true);
  });

  it('配速格式化', () => {
    expect(formatPace(266)).toBe(`4'26"`);
    expect(formatPace(0)).toBe('—');
    expect(paceSecPerKm({ recordId: 'x', type: 'running', day: '2026-01-01', distanceM: 5000, durationS: 1500, steps: 0 })).toBe(300);
  });
});