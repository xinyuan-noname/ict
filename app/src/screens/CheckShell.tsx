import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { checklistOf, checklistsOf } from '../check/checklistRegistry';
import { ENGLISH_SKILLS, type EnglishSkill } from '../model/englishChecklist';
import { loadCustomPlanStates, saveCustomPlanStates } from '../check/customPlanStore';
import { loadEnabledLists, saveEnabledLists, type EnabledLists } from '../check/checkSettingsStore';
import { CheckSettingsPanel } from '../features/settings/CheckSettingsPanel';
import type { CustomPlanMode, CustomPlanState } from '../model/customPlan';
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
  authToken?: string;
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
  onOpenSystem,
  authToken
}: CheckShellProps): React.JSX.Element {
  const { feature } = useTheme();
  const [snapshot, setSnapshot] = useState<CheckSnapshot>(store.getSnapshot());
  const [tab, setTab] = useState<Tab>('check');
  const [category, setCategory] = useState<Category>('health');
  const [list, setList] = useState<ListKey>('water');
  const [englishSkill, setEnglishSkill] = useState<EnglishSkill>('reading');
  const [customPlans, setCustomPlans] = useState<CustomPlanState[]>([]);
  const [activeCustomId, setActiveCustomId] = useState('');
  const [creatingCustomMode, setCreatingCustomMode] = useState<CustomPlanMode | null>(null);
  const [customSkill, setCustomSkill] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [enabledLists, setEnabledLists] = useState<EnabledLists>({});
  const [subTabByList, setSubTabByList] = useState<Partial<Record<ListKey, DataSubTab>>>({});
  useEffect(() => {
    const unsubscribe = store.subscribe(setSnapshot);
    void store.load();
    return unsubscribe;
  }, [store]);

  useEffect(() => {
    void loadCustomPlanStates().then((states) => {
      setCustomPlans(states);
      if (states[0]) {
        setActiveCustomId(states[0].plan.id ?? '');
        setCustomSkill(states[0].plan.skills[0]?.name ?? '');
      }
    });
    void loadEnabledLists().then(setEnabledLists);
  }, []);

  const isListEnabled = (key: ListKey): boolean => enabledLists[key] !== false;
  const enabledChecklists = (next: Category): ListKey[] =>
    checklistsOf(next)
      .filter((item) => isListEnabled(item.key))
      .map((item) => item.key);

  useEffect(() => {
    const available = enabledChecklists(category);
    if (available.length > 0 && !available.includes(list)) {
      setList(available[0] ?? list);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, enabledLists, list]);

  const toggleList = (key: ListKey, next: boolean): void => {
    const merged = { ...enabledLists, [key]: next };
    setEnabledLists(merged);
    void saveEnabledLists(merged);
  };

  const deleteCustomPlan = (id: string): void => {
    const next = customPlans.filter((item) => item.plan.id !== id);
    setCustomPlans(next);
    void saveCustomPlanStates(next);
    if (activeCustomId === id) {
      setActiveCustomId(next[0]?.plan.id ?? '');
      setCustomSkill(next[0]?.plan.skills[0]?.name ?? '');
    }
    setSettingsOpen(false);
    if (category === 'custom' && next.length === 0) {
      setCategory('health');
      setList(enabledChecklists('health')[0] ?? 'water');
    }
  };

  const updateCustomPlanState = (next: CustomPlanState): void => {
    setCreatingCustomMode(null);
    setCustomPlans((prev) => {
      const exists = prev.some((item) => item.plan.id === next.plan.id);
      const merged = exists
        ? prev.map((item) => (item.plan.id === next.plan.id ? next : item))
        : [...prev, next];
      void saveCustomPlanStates(merged);
      return merged;
    });
    setActiveCustomId(next.plan.id ?? '');
    setCustomSkill(next.plan.skills[0]?.name ?? '');
    if (next.plan.mode === 'deadline') {
      setTab('deadline');
      setCategory('custom');
      setList('custom');
    } else {
      setTab('check');
      setCategory('custom');
      setList('custom');
    }
  };

  const startCreateCustom = (mode: CustomPlanMode): void => {
    setSettingsOpen(false);
    setCreatingCustomMode(mode);
    setActiveCustomId('');
    setCategory('custom');
    setList('custom');
    setTab(mode === 'deadline' ? 'deadline' : 'check');
  };

  const openCustomPlan = (id: string): void => {
    const target = customPlans.find((item) => item.plan.id === id);
    if (!target) {
      return;
    }
    setSettingsOpen(false);
    setCreatingCustomMode(null);
    setActiveCustomId(id);
    setCustomSkill(target.plan.skills[0]?.name ?? '');
    setCategory('custom');
    setList('custom');
    setTab(target.plan.mode === 'deadline' ? 'deadline' : 'check');
  };

  // 切分类只回落清单，不劫持当前页签，也不丢二级记忆（NAV-03/07）。
  const switchCategory = (next: Category): void => {
    setCategory(next);
    setList(enabledChecklists(next)[0] ?? checklistsOf(next)[0]?.key ?? 'water');
  };
  const subTab: DataSubTab = subTabByList[list] ?? 'stats';
  const changeSubTab = (next: DataSubTab): void => {
    setSubTabByList((prev) => ({ ...prev, [list]: next }));
  };
  const today = businessToday();
  const activeCustomMode: CustomPlanMode = tab === 'deadline' ? 'deadline' : 'recurring';
  const customPlanState =
    creatingCustomMode === activeCustomMode
      ? null
      : customPlans.find(
          (item) => item.plan.id === activeCustomId && (item.plan.mode ?? 'recurring') === activeCustomMode
        ) ??
        customPlans.find((item) => (item.plan.mode ?? 'recurring') === activeCustomMode) ??
        null;
  const isDeadlinePlan = customPlanState?.plan.mode === 'deadline';
  const customCategoryOption = {
    key: 'custom' as Category,
    label: customPlanState?.plan.title ?? '新建清单',
    icon: customPlanState?.plan.icon ?? '✨'
  };
  const categoryOptions: { key: Category; label: string; icon: string }[] = [
    ...CATEGORY_OPTIONS,
    ...(isDeadlinePlan ? [] : [customCategoryOption])
  ];
  const activeChecklist = checklistOf(list);
  const activeSkill = ENGLISH_SKILLS.find((item) => item.key === englishSkill);
  const customSkillDef = customPlanState?.plan.skills.find((item) => item.name === customSkill);
  useEffect(() => {
    if (!customPlanState) {
      return;
    }
    const names = customPlanState.plan.skills.map((item) => item.name);
    setCustomSkill((prev) => (names.includes(prev) ? prev : names[0] ?? ''));
  }, [customPlanState?.plan.id]);
  const headerIcon =
    tab === 'deadline' && !isDeadlinePlan
      ? '⏳'
      : list === 'english'
        ? activeSkill?.icon ?? activeChecklist.icon
        : list === 'custom'
          ? customSkillDef?.icon ?? customPlanState?.plan.icon ?? activeChecklist.icon
          : activeChecklist.icon;
  const headerName =
    tab === 'deadline' && !isDeadlinePlan
      ? '截止清单'
      : list === 'english'
        ? activeSkill?.label ?? activeChecklist.name
        : list === 'custom'
          ? customSkillDef?.name ?? customPlanState?.plan.title ?? activeChecklist.name
          : activeChecklist.name;
  const activeColor = tab === 'deadline' && !isDeadlinePlan ? feature.custom : feature[list];
  const isCheckTab = tab === 'check' || tab === 'deadline';
  const goRecord = (): void => {
    if (isDeadlinePlan) {
      setCategory('custom');
      setList('custom');
      setTab('deadline');
      return;
    }
    setTab('check');
  };
  const switchTab = (next: Tab): void => {
    if (next === 'deadline') {
      setCreatingCustomMode(null);
      setCategory('custom');
      setList('custom');
      setTab('deadline');
      return;
    }
    if (next === 'check') {
      setCreatingCustomMode(null);
      if (list === 'custom' && isDeadlinePlan) {
        setCategory('health');
        setList(enabledChecklists('health')[0] ?? 'water');
      }
    }
    setTab(next);
  };
  const panels = panelsOf(list);
  useEffect(() => {
    if (tab === 'check' && category === 'custom' && isDeadlinePlan) {
      setTab('deadline');
    }
  }, [tab, category, isDeadlinePlan]);
  const context = {
    snapshot,
    store,
    sportStore,
    isGuest,
    englishSkill,
    onChangeEnglishSkill: setEnglishSkill,
    customPlanState,
    onChangeCustomPlanState: updateCustomPlanState,
    customMode: activeCustomMode,
    customSkill,
    onChangeCustomSkill: setCustomSkill,
    authToken,
    onOpenProfile: () => setTab('profile'),
    onGoRecord: goRecord
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <IconBadge icon={headerIcon} accent={activeColor.main} size={28} />
          <UIText variant="h2" style={{ fontSize: 18, lineHeight: 22 }}>
            {headerName}
          </UIText>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="清单管理"
            onPress={() => setSettingsOpen(true)}
            style={({ pressed }) => [styles.settingsButton, pressed && { opacity: 0.7 }]}
          >
            <UIText variant="bodyStrong" tone="muted">⚙</UIText>
          </Pressable>
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

      {isCheckTab ? (
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
            options={categoryOptions}
            value={category}
            onChange={switchCategory}
            accent={palette.brand}
            style={styles.category}
          />
          {category === 'health' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listRow}
            style={styles.listScroll}
          >
            {checklistsOf(category).filter((item) => isListEnabled(item.key)).map((item) => {
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
          ) : null}
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
        {tab === 'deadline' ? panels.Today(context) : null}
        {tab === 'data' ? (
          <DataPage
            checklist={list}
            subTab={subTab}
            onChangeSubTab={changeSubTab}
            isGuest={isGuest}
            englishSkill={englishSkill}
            onChangeEnglishSkill={setEnglishSkill}
            customPlanState={customPlanState}
            onChangeCustomPlanState={updateCustomPlanState}
            customMode={activeCustomMode}
            customSkill={customSkill}
            onChangeCustomSkill={setCustomSkill}
            authToken={authToken}
            waterSnapshot={snapshot}
            waterStore={store}
            sportStore={sportStore}
            onGoRecord={goRecord}
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
            ['check', '重复', '↻'],
            ['deadline', '截止', '◷'],
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
              onPress={() => switchTab(key)}
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

      {settingsOpen ? (
        <CheckSettingsPanel
          enabled={enabledLists}
          customPlans={customPlans}
          mode={activeCustomMode}
          onToggle={toggleList}
          onOpenCustom={openCustomPlan}
          onDeleteCustom={deleteCustomPlan}
          onCreateCustom={startCreateCustom}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
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
  settingsButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceAlt
  },
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
