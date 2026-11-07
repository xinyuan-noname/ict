import type { Category, ListKey } from '../navigation/shellState';

export interface ChecklistDef {
  key: ListKey;
  category: Category;
  name: string;
  unit: string;
  supportsMetricSwitch: boolean;
}

// 只承载元数据与装配映射，不含业务规则；缺键时由数据页渲染「暂不可用」。
export const CHECKLISTS: Readonly<Record<ListKey, ChecklistDef>> = Object.freeze({
  water: { key: 'water', category: 'health', name: '饮水', unit: 'ml', supportsMetricSwitch: false },
  medication: { key: 'medication', category: 'health', name: '服药', unit: '次', supportsMetricSwitch: false },
  sport: { key: 'sport', category: 'health', name: '运动', unit: '步', supportsMetricSwitch: true },
  english: { key: 'english', category: 'learning', name: '英语', unit: '词', supportsMetricSwitch: false }
});

export function checklistOf(key: ListKey): ChecklistDef {
  return CHECKLISTS[key];
}

export function checklistsOf(category: Category): readonly ChecklistDef[] {
  const order: readonly ListKey[] = category === 'health'
    ? ['water', 'medication', 'sport']
    : ['english'];
  return order.map((key) => CHECKLISTS[key]);
}