import { allocate, applyDecay, feed, ITEM_CATALOG, pkScore, play, settlePk, validInviteCode, type Pet } from '../src/model/pet';

function basePet(): Pet {
  return {
    petId: 'pet_1', species: 'cat', name: '咪咪', level: 1, exp: 0,
    satiety: 60, mood: 60, intimacy: 10, points: 0, str: 0, agi: 0, wis: 0
  };
}

describe('pet model', () => {
  it('喂养触发升级并保持上限', () => {
    const p = basePet();
    for (let i = 0; i < 10; i++) feed(p, 20, 10);
    expect(p.level).toBeGreaterThanOrEqual(2);
    expect(p.satiety).toBeLessThanOrEqual(100);
  });

  it('惰性衰减按天数扣减并夹取', () => {
    const p = basePet();
    const r = applyDecay(p, '2026-10-30', '2026-11-02');
    expect(r.changed).toBe(true);
    expect(p.satiety).toBe(30);
    expect(r.lastDecayDay).toBe('2026-11-02');
    expect(applyDecay(p, '2026-11-02', '2026-11-02').changed).toBe(false);

    p.satiety = 5;
    applyDecay(p, '2026-10-20', '2026-11-02');
    expect(p.satiety).toBe(0);
  });

  it('加点边界', () => {
    const p = basePet();
    expect(allocate(p, 'str')).toBe('no_points');
    p.points = 2;
    expect(allocate(p, 'str')).toBe('ok');
    expect(p.str).toBe(1);
    p.str = 50;
    p.points = 1;
    expect(allocate(p, 'str')).toBe('cap');
  });

  it('玩耍提升心情与亲密度', () => {
    const p = basePet();
    play(p, 20, 3);
    expect(p.mood).toBe(80);
    expect(p.intimacy).toBe(13);
  });

  it('PK 计分与胜负', () => {
    expect(pkScore(1, 100)).toBe(100);
    expect(pkScore(0, 0)).toBe(0);
    expect(pkScore(0.5, 50)).toBe(50);
    expect(pkScore(2, 200)).toBe(100);
    expect(settlePk(80, 70, 1, 0.9)).toBe('a');
    expect(settlePk(70, 80, 0.9, 1)).toBe('b');
    expect(settlePk(80, 80, 0.9, 0.95)).toBe('b');
    expect(settlePk(80, 80, 0.9, 0.9)).toBe('draw');
  });

  it('道具目录与邀请码', () => {
    expect(ITEM_CATALOG).toHaveLength(6);
    expect(ITEM_CATALOG.filter((i) => i.kind === 'food')).toHaveLength(3);
    expect(validInviteCode('A1B2C3')).toBe(true);
    expect(validInviteCode('abc123')).toBe(false);
    expect(validInviteCode('ABC-12')).toBe(false);
  });
});