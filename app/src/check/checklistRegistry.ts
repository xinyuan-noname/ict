import type { Category, ListKey } from '../navigation/shellState';

export interface ChecklistDef {
  key: ListKey;
  category: Category;
  name: string;
  unit: string;
  supportsMetricSwitch: boolean;
  /** 清单图标（emoji，避免引入图标字体依赖） */
  icon: string;
  /** 列表卡片上的一句话说明 */
  tagline: string;
  /** 详情页的空态/说明文案 */
  description: string;
}

// 只承载元数据与装配映射，不含业务规则；缺键时由数据页渲染「暂不可用」。
// 新增清单：在这里登记元数据，再在 features/registry.tsx 绑定面板。
export const CHECKLISTS: Readonly<Record<ListKey, ChecklistDef>> = Object.freeze({
  water: {
    key: 'water',
    category: 'health',
    name: '喝水',
    unit: 'ml',
    supportsMetricSwitch: false,
    icon: '💧',
    tagline: '每一杯都算数',
    description: '按身体档案计算每日目标，记录每一杯水。'
  },
  medication: {
    key: 'medication',
    category: 'health',
    name: '服药',
    unit: '次',
    supportsMetricSwitch: false,
    icon: '💊',
    tagline: '按时，不漏一次',
    description: '按早/中/晚/睡前四个时段管理药物与打卡。'
  },
  sport: {
    key: 'sport',
    category: 'health',
    name: '运动',
    unit: '步',
    supportsMetricSwitch: true,
    icon: '🏃',
    tagline: '今天也动起来',
    description: '记录步行、骑行与跑步，累计运动成就。'
  },
  english: {
    key: 'english',
    category: 'learning',
    name: '英语',
    unit: '词',
    supportsMetricSwitch: false,
    icon: '📖',
    tagline: '每天二十个词',
    description: '用小步快跑的方式积累词汇与连续天数。'
  },
  custom: {
    key: 'custom',
    category: 'custom',
    name: '自定义',
    unit: '次',
    supportsMetricSwitch: false,
    icon: '✨',
    tagline: '告诉 AI 你想坚持什么',
    description: '根据你的需求生成一级清单、二级技能和成就。'
  }
});

export function checklistOf(key: ListKey): ChecklistDef {
  return CHECKLISTS[key];
}

export function checklistsOf(category: Category): readonly ChecklistDef[] {
  const order: readonly ListKey[] = category === 'health'
    ? ['water', 'medication', 'sport']
    : category === 'learning'
      ? ['english']
      : ['custom'];
  return order.map((key) => CHECKLISTS[key]);
}