// 与 Go domain/pet.go 同构的客户端纯函数。
export const PET_MAX_LEVEL = 50;
export const PET_MAX_ATTR = 50;
export const PET_MAX_POINTS = 200;

export type Species = 'cat' | 'dog' | 'parrot';

export interface Pet {
  petId: string;
  species: Species;
  name: string;
  level: number;
  exp: number;
  satiety: number;
  mood: number;
  intimacy: number;
  points: number;
  str: number;
  agi: number;
  wis: number;
}

export function clamp(v: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, v));
}

export function feed(p: Pet, satietyDelta: number, expDelta: number): boolean {
  p.satiety = clamp(p.satiety + satietyDelta, 0, 100);
  p.exp += expDelta;
  let leveled = false;
  while (p.exp >= 100 && p.level < PET_MAX_LEVEL) {
    p.exp -= 100;
    p.level += 1;
    leveled = true;
  }
  if (p.level >= PET_MAX_LEVEL) p.exp = clamp(p.exp, 0, 99);
  p.intimacy = clamp(p.intimacy + 1, 0, 100);
  return leveled;
}

export function play(p: Pet, moodDelta: number, intimacyDelta: number): void {
  p.mood = clamp(p.mood + moodDelta, 0, 100);
  p.intimacy = clamp(p.intimacy + intimacyDelta, 0, 100);
}

export function applyDecay(p: Pet, lastDecayDay: string, today: string): { changed: boolean; lastDecayDay: string } {
  if (!lastDecayDay) return { changed: true, lastDecayDay: today };
  const start = Date.parse(`${lastDecayDay}T00:00:00Z`);
  const end = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return { changed: false, lastDecayDay };
  }
  const days = Math.round((end - start) / 86400000);
  p.satiety = clamp(p.satiety - days * 10, 0, 100);
  return { changed: true, lastDecayDay: today };
}

export function allocate(p: Pet, attr: 'str' | 'agi' | 'wis'): 'ok' | 'no_points' | 'cap' {
  if (p.points <= 0) return 'no_points';
  if (p[attr] >= PET_MAX_ATTR) return 'cap';
  p[attr] += 1;
  p.points -= 1;
  return 'ok';
}

export function pkScore(rate: number, intimacy: number): number {
  const r = clamp(rate, 0, 1);
  const rel = clamp(intimacy, 0, 100) / 100;
  return Math.round((r * 60 + rel * 40) * 100) / 100;
}

export function settlePk(scoreA: number, scoreB: number, rateA: number, rateB: number): 'a' | 'b' | 'draw' {
  if (Math.abs(scoreA - scoreB) > 1e-9) return scoreA > scoreB ? 'a' : 'b';
  if (Math.abs(rateA - rateB) > 1e-9) return rateA > rateB ? 'a' : 'b';
  return 'draw';
}

export const ITEM_CATALOG = [
  { itemId: 'item_fish', name: '小鱼干', kind: 'food', price: 30, effects: { satiety: 20, exp: 10 } },
  { itemId: 'item_carrot', name: '胡萝卜', kind: 'food', price: 20, effects: { satiety: 15, exp: 5 } },
  { itemId: 'item_nut', name: '坚果', kind: 'food', price: 25, effects: { satiety: 15, exp: 8 } },
  { itemId: 'item_points', name: '加点工具', kind: 'tool', price: 120, effects: { points: 1 } },
  { itemId: 'item_ball', name: '毛线球', kind: 'toy', price: 40, effects: { mood: 20, intimacy: 3 } },
  { itemId: 'item_whistle', name: '训练哨', kind: 'toy', price: 80, effects: { mood: 10, intimacy: 8 } }
] as const;

export function validInviteCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}