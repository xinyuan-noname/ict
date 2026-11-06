// 与 Go domain/sport.go 同构的客户端纯函数。
export type SportType = 'walking' | 'cycling' | 'running';
export type Gender = 'male' | 'female' | 'other';

export interface SportRecord {
  recordId: string;
  type: SportType;
  day: string;
  distanceM: number;
  durationS: number;
  steps: number;
  continuous?: boolean;
}

export interface AthleteProfile {
  gender: Gender;
  age: number;
  weightG: number;
  heightCM: number;
}

export interface AchievementDef {
  id: string;
  group: 'walking' | 'cycling' | 'pace' | 'distance' | 'combo';
  name: string;
  desc: string;
  icon: string;
  rule: string;
  threshold: number;
  secondary?: number;
  stdPaceS?: number;
  points: number;
}

export function paceSecPerKm(r: SportRecord): number {
  if (r.distanceM <= 0 || r.durationS <= 0) return 0;
  return Math.round((r.durationS * 1000) / r.distanceM);
}

function clamp(v: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, v));
}

export function paceLimitSec(p: AthleteProfile): number {
  const p0 = p.gender === 'female' ? 290 : p.gender === 'other' ? 275 : 260;
  let ka = 1;
  if (p.age > 30) ka += 0.005 * (p.age - 30);
  else if (p.age < 30) ka -= 0.0015 * (30 - p.age);
  ka = clamp(ka, 0.93, 1.8);

  let kw = 1;
  if (p.weightG > 0 && p.heightCM > 0) {
    const h = p.heightCM / 100;
    const bmi = p.weightG / 1000 / (h * h);
    kw = clamp(1 + 0.012 * (bmi - 22), 0.94, 1.35);
  }
  return p0 * ka * kw;
}

export function paceScale(p: AthleteProfile): number {
  return clamp(1 + 0.5 * (paceLimitSec(p) / 260 - 1), 0.92, 1.12);
}

export function effectivePaceThreshold(stdSec: number, p: AthleteProfile): number {
  return Math.round((stdSec * paceScale(p)) / 5) * 5;
}


export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'walk_10k', group: 'walking', name: '一万步', desc: '某天步数 ≥ 10000', icon: '🔓', rule: 'single_day_steps', threshold: 10000, points: 10 },
  { id: 'walk_15k', group: 'walking', name: '一万五', desc: '某天步数 ≥ 15000', icon: '🔓', rule: 'single_day_steps', threshold: 15000, points: 15 },
  { id: 'walk_15k_3d', group: 'walking', name: '累计 3 天一万五', desc: '累计 3 天步数 ≥ 15000', icon: '🏅', rule: 'cum_days_steps', threshold: 15000, secondary: 3, points: 20 },
  { id: 'walk_15k_5d', group: 'walking', name: '累计 5 天一万五', desc: '累计 5 天步数 ≥ 15000', icon: '🏅', rule: 'cum_days_steps', threshold: 15000, secondary: 5, points: 25 },
  { id: 'walk_15k_10d', group: 'walking', name: '累计 10 天一万五', desc: '累计 10 天步数 ≥ 15000', icon: '👑', rule: 'cum_days_steps', threshold: 15000, secondary: 10, points: 30 },
  { id: 'walk_15k_15d', group: 'walking', name: '累计 15 天一万五', desc: '累计 15 天步数 ≥ 15000', icon: '👑', rule: 'cum_days_steps', threshold: 15000, secondary: 15, points: 35 },
  { id: 'walk_15k_20d', group: 'walking', name: '累计 20 天一万五', desc: '累计 20 天步数 ≥ 15000', icon: '👑', rule: 'cum_days_steps', threshold: 15000, secondary: 20, points: 40 },
  { id: 'walk_15k_25d', group: 'walking', name: '累计 25 天一万五', desc: '累计 25 天步数 ≥ 15000', icon: '👑', rule: 'cum_days_steps', threshold: 15000, secondary: 25, points: 45 },
  { id: 'walk_15k_30d', group: 'walking', name: '累计 30 天一万五', desc: '累计 30 天步数 ≥ 15000', icon: '👑', rule: 'cum_days_steps', threshold: 15000, secondary: 30, points: 50 },

  { id: 'cycle_5k', group: 'cycling', name: '五公里', desc: '某次骑行 ≥ 5km', icon: '🔓', rule: 'once_distance', threshold: 5000, points: 15 },
  { id: 'cycle_10k', group: 'cycling', name: '十公里', desc: '某次骑行 ≥ 10km', icon: '🔓', rule: 'once_distance', threshold: 10000, points: 20 },
  { id: 'cycle_10k_3', group: 'cycling', name: '骑行者', desc: '累计 3 次骑行 ≥ 10km', icon: '🏅', rule: 'cum_count_distance', threshold: 10000, secondary: 3, points: 30 },
  { id: 'cycle_10k_5', group: 'cycling', name: '铁屁股', desc: '累计 5 次骑行 ≥ 10km', icon: '👑', rule: 'cum_count_distance', threshold: 10000, secondary: 5, points: 40 },

  { id: 'pace_500', group: 'pace', name: '五零零', desc: '配速 ≤ 5:00/km', icon: '🔓', rule: 'pace_threshold', threshold: 300, stdPaceS: 300, points: 20 },
  { id: 'pace_440', group: 'pace', name: '四四零', desc: '配速 ≤ 4:40/km', icon: '🔓', rule: 'pace_threshold', threshold: 280, stdPaceS: 280, points: 25 },
  { id: 'pace_420', group: 'pace', name: '四二零', desc: '配速 ≤ 4:20/km', icon: '🔓', rule: 'pace_threshold', threshold: 260, stdPaceS: 260, points: 30 },
  { id: 'pace_400', group: 'pace', name: '四分台', desc: '配速 ≤ 4:00/km', icon: '🏅', rule: 'pace_threshold', threshold: 240, stdPaceS: 240, points: 40 },
  { id: 'pace_350', group: 'pace', name: '三五零', desc: '配速 ≤ 3:50/km', icon: '🏅', rule: 'pace_threshold', threshold: 230, stdPaceS: 230, points: 50 },
  { id: 'pace_340', group: 'pace', name: '三四零', desc: '配速 ≤ 3:40/km', icon: '👑', rule: 'pace_threshold', threshold: 220, stdPaceS: 220, points: 60 },
  { id: 'pace_330', group: 'pace', name: '三三零', desc: '配速 ≤ 3:30/km', icon: '👑', rule: 'pace_threshold', threshold: 210, stdPaceS: 210, points: 70 },

  { id: 'run_cont_1k', group: 'distance', name: '连续 1km', desc: '连续跑完 1km，中间不停', icon: '🔓', rule: 'continuous_distance', threshold: 1000, points: 15 },
  { id: 'run_cont_3k', group: 'distance', name: '连续 3km', desc: '连续跑完 3km，中间不停', icon: '🔓', rule: 'continuous_distance', threshold: 3000, points: 25 },
  { id: 'run_cont_5k', group: 'distance', name: '连续 5km', desc: '连续跑完 5km，中间不停', icon: '🏅', rule: 'continuous_distance', threshold: 5000, points: 40 },
  { id: 'run_cont_10k', group: 'distance', name: '连续 10km', desc: '连续跑完 10km，中间不停', icon: '👑', rule: 'continuous_distance', threshold: 10000, points: 60 },
  { id: 'run_total_10k', group: 'distance', name: '累计跑步 10km', desc: '累计跑步总里程 ≥ 10km', icon: '🏅', rule: 'cum_distance', threshold: 10000, points: 30 },
  { id: 'run_total_50k', group: 'distance', name: '累计跑步 50km', desc: '累计跑步总里程 ≥ 50km', icon: '🏅', rule: 'cum_distance', threshold: 50000, points: 50 },
  { id: 'run_total_100k', group: 'distance', name: '累计跑步 100km', desc: '累计跑步总里程 ≥ 100km', icon: '👑', rule: 'cum_distance', threshold: 100000, points: 70 },

  { id: 'combo_3k_500', group: 'combo', name: '3km @ 5:00', desc: '连续 3km，平均配速 ≤ 5:00/km', icon: '🔥', rule: 'combo', threshold: 3000, stdPaceS: 300, points: 60 },
  { id: 'combo_3k_430', group: 'combo', name: '3km @ 4:30', desc: '连续 3km，平均配速 ≤ 4:30/km', icon: '🔥', rule: 'combo', threshold: 3000, stdPaceS: 270, points: 90 },
  { id: 'combo_3k_400', group: 'combo', name: '3km @ 4:00', desc: '连续 3km，平均配速 ≤ 4:00/km', icon: '🔥', rule: 'combo', threshold: 3000, stdPaceS: 240, points: 120 },
  { id: 'combo_5k_500', group: 'combo', name: '5km @ 5:00', desc: '连续 5km，平均配速 ≤ 5:00/km', icon: '🔥', rule: 'combo', threshold: 5000, stdPaceS: 300, points: 80 },
  { id: 'combo_5k_430', group: 'combo', name: '5km @ 4:30', desc: '连续 5km，平均配速 ≤ 4:30/km', icon: '🔥', rule: 'combo', threshold: 5000, stdPaceS: 270, points: 110 },
  { id: 'combo_5k_400', group: 'combo', name: '5km @ 4:00', desc: '连续 5km，平均配速 ≤ 4:00/km', icon: '🔥', rule: 'combo', threshold: 5000, stdPaceS: 240, points: 140 }
];

export const GROUP_NAMES: Record<AchievementDef['group'], string> = {
  walking: '步行成就',
  cycling: '骑行成就',
  pace: '跑步 · 配速成就',
  distance: '跑步 · 距离里程碑',
  combo: '速度 + 距离连击'
};

export interface AchievementState {
  defId: string;
  unlocked: boolean;
  days: string[];
  progress: number;
  need: number;
}

export function evaluate(records: SportRecord[], def: AchievementDef, profile: AthleteProfile): AchievementState {
  const state: AchievementState = { defId: def.id, unlocked: false, days: [], progress: 0, need: def.secondary ?? 1 };
  const running = records.filter((r) => r.type === 'running');
  switch (def.rule) {
    case 'single_day_steps': {
      const seen = new Set<string>();
      for (const r of records) {
        if (r.steps >= def.threshold && !seen.has(r.day)) {
          seen.add(r.day);
          state.days.push(r.day);
        }
      }
      state.progress = state.days.length;
      state.unlocked = state.days.length > 0;
      break;
    }
    case 'cum_days_steps': {
      const seen = new Set<string>();
      for (const r of records) {
        if (r.steps >= def.threshold && !seen.has(r.day)) {
          seen.add(r.day);
          state.days.push(r.day);
        }
      }
      state.progress = state.days.length;
      state.unlocked = state.days.length >= (def.secondary ?? 1);
      break;
    }
    case 'once_distance': {
      for (const r of records) if (r.distanceM >= def.threshold) state.days.push(r.day);
      state.progress = state.days.length;
      state.unlocked = state.days.length > 0;
      break;
    }
    case 'cum_count_distance': {
      for (const r of records) if (r.distanceM >= def.threshold) state.days.push(r.day);
      state.progress = state.days.length;
      state.unlocked = state.days.length >= (def.secondary ?? 1);
      break;
    }
    case 'pace_threshold': {
      const limit = effectivePaceThreshold(def.stdPaceS ?? def.threshold, profile);
      for (const r of running) {
        const pace = paceSecPerKm(r);
        if (pace > 0 && pace <= limit) state.days.push(r.day);
      }
      state.progress = state.days.length;
      state.unlocked = state.days.length > 0;
      break;
    }
    case 'continuous_distance': {
      for (const r of running) if (r.distanceM >= def.threshold) state.days.push(r.day);
      state.progress = state.days.length;
      state.unlocked = state.days.length > 0;
      break;
    }
    case 'cum_distance': {
      const total = running.reduce((sum, r) => sum + r.distanceM, 0);
      state.progress = total;
      state.unlocked = total >= def.threshold;
      break;
    }
    case 'combo': {
      const limit = effectivePaceThreshold(def.stdPaceS ?? 0, profile);
      for (const r of running) {
        if (r.distanceM < def.threshold) continue;
        const pace = paceSecPerKm(r);
        if (pace > 0 && pace <= limit) state.days.push(r.day);
      }
      state.progress = state.days.length;
      state.unlocked = state.days.length > 0;
      break;
    }
    default:
      break;
  }
  return state;
}

export function evaluateAll(records: SportRecord[], profile: AthleteProfile): AchievementState[] {
  return ACHIEVEMENTS.map((def) => evaluate(records, def, profile));
}

export function totalAchievementPoints(): number {
  return ACHIEVEMENTS.reduce((sum, d) => sum + d.points, 0);
}

export function formatPace(secPerKm: number): string {
  if (secPerKm <= 0) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}