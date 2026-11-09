export interface EnglishChecklistItem {
  id: string;
  name: string;
  desc: string;
  icon: string;
  /** 目标值，单位由所属分组或条目决定 */
  need: number;
  points: number;
  unit?: string;
  /** 初始进度（从旧清单迁移） */
  initial?: number;
}

export interface EnglishChecklistGroup {
  name: string;
  unit: string;
  initial: number;
  items: readonly EnglishChecklistItem[];
}

/**
 * 28 考研 + 六级清单（参考 english_01.md）。
 * 每个条目独立记录进度，不绑定固定字段或固定书目。
 */
export const ENGLISH_CHECKLIST_GROUPS: readonly EnglishChecklistGroup[] = [
  {
    name: '百词斩',
    unit: '词',
    initial: 3000,
    items: [
      { id: 'words_500', name: '英语新生', desc: '学习词汇达到 500', icon: '🔓', need: 500, points: 20 },
      { id: 'words_1000', name: '初入江湖', desc: '学习词汇达到 1000', icon: '🔓', need: 1000, points: 30 },
      { id: 'words_2000', name: '小有成就', desc: '学习词汇达到 2000', icon: '🔓', need: 2000, points: 40 },
      { id: 'words_3000', name: '习惯养成', desc: '学习词汇达到 3000', icon: '🔓', need: 3000, points: 50 },
      { id: 'words_4000', name: '雷打不动', desc: '学习词汇达到 4000', icon: '🔓', need: 4000, points: 60 },
      { id: 'words_5000', name: '单词大师', desc: '学习词汇达到 5000', icon: '🏅', need: 5000, points: 80 },
      { id: 'words_6000', name: '单词宗师', desc: '学习词汇达到 6000', icon: '🏅', need: 6000, points: 100 },
      { id: 'words_once', name: '过一遍', desc: '所有词汇学完一遍', icon: '1️⃣', need: 6000, points: 120 }
    ]
  },
  {
    name: '阅读',
    unit: '页',
    initial: 10,
    items: [
      { id: 'read_10', name: '魔法世界', desc: "阅读累计达到 10 页", icon: '🔓', need: 10, points: 20 },
      { id: 'read_50', name: '英语新生', desc: '阅读累计达到 50 页', icon: '🔓', need: 50, points: 25 },
      { id: 'read_100', name: '初入江湖', desc: '阅读累计达到 100 页', icon: '🔓', need: 100, points: 30 },
      { id: 'read_150', name: '小有成就', desc: '阅读累计达到 150 页', icon: '🔓', need: 150, points: 35 },
      { id: 'read_200', name: '习惯养成', desc: '阅读累计达到 200 页', icon: '🔓', need: 200, points: 40 },
      { id: 'read_250', name: '雷打不动', desc: '阅读累计达到 250 页', icon: '🔓', need: 250, points: 50 },
      { id: 'read_300', name: '单词大师', desc: '阅读累计达到 300 页', icon: '🏅', need: 300, points: 60 },
      { id: 'read_once', name: '读一遍', desc: '完成整本书第一遍', icon: '2️⃣', need: 300, points: 80 }
    ]
  },
  {
    name: '阅读词汇',
    unit: '词',
    initial: 6156,
    items: [
      { id: 'read_vocab_6000', name: '破六千', desc: '阅读词汇量 ≥ 6000', icon: '🔓', need: 6000, points: 30 },
      { id: 'read_vocab_6500', name: '六千五', desc: '阅读词汇量 ≥ 6500', icon: '🔓', need: 6500, points: 40 },
      { id: 'read_vocab_7000', name: '七千关', desc: '阅读词汇量 ≥ 7000', icon: '🔓', need: 7000, points: 50 },
      { id: 'read_vocab_7500', name: '七千五', desc: '阅读词汇量 ≥ 7500', icon: '🔓', need: 7500, points: 60 },
      { id: 'read_vocab_8000', name: '八千斩', desc: '阅读词汇量 ≥ 8000', icon: '🏅', need: 8000, points: 80 },
      { id: 'read_vocab_9000', name: '九千', desc: '阅读词汇量 ≥ 9000', icon: '👑', need: 9000, points: 100 },
      { id: 'read_vocab_10000', name: '一万', desc: '阅读词汇量 ≥ 10000', icon: '💎', need: 10000, points: 120 }
    ]
  },
  {
    name: '听力词汇',
    unit: '词',
    initial: 5246,
    items: [
      { id: 'listen_vocab_4000', name: '四千', desc: '听力词汇量 ≥ 4000', icon: '🔓', need: 4000, points: 30 },
      { id: 'listen_vocab_4500', name: '四千五', desc: '听力词汇量 ≥ 4500', icon: '🔓', need: 4500, points: 40 },
      { id: 'listen_vocab_5000', name: '五千', desc: '听力词汇量 ≥ 5000', icon: '🔓', need: 5000, points: 50 },
      { id: 'listen_vocab_5500', name: '五千五', desc: '听力词汇量 ≥ 5500', icon: '🔓', need: 5500, points: 60 },
      { id: 'listen_vocab_6000', name: '六千', desc: '听力词汇量 ≥ 6000', icon: '🏅', need: 6000, points: 80 },
      { id: 'listen_vocab_7000', name: '七千', desc: '听力词汇量 ≥ 7000', icon: '👑', need: 7000, points: 100 },
      { id: 'listen_vocab_8000', name: '八千', desc: '听力词汇量 ≥ 8000', icon: '💎', need: 8000, points: 120 }
    ]
  },
  {
    name: '听力',
    unit: '篇',
    initial: 0,
    items: [
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
    ]
  },
  {
    name: '观影',
    unit: '部',
    initial: 4,
    items: [
      { id: 'movie_1', name: '累计看完 1 部', desc: '累计看完 1 部英文电影', icon: '🎬', need: 1, points: 20 },
      { id: 'movie_3', name: '累计看完 3 部', desc: '累计看完 3 部英文电影', icon: '🎬', need: 3, points: 40 },
      { id: 'movie_5', name: '累计看完 5 部', desc: '累计看完 5 部英文电影', icon: '🎬', need: 5, points: 60 },
      { id: 'movie_10', name: '累计看完 10 部', desc: '累计看完 10 部英文电影', icon: '🎬', need: 10, points: 100 }
    ]
  }
];

export const ENGLISH_ITEM_DEFAULTS: Record<string, number> = {};
export const ENGLISH_ITEM_TARGETS: Record<string, number> = {};
for (const group of ENGLISH_CHECKLIST_GROUPS) {
  for (const item of group.items) {
    ENGLISH_ITEM_DEFAULTS[item.id] = item.initial ?? group.initial;
    ENGLISH_ITEM_TARGETS[item.id] = item.need;
  }
}
