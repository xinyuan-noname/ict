import React from 'react';
import type { CheckSnapshot, CheckStore } from '../check/checkStore';
import type { ListKey } from '../navigation/shellState';
import type { SportStore } from '../sport/sportStore';
import { WaterStatsSubView } from '../screens/panels/WaterStatsSubView';
import { WaterAchievementsPanel, WaterTodayPanel } from './water/WaterTodayPanel';
import { MedicationPanel } from './medication/MedicationPanel';
import { SportPanel } from './sport/SportPanel';
import { EnglishPanel } from './english/EnglishPanel';
import type { EnglishSkill } from '../model/englishChecklist';

/**
 * 清单面板注册表 —— 页面只认这个接口，不认具体业务。
 *
 * 新增一个清单：
 * 1. check/checklistRegistry.ts 登记元数据；
 * 2. 在 features/<name>/ 实现 Today / Stats / Achievements 三个面板；
 * 3. 在 PANELS 里绑定；
 * 4. navigation/shellState.ts 的 CATEGORY_LISTS / LIST_KEYS 加入 key。
 * 主页、数据页、导航无需改动。
 */
export interface ChecklistPanelContext {
  snapshot: CheckSnapshot;
  store: CheckStore;
  sportStore?: SportStore;
  isGuest: boolean;
  englishSkill: EnglishSkill;
  onChangeEnglishSkill: (skill: EnglishSkill) => void;
  /** 跳到「我的」完善身体档案 */
  onOpenProfile: () => void;
  /** 从数据页回到清单记录 */
  onGoRecord: () => void;
}

export interface ChecklistPanels {
  Today: (context: ChecklistPanelContext) => React.JSX.Element;
  Stats: (context: ChecklistPanelContext) => React.JSX.Element;
  Achievements: (context: ChecklistPanelContext) => React.JSX.Element;
}

export const PANELS: Readonly<Record<ListKey, ChecklistPanels>> = Object.freeze({
  water: {
    Today: ({ snapshot, store, onOpenProfile }) => (
      <WaterTodayPanel snapshot={snapshot} store={store} onOpenProfile={onOpenProfile} />
    ),
    Stats: ({ snapshot, store }) => <WaterStatsSubView snapshot={snapshot} store={store} />,
    Achievements: ({ snapshot }) => <WaterAchievementsPanel snapshot={snapshot} />
  },
  medication: {
    Today: () => <MedicationPanel tab="today" />,
    Stats: () => <MedicationPanel tab="stats" />,
    Achievements: () => <MedicationPanel tab="achievements" />
  },
  sport: {
    Today: ({ sportStore }) => <SportPanel tab="today" sportStore={sportStore} />,
    Stats: ({ sportStore }) => <SportPanel tab="stats" sportStore={sportStore} />,
    Achievements: ({ sportStore }) => <SportPanel tab="achievements" sportStore={sportStore} />
  },
  english: {
    Today: ({ englishSkill, onChangeEnglishSkill }) => (
      <EnglishPanel tab="today" skill={englishSkill} onChangeSkill={onChangeEnglishSkill} />
    ),
    Stats: ({ englishSkill }) => <EnglishPanel tab="stats" skill={englishSkill} />,
    Achievements: ({ englishSkill }) => <EnglishPanel tab="achievements" skill={englishSkill} />
  }
});

export function panelsOf(key: ListKey): ChecklistPanels {
  return PANELS[key];
}
