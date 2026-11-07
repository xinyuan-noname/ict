import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { checklistOf } from '../check/checklistRegistry';
import type { CheckSnapshot, CheckStore } from '../check/checkStore';
import type { DataSubTab, ListKey } from '../navigation/shellState';
import type { SportStore } from '../sport/sportStore';
import { EnglishPanel, MedicationPanel, SportPanel } from './HealthPanels';
import { WaterStatsSubView } from './panels/WaterStatsSubView';

export interface DataPageProps {
  checklist: ListKey;
  subTab: DataSubTab;
  onChangeSubTab: (sub: DataSubTab) => void;
  isGuest: boolean;
  displayName: string;
  waterSnapshot: CheckSnapshot;
  waterStore: CheckStore;
  sportStore?: SportStore;
  /** 只切回 check，不自动打开表单（P14） */
  onGoRecord: () => void;
}

// 「数据」页：一级标题 + 清单名 + 二级「统计 / 成就」，只读，不承载写入（NAV-11/16）。
export function DataPage({
  checklist,
  subTab,
  onChangeSubTab,
  isGuest,
  displayName,
  waterSnapshot,
  waterStore,
  sportStore,
  onGoRecord
}: DataPageProps): React.JSX.Element {
  const def = checklistOf(checklist);

  const stats = (() => {
    switch (checklist) {
      case 'water':
        return <WaterStatsSubView snapshot={waterSnapshot} store={waterStore} />;
      case 'medication':
        return <MedicationPanel tab="stats" />;
      case 'sport':
        return <SportPanel tab="stats" sportStore={sportStore} />;
      case 'english':
        return <EnglishPanel tab="stats" />;
      default:
        return null;
    }
  })();

  const achievements = (() => {
    switch (checklist) {
      case 'water':
        return <WaterAchievementsPlaceholder onGoRecord={onGoRecord} />;
      case 'medication':
        return <MedicationPanel tab="achievements" />;
      case 'sport':
        return <SportPanel tab="achievements" sportStore={sportStore} />;
      case 'english':
        return <EnglishPanel tab="achievements" />;
      default:
        return null;
    }
  })();

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.title}>数据</Text>
        <Text style={styles.subtitle}>
          {def?.name ?? '清单'} · {isGuest ? '游客模式（本地判定）' : displayName}
        </Text>
      </View>

      <View style={styles.subRow}>
        {(['stats', 'achievements'] as DataSubTab[]).map((key) => (
          <Pressable key={key} accessibilityRole="button" onPress={() => onChangeSubTab(key)} style={styles.subTab}>
            <Text style={[styles.subText, subTab === key && styles.subActive]}>{key === 'stats' ? '统计' : '成就'}</Text>
            {subTab === key ? <View style={styles.subLine} /> : null}
          </Pressable>
        ))}
      </View>

      <View style={styles.body}>
        <View
          testID="data-pane-stats"
          aria-hidden={subTab !== 'stats'}
          style={[styles.pane, subTab !== 'stats' && styles.hidden]}
          accessibilityElementsHidden={subTab !== 'stats'}
          importantForAccessibility={subTab === 'stats' ? 'auto' : 'no-hide-descendants'}
        >
          {stats}
        </View>
        <View
          testID="data-pane-achievements"
          aria-hidden={subTab !== 'achievements'}
          style={[styles.pane, subTab !== 'achievements' && styles.hidden]}
          accessibilityElementsHidden={subTab !== 'achievements'}
          importantForAccessibility={subTab === 'achievements' ? 'auto' : 'no-hide-descendants'}
        >
          {achievements}
        </View>
      </View>
    </View>
  );
}

function WaterAchievementsPlaceholder({ onGoRecord }: { onGoRecord: () => void }): React.JSX.Element {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>饮水成就正在接入</Text>
        <Text style={styles.emptyHint}>7 个饮水成就将在这里按「未解锁 / 已解锁 / 发放中 / 已发放」展示。</Text>
        <Pressable style={styles.secondary} onPress={onGoRecord} accessibilityRole="button">
          <Text style={styles.secondaryText}>去记录</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  head: { paddingHorizontal: 20, paddingTop: 10 },
  title: { fontSize: 19, fontWeight: '700', color: '#222' },
  subtitle: { fontSize: 12, color: '#999', marginTop: 4 },
  subRow: { flexDirection: 'row', gap: 18, paddingHorizontal: 20, paddingTop: 10, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  subTab: { paddingVertical: 6, alignItems: 'center' },
  subText: { fontSize: 14, color: '#9a9a9a' },
  subActive: { color: '#c7000b', fontWeight: '600' },
  subLine: { height: 2, width: 18, backgroundColor: '#c7000b', marginTop: 4, borderRadius: 1 },
  body: { flex: 1, minHeight: 0 },
  pane: { flex: 1, minHeight: 0 },
  hidden: { display: 'none' },
  scroll: { padding: 20, paddingBottom: 32 },
  emptyCard: { backgroundColor: '#fafafa', borderRadius: 14, padding: 18, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  emptyHint: { fontSize: 12, color: '#999', textAlign: 'center', lineHeight: 18, marginTop: 8 },
  secondary: { marginTop: 14, borderWidth: 1, borderColor: '#c7000b', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 22 },
  secondaryText: { color: '#c7000b', fontSize: 13, fontWeight: '600' }
});