import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { checklistOf, checklistsOf } from '../check/checklistRegistry';
import type { CheckSnapshot, CheckStore } from '../check/checkStore';
import type { Category, DataSubTab, ListKey, Tab } from '../navigation/shellState';
import { panelsOf } from '../features/registry';
import { ProfilePanel } from '../features/profile/ProfilePanel';
import { DataPage } from './DataPage';
import type { SportStore } from '../sport/sportStore';
import { formatMonthDay } from '../shared/format';
import { businessToday } from '../model/waterGoal';
import { AppAvatar, IconBadge, Pill, Segmented, Surface, UIText } from '../ui/primitives';
import { palette, radius, shadow, space, useTheme } from '../ui/theme';

const CATEGORY_OPTIONS: { key: Category; label: string; icon: string }[] = [
  { key: 'health', label: '健康', icon: '🌿' },
  { key: 'learning', label: '英语', icon: '📖' }
];

export interface CheckShellProps {
  store: CheckStore;
  isGuest: boolean;
  displayName: string;
  onUpgrade?: () => void;
  onExit: () => void;
  onOpenRewards?: () => void;
  pointsBalance?: number;
  sportStore?: SportStore;
  onSync?: () => void;
  onOpenSystem?: () => void;
}

export function CheckShell({
  store,
  isGuest,
  displayName,
  onUpgrade,
  onExit,
  onOpenRewards,
  pointsBalance,
  sportStore,
  onSync,
  onOpenSystem
}: CheckShellProps): React.JSX.Element {
  const { feature } = useTheme();
  const [snapshot, setSnapshot] = useState<CheckSnapshot>(store.getSnapshot());
  const [tab, setTab] = useState<Tab>('check');
  const [category, setCategory] = useState<Category>('health');
  const [list, setList] = useState<ListKey>('water');
  const [subTabByList, setSubTabByList] = useState<Partial<Record<ListKey, DataSubTab>>>({});
  useEffect(() => {
    const unsubscribe = store.subscribe(setSnapshot);
    void store.load();
    return unsubscribe;
  }, [store]);

  // 切分类只回落清单，不劫持当前页签，也不丢二级记忆（NAV-03/07）。
  const switchCategory = (next: Category): void => {
    setCategory(next);
    setList(checklistsOf(next)[0]?.key ?? 'water');
  };
  const subTab: DataSubTab = subTabByList[list] ?? 'stats';
  const changeSubTab = (next: DataSubTab): void => {
    setSubTabByList((prev) => ({ ...prev, [list]: next }));
  };
  const today = businessToday();
  const activeChecklist = checklistOf(list);
  const activeColor = feature[list];
  const panels = panelsOf(list);
  const context = {
    snapshot,
    store,
    sportStore,
    isGuest,
    onOpenProfile: () => setTab('profile'),
    onGoRecord: () => setTab('check')
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <IconBadge icon={activeChecklist.icon} accent={activeColor.main} size={28} />
          <UIText variant="h2" style={{ fontSize: 18, lineHeight: 22 }}>
            {activeChecklist.name}
          </UIText>
        </View>
        <View style={styles.headerRight}>
          {onOpenRewards ? (
            <Pressable
              accessibilityRole="button"
              onPress={onOpenRewards}
              style={({ pressed }) => [styles.points, pressed && { opacity: 0.7 }]}
            >
              <UIText variant="caption">🏅</UIText>
              <UIText variant="caption" color={palette.brand} style={{ fontWeight: '700' }}>
                {pointsBalance === undefined ? '签到' : `${pointsBalance} 积分`}
              </UIText>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => setTab('profile')} hitSlop={6}>
            <AppAvatar name={displayName} size={36} accent={palette.brand} ring />
          </Pressable>
        </View>
      </View>

      {tab === 'check' ? (
        <View style={styles.dateRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <UIText variant="h1" numberOfLines={1}>
              {formatMonthDay(today)}
            </UIText>

          </View>
          <Pill label={isGuest ? '游客' : '已登录'} accent={isGuest ? palette.muted : palette.success} dot />
        </View>
      ) : null}

      {tab === 'check' ? (
        <>
          <Segmented
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={switchCategory}
            accent={palette.brand}
            style={styles.category}
          />
                    <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listRow}
            style={styles.listScroll}
          >
            {checklistsOf(category).map((item) => {
              const color = feature[item.key];
              const active = item.key === list;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                  accessibilityState={{ selected: active }}
                  onPress={() => setList(item.key)}
                  style={[
                    styles.listCard,
                    active && { backgroundColor: color.wash, borderColor: `${color.main}70` }
                  ]}
                >
                  <IconBadge icon={item.icon} accent={color.main} size={28} />
                  <UIText
                    variant="bodyStrong"
                    color={active ? color.deep : palette.ink}
                    style={{ fontSize: 14 }}
                  >
                    {item.name}
                  </UIText>
                  {active ? <View style={[styles.activeDot, { backgroundColor: color.main }]} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {snapshot.errorMessage ? (
        <View style={styles.bannerWrap}>
          <Surface
            tone="soft"
            style={[styles.banner, { borderColor: `${palette.danger}33`, backgroundColor: palette.dangerTint }]}
          >
            <UIText variant="small" color={palette.danger}>
              {snapshot.errorMessage}
            </UIText>
          </Surface>
        </View>
      ) : null}
      {snapshot.notice ? (
        <View style={styles.bannerWrap}>
          <Surface
            tone="soft"
            style={[styles.banner, { borderColor: `${palette.success}33`, backgroundColor: palette.successTint }]}
          >
            <UIText variant="small" color={palette.success}>
              {snapshot.notice}
            </UIText>
          </Surface>
        </View>
      ) : null}

      <View style={styles.body}>
        {tab === 'check' ? panels.Today(context) : null}
        {tab === 'data' ? (
          <DataPage
            checklist={list}
            subTab={subTab}
            onChangeSubTab={changeSubTab}
            isGuest={isGuest}
            waterSnapshot={snapshot}
            waterStore={store}
            sportStore={sportStore}
            onGoRecord={() => setTab('check')}
          />
        ) : null}
        {tab === 'profile' ? (
          <ProfilePanel
            snapshot={snapshot}
            store={store}
            isGuest={isGuest}
            displayName={displayName}
            onUpgrade={onUpgrade}
            onExit={onExit}
            onOpenRewards={onOpenRewards}
            onSync={onSync}
            onOpenSystem={onOpenSystem}
          />
        ) : null}
      </View>

      <View style={styles.tabs} testID="bottom-tabs">
        {(
          [
            ['check', '清单', '✓'],
            ['data', '洞察', '▤'],
            ['profile', '我的', '◉']
          ] as [Tab, string, string][]
        ).map(([key, label, glyph]) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(key)}
              style={({ pressed }) => [styles.tab, pressed && { opacity: 0.65 }]}
            >
              <View style={[styles.tabIcon, active && { backgroundColor: palette.brandTint }]}>
                <UIText variant="bodyStrong" color={active ? palette.brand : palette.faint} style={{ fontSize: 16 }}>
                  {glyph}
                </UIText>
              </View>
              <UIText variant="caption" color={active ? palette.brand : palette.muted} style={{ fontWeight: active ? '700' : '500' }}>
                {label}
              </UIText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: palette.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingTop: 12,
    paddingBottom: 4
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  points: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.xl,
    paddingTop: 14,
    paddingBottom: 2
  },
  category: { marginHorizontal: space.xl, marginTop: 12 },
  listScroll: { marginTop: 12, flexGrow: 0 },
  listRow: { paddingHorizontal: 18, gap: 10, paddingBottom: 2 },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    ...shadow.card
  },
  activeDot: { width: 7, height: 7, borderRadius: 4 },
  bannerWrap: { paddingHorizontal: space.xl, paddingTop: 10 },
  banner: { paddingVertical: 9, paddingHorizontal: 12 },
  body: { flex: 1, minHeight: 0, marginTop: 6 },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.lg,
    marginTop: 4,
    marginBottom: Platform.OS === 'ios' ? 12 : 10,
    backgroundColor: palette.surface,
    borderRadius: 24,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: palette.line,
    ...shadow.float
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 3 },
  tabIcon: {
    width: 34,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
