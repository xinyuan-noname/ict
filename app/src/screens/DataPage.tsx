import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CheckSnapshot, CheckStore } from '../check/checkStore';
import type { DataSubTab, ListKey } from '../navigation/shellState';
import type { SportStore } from '../sport/sportStore';
import { panelsOf } from '../features/registry';
import { Segmented } from '../ui/primitives';
import { palette, space, useTheme } from '../ui/theme';

export interface DataPageProps {
  checklist: ListKey;
  subTab: DataSubTab;
  onChangeSubTab: (sub: DataSubTab) => void;
  isGuest: boolean;
  waterSnapshot: CheckSnapshot;
  waterStore: CheckStore;
  sportStore?: SportStore;
  /** 只切回 check，不自动打开表单 */
  onGoRecord: () => void;
}

// 「洞察」页：不再显示顶部标题/说明，只保留统计/成就与当前清单内容。
// 当前清单由「清单」页选择后沿用；要切换清单请回到清单页。
export function DataPage({
  checklist,
  subTab,
  onChangeSubTab,
  isGuest,
  waterSnapshot,
  waterStore,
  sportStore
}: DataPageProps): React.JSX.Element {
  const { feature } = useTheme();
  const color = feature[checklist];
  const panels = panelsOf(checklist);
  const context = {
    snapshot: waterSnapshot,
    store: waterStore,
    sportStore,
    isGuest,
    onOpenProfile: () => undefined,
    onGoRecord: () => undefined
  };

  return (
    <View style={styles.root}>
      <Segmented
        options={[
          { key: 'stats', label: '统计' },
          { key: 'achievements', label: '成就' }
        ]}
        value={subTab}
        onChange={onChangeSubTab}
        accent={color.main}
        style={styles.subRow}
        compact
      />

      <View style={styles.body}>
        <View
          testID="data-pane-stats"
          aria-hidden={subTab !== 'stats'}
          style={[styles.pane, subTab !== 'stats' && styles.hidden]}
          accessibilityElementsHidden={subTab !== 'stats'}
          importantForAccessibility={subTab === 'stats' ? 'auto' : 'no-hide-descendants'}
        >
          {panels.Stats(context)}
        </View>
        <View
          testID="data-pane-achievements"
          aria-hidden={subTab !== 'achievements'}
          style={[styles.pane, subTab !== 'achievements' && styles.hidden]}
          accessibilityElementsHidden={subTab !== 'achievements'}
          importantForAccessibility={subTab === 'achievements' ? 'auto' : 'no-hide-descendants'}
        >
          {panels.Achievements(context)}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: palette.canvas },
  subRow: { marginHorizontal: space.xl, marginTop: 14 },
  body: { flex: 1, minHeight: 0 },
  pane: { flex: 1, minHeight: 0 },
  hidden: { display: 'none' }
});
