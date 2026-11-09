// 英语清单：成就定义与判定（与预览页口径一致）
export interface EnglishAchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  rule: 'daily' | 'streak' | 'single' | 'total';
  need: number;
  points: number;
}

export const ENGLISH_ACHIEVEMENTS: EnglishAchievementDef[] = [
  { id: 'en_daily', name: '今日达标', desc: '单日完成每日目标', icon: '🔓', rule: 'daily', need: 1, points: 20 },
  { id: 'en_streak3', name: '连学 3 天', desc: '连续 3 天完成目标', icon: '🏅', rule: 'streak', need: 3, points: 30 },
  { id: 'en_streak7', name: '连学 7 天', desc: '连续 7 天完成目标', icon: '🏅', rule: 'streak', need: 7, points: 60 },
  { id: 'en_50', name: '单日 50 词', desc: '某天背词 ≥ 50', icon: '🔓', rule: 'single', need: 50, points: 40 },
  { id: 'en_100', name: '累计 100 词', desc: '累计背词 ≥ 100', icon: '🏅', rule: 'total', need: 100, points: 50 },
  { id: 'en_500', name: '累计 500 词', desc: '累计背词 ≥ 500', icon: '🏅', rule: 'total', need: 500, points: 80 },
  { id: 'en_1000', name: '累计 1000 词', desc: '累计背词 ≥ 1000', icon: '👑', rule: 'total', need: 1000, points: 120 },
  { id: 'en_5000', name: '累计 5000 词', desc: '累计背词 ≥ 5000', icon: '👑', rule: 'total', need: 5000, points: 100 }
];

export const ENGLISH_TOTAL_POINTS = ENGLISH_ACHIEVEMENTS.reduce((sum, a) => sum + a.points, 0);

export interface EnglishData {
  target: number;
  wordsByDay: Record<string, number>;
  baselineWords?: number;
}

export interface EnglishState {
  unlocked: boolean;
  progress: number;
  need: number;
}

export function englishTotal(data: EnglishData): number {
  return (data.baselineWords ?? 0) + Object.values(data.wordsByDay).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

export function englishStreak(data: EnglishData, today: string, addDays: (day: string, n: number) => string): number {
  let streak = 0;
  let day = today;
  for (let i = 0; i < 365; i++) {
    if ((data.wordsByDay[day] ?? 0) >= data.target) streak += 1;
    else break;
    day = addDays(day, -1);
  }
  return streak;
}

export function englishAchievementState(
  def: EnglishAchievementDef,
  data: EnglishData,
  today: string,
  addDays: (day: string, n: number) => string
): EnglishState {
  const todayWords = data.wordsByDay[today] ?? 0;
  const total = englishTotal(data);
  const streak = englishStreak(data, today, addDays);
  switch (def.rule) {
    case 'daily':
      return { unlocked: todayWords >= data.target, progress: todayWords >= data.target ? 1 : 0, need: 1 };
    case 'streak':
      return { unlocked: streak >= def.need, progress: streak, need: def.need };
    case 'single': {
      const best = Math.max(0, ...Object.values(data.wordsByDay).map((v) => Number(v) || 0));
      return { unlocked: best >= def.need, progress: best, need: def.need };
    }
    default:
      return { unlocked: total >= def.need, progress: total, need: def.need };
  }
}