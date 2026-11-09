export type EnglishSkill = 'listening' | 'speaking' | 'reading' | 'writing';

export const ENGLISH_SKILLS: readonly { key: EnglishSkill; label: string; icon: string }[] = [
  { key: 'listening', label: '听', icon: '🎧' },
  { key: 'speaking', label: '说', icon: '🗣️' },
  { key: 'reading', label: '读', icon: '📖' },
  { key: 'writing', label: '写', icon: '✍️' }
];

export interface EnglishChecklistItem {
  id: string;
  name: string;
  desc: string;
  icon: string;
  need: number;
  points: number;
  unit?: string;
  initial?: number;
}

export interface EnglishChecklistGroup {
  name: string;
  skill: EnglishSkill;
  unit: string;
  initial: number;
  items: readonly EnglishChecklistItem[];
}

/**
 * 一个成就序列 = 起点 + 终点 + 阶数。
 * 新增成就只描述范围，不再手写每一个阈值。
 */
export interface EnglishAchievementSeries {
  id: string;
  name: string;
  desc: string;
  icon: string;
  start: number;
  end: number;
  steps: number;
  pointsStart?: number;
  pointsEnd?: number;
  unit?: string;
  initial?: number;
}

const STAGE_NAMES = ['入门', '熟练', '进阶', '高手', '大师', '宗师', '传奇', '巅峰'];

/**
 * 对数插值：从 start 到 end 生成 steps 个递增阈值。
 * 首项固定为 start，末项固定为 end；整数展示，避免浮点噪音。
 */
export function logInterpolate(start: number, end: number, steps: number): number[] {
  const safeStart = Math.max(1, Math.round(start));
  const safeEnd = Math.max(safeStart, Math.round(end));
  const count = Math.max(1, Math.round(steps));
  if (count === 1) {
    return [safeEnd];
  }
  const ratio = safeEnd / safeStart;
  const values = Array.from({ length: count }, (_, index) => {
    const raw = safeStart * Math.pow(ratio, index / (count - 1));
    return raw >= 100 ? Math.round(raw / 10) * 10 : Math.round(raw);
  });
  values.splice(0, 1, safeStart);
  values.splice(count - 1, 1, safeEnd);
  for (let index = 1; index < values.length; index += 1) {
    const current = values[index] ?? 0;
    const previous = values[index - 1] ?? 0;
    if (current <= previous) {
      values[index] = previous + 1;
    }
  }
  return values;
}

function seriesItems(
  groupUnit: string,
  groupInitial: number,
  series: EnglishAchievementSeries
): EnglishChecklistItem[] {
  const needs = logInterpolate(series.start, series.end, series.steps);
  const pointsStart = series.pointsStart ?? 20;
  const pointsEnd = series.pointsEnd ?? pointsStart + (series.steps - 1) * 10;
  return needs.map((need, index) => {
    const stage = STAGE_NAMES[index] ?? `${index + 1} 阶`;
    const points =
      series.steps <= 1
        ? pointsStart
        : Math.round(pointsStart + ((pointsEnd - pointsStart) * index) / (series.steps - 1));
    return {
      id: `${series.id}_${index + 1}`,
      name: `${stage} · ${series.name}`,
      desc: series.desc.replace('{need}', String(need)),
      icon: series.icon,
      need,
      points,
      unit: series.unit ?? groupUnit,
      initial: series.initial ?? groupInitial
    };
  });
}

function group(
  name: string,
  skill: EnglishSkill,
  unit: string,
  initial: number,
  series: readonly EnglishAchievementSeries[]
): EnglishChecklistGroup {
  return {
    name,
    skill,
    unit,
    initial,
    items: series.flatMap((item) => seriesItems(unit, initial, item))
  };
}

/**
 * 28 考研 + 六级清单（参考 english_01.md）。
 * 每个分组由若干「起点 -> 终点」序列生成，阶数和对数插值算法统一维护。
 */
export const ENGLISH_CHECKLIST_GROUPS: readonly EnglishChecklistGroup[] = [
  group('百词斩', 'reading', '词', 3000, [
    {
      id: 'words',
      name: '百词斩',
      desc: '学习词汇达到 {need} 词',
      icon: '🔓',
      start: 500,
      end: 6000,
      steps: 8,
      pointsStart: 20,
      pointsEnd: 120
    }
  ]),
  group('阅读', 'reading', '页', 10, [
    {
      id: 'read',
      name: '阅读',
      desc: '阅读累计达到 {need} 页',
      icon: '📖',
      start: 10,
      end: 300,
      steps: 8,
      pointsStart: 20,
      pointsEnd: 80
    }
  ]),
  group('阅读词汇', 'reading', '词', 6156, [
    {
      id: 'read_vocab',
      name: '阅读词汇',
      desc: '阅读词汇量达到 {need} 词',
      icon: '📚',
      start: 6000,
      end: 10000,
      steps: 7,
      pointsStart: 30,
      pointsEnd: 120
    }
  ]),
  group('听力词汇', 'listening', '词', 5246, [
    {
      id: 'listen_vocab',
      name: '听力词汇',
      desc: '听力词汇量达到 {need} 词',
      icon: '🎧',
      start: 4000,
      end: 8000,
      steps: 7,
      pointsStart: 30,
      pointsEnd: 120
    }
  ]),
  group('听力', 'listening', '篇', 0, [
    {
      id: 'voa',
      name: 'VOA 听力',
      desc: 'VOA 累计完成 {need} 章',
      icon: '🎙️',
      start: 1,
      end: 15,
      steps: 4,
      initial: 2,
      unit: '章',
      pointsStart: 20,
      pointsEnd: 80
    },
    {
      id: 'cet6',
      name: '六级听力',
      desc: '六级听力累计完成 {need} 篇',
      icon: '🎧',
      start: 1,
      end: 5,
      steps: 3,
      pointsStart: 20,
      pointsEnd: 60
    },
    {
      id: 'intensive',
      name: '精听',
      desc: '精听累计完成 {need} 篇',
      icon: '🎯',
      start: 1,
      end: 5,
      steps: 3,
      pointsStart: 20,
      pointsEnd: 60
    }
  ]),
  group('观影', 'listening', '部', 4, [
    {
      id: 'movie',
      name: '英文电影',
      desc: '累计看完 {need} 部英文电影',
      icon: '🎬',
      start: 1,
      end: 10,
      steps: 4,
      pointsStart: 20,
      pointsEnd: 100
    }
  ]),
  group('口语', 'speaking', '次', 0, [
    {
      id: 'speak',
      name: '口语练习',
      desc: '完成 {need} 次口语练习',
      icon: '🗣️',
      start: 1,
      end: 10,
      steps: 3,
      pointsStart: 20,
      pointsEnd: 60
    },
    {
      id: 'repeat',
      name: '跟读',
      desc: '完成 {need} 篇跟读',
      icon: '🔁',
      start: 1,
      end: 5,
      steps: 3,
      pointsStart: 20,
      pointsEnd: 60
    }
  ]),
  group('写作', 'writing', '篇', 0, [
    {
      id: 'write',
      name: '英语写作',
      desc: '完成 {need} 篇英语写作',
      icon: '✍️',
      start: 1,
      end: 5,
      steps: 3,
      pointsStart: 20,
      pointsEnd: 60
    },
    {
      id: 'rewrite',
      name: '仿写',
      desc: '完成 {need} 篇仿写',
      icon: '📝',
      start: 1,
      end: 5,
      steps: 3,
      pointsStart: 20,
      pointsEnd: 60
    }
  ])
];

export const ENGLISH_ITEM_DEFAULTS: Record<string, number> = {};
export const ENGLISH_ITEM_TARGETS: Record<string, number> = {};
for (const checklistGroup of ENGLISH_CHECKLIST_GROUPS) {
  for (const item of checklistGroup.items) {
    ENGLISH_ITEM_DEFAULTS[item.id] = item.initial ?? checklistGroup.initial;
    ENGLISH_ITEM_TARGETS[item.id] = item.need;
  }
}
