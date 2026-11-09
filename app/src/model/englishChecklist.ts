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

function group(
  name: string,
  skill: EnglishSkill,
  unit: string,
  initial: number,
  items: readonly EnglishChecklistItem[]
): EnglishChecklistGroup {
  return { name, skill, unit, initial, items };
}

/**
 * 28 考研 + 六级清单（参考 english_01.md）。
 * 每个条目独立记录进度；分组只决定二级技能归属。
 */
export const ENGLISH_CHECKLIST_GROUPS: readonly EnglishChecklistGroup[] = [
  group('百词斩', 'reading', '词', 3000, [
    { id: 'words_500', name: '英语新生', desc: '学习词汇达到 500', icon: '🔓', need: 500, points: 20 },
    { id: 'words_1000', name: '初入江湖', desc: '学习词汇达到 1000', icon: '🔓', need: 1000, points: 30 },
    { id: 'words_2000', name: '小有成就', desc: '学习词汇达到 2000', icon: '🔓', need: 2000, points: 40 },
    { id: 'words_3000', name: '习惯养成', desc: '学习词汇达到 3000', icon: '🔓', need: 3000, points: 50 },
    { id: 'words_4000', name: '雷打不动', desc: '学习词汇达到 4000', icon: '🔓', need: 4000, points: 60 },
    { id: 'words_5000', name: '单词大师', desc: '学习词汇达到 5000', icon: '🏅', need: 5000, points: 80 },
    { id: 'words_6000', name: '单词宗师', desc: '学习词汇达到 6000', icon: '🏅', need: 6000, points: 100 },
    { id: 'words_once', name: '过一遍', desc: '所有词汇学完一遍', icon: '1️⃣', need: 6000, points: 120 }
  ]),
  group('阅读', 'reading', '页', 10, [
    { id: 'read_10', name: '魔法世界', desc: '阅读累计达到 10 页', icon: '🔓', need: 10, points: 20 },
    { id: 'read_50', name: '英语新生', desc: '阅读累计达到 50 页', icon: '🔓', need: 50, points: 25 },
    { id: 'read_100', name: '初入江湖', desc: '阅读累计达到 100 页', icon: '🔓', need: 100, points: 30 },
    { id: 'read_150', name: '小有成就', desc: '阅读累计达到 150 页', icon: '🔓', need: 150, points: 35 },
    { id: 'read_200', name: '习惯养成', desc: '阅读累计达到 200 页', icon: '🔓', need: 200, points: 40 },
    { id: 'read_250', name: '雷打不动', desc: '阅读累计达到 250 页', icon: '🔓', need: 250, points: 50 },
    { id: 'read_300', name: '单词大师', desc: '阅读累计达到 300 页', icon: '🏅', need: 300, points: 60 },
    { id: 'read_once', name: '读一遍', desc: '完成整本书第一遍', icon: '2️⃣', need: 300, points: 80 }
  ]),
  group('阅读词汇', 'reading', '词', 6156, [
    { id: 'read_vocab_6000', name: '破六千', desc: '阅读词汇量 ≥ 6000', icon: '🔓', need: 6000, points: 30 },
    { id: 'read_vocab_6500', name: '六千五', desc: '阅读词汇量 ≥ 6500', icon: '🔓', need: 6500, points: 40 },
    { id: 'read_vocab_7000', name: '七千关', desc: '阅读词汇量 ≥ 7000', icon: '🔓', need: 7000, points: 50 },
    { id: 'read_vocab_7500', name: '七千五', desc: '阅读词汇量 ≥ 7500', icon: '🔓', need: 7500, points: 60 },
    { id: 'read_vocab_8000', name: '八千斩', desc: '阅读词汇量 ≥ 8000', icon: '🏅', need: 8000, points: 80 },
    { id: 'read_vocab_9000', name: '九千', desc: '阅读词汇量 ≥ 9000', icon: '👑', need: 9000, points: 100 },
    { id: 'read_vocab_10000', name: '一万', desc: '阅读词汇量 ≥ 10000', icon: '💎', need: 10000, points: 120 }
  ]),
  group('听力词汇', 'listening', '词', 5246, [
    { id: 'listen_vocab_4000', name: '四千', desc: '听力词汇量 ≥ 4000', icon: '🔓', need: 4000, points: 30 },
    { id: 'listen_vocab_4500', name: '四千五', desc: '听力词汇量 ≥ 4500', icon: '🔓', need: 4500, points: 40 },
    { id: 'listen_vocab_5000', name: '五千', desc: '听力词汇量 ≥ 5000', icon: '🔓', need: 5000, points: 50 },
    { id: 'listen_vocab_5500', name: '五千五', desc: '听力词汇量 ≥ 5500', icon: '🔓', need: 5500, points: 60 },
    { id: 'listen_vocab_6000', name: '六千', desc: '听力词汇量 ≥ 6000', icon: '🏅', need: 6000, points: 80 },
    { id: 'listen_vocab_7000', name: '七千', desc: '听力词汇量 ≥ 7000', icon: '👑', need: 7000, points: 100 },
    { id: 'listen_vocab_8000', name: '八千', desc: '听力词汇量 ≥ 8000', icon: '💎', need: 8000, points: 120 }
  ]),
  group('听力', 'listening', '篇', 0, [
    { id: 'voa_1', name: '累计一章', desc: '每日英语听力 VOA 累计 1 章', icon: '🎧', need: 1, points: 20, initial: 2, unit: '章' },
    { id: 'voa_5', name: '累计五章', desc: '每日英语听力 VOA 累计 5 章', icon: '🎧', need: 5, points: 40, initial: 2, unit: '章' },
    { id: 'voa_10', name: '累计十章', desc: '每日英语听力 VOA 累计 10 章', icon: '🎧', need: 10, points: 60, initial: 2, unit: '章' },
    { id: 'voa_15', name: '累计十五章', desc: '每日英语听力 VOA 累计 15 章', icon: '🎧', need: 15, points: 80, initial: 2, unit: '章' },
    { id: 'cet6_1', name: '做完一篇', desc: '做完一篇六级听力', icon: '🎧', need: 1, points: 20 },
    { id: 'cet6_3', name: '做完三篇', desc: '做完三篇六级听力', icon: '🎧', need: 3, points: 40 },
    { id: 'cet6_5', name: '做完五篇', desc: '做完五篇六级听力', icon: '🎧', need: 5, points: 60 },
    { id: 'intensive_1', name: '精听一篇', desc: '精听一篇六级听力', icon: '🎧', need: 1, points: 20 },
    { id: 'intensive_3', name: '精听三篇', desc: '精听三篇六级听力', icon: '🎧', need: 3, points: 40 },
    { id: 'intensive_5', name: '精听五篇', desc: '精听五篇六级听力', icon: '🎧', need: 5, points: 60 }
  ]),
  group('观影', 'listening', '部', 4, [
    { id: 'movie_1', name: '累计看完 1 部', desc: '累计看完 1 部英文电影', icon: '🎬', need: 1, points: 20 },
    { id: 'movie_3', name: '累计看完 3 部', desc: '累计看完 3 部英文电影', icon: '🎬', need: 3, points: 40 },
    { id: 'movie_5', name: '累计看完 5 部', desc: '累计看完 5 部英文电影', icon: '🎬', need: 5, points: 60 },
    { id: 'movie_10', name: '累计看完 10 部', desc: '累计看完 10 部英文电影', icon: '🎬', need: 10, points: 100 }
  ]),
  group('口语', 'speaking', '次', 0, [
    { id: 'speak_1', name: '开口一次', desc: '完成 1 次口语练习', icon: '🗣️', need: 1, points: 20 },
    { id: 'speak_5', name: '开口五次', desc: '完成 5 次口语练习', icon: '🗣️', need: 5, points: 40 },
    { id: 'speak_10', name: '开口十次', desc: '完成 10 次口语练习', icon: '🗣️', need: 10, points: 60 },
    { id: 'repeat_1', name: '跟读一篇', desc: '完成 1 篇跟读', icon: '🔁', need: 1, points: 20 },
    { id: 'repeat_3', name: '跟读三篇', desc: '完成 3 篇跟读', icon: '🔁', need: 3, points: 40 },
    { id: 'repeat_5', name: '跟读五篇', desc: '完成 5 篇跟读', icon: '🔁', need: 5, points: 60 }
  ]),
  group('写作', 'writing', '篇', 0, [
    { id: 'write_1', name: '写一篇', desc: '完成 1 篇英语写作', icon: '✍️', need: 1, points: 20 },
    { id: 'write_3', name: '写三篇', desc: '完成 3 篇英语写作', icon: '✍️', need: 3, points: 40 },
    { id: 'write_5', name: '写五篇', desc: '完成 5 篇英语写作', icon: '✍️', need: 5, points: 60 },
    { id: 'rewrite_1', name: '仿写一篇', desc: '完成 1 篇仿写', icon: '📝', need: 1, points: 20 },
    { id: 'rewrite_3', name: '仿写三篇', desc: '完成 3 篇仿写', icon: '📝', need: 3, points: 40 },
    { id: 'rewrite_5', name: '仿写五篇', desc: '完成 5 篇仿写', icon: '📝', need: 5, points: 60 }
  ])
];

export const ENGLISH_ITEM_DEFAULTS: Record<string, number> = {};
export const ENGLISH_ITEM_TARGETS: Record<string, number> = {};
for (const group of ENGLISH_CHECKLIST_GROUPS) {
  for (const item of group.items) {
    ENGLISH_ITEM_DEFAULTS[item.id] = item.initial ?? group.initial;
    ENGLISH_ITEM_TARGETS[item.id] = item.need;
  }
}
