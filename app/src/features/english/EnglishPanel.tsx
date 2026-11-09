import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { DEFAULT_ENGLISH, loadEnglish, saveEnglish, type EnglishData } from '../../check/localData';
import { LineChart } from '../../components/LineChart';
import { ENGLISH_CHECKLIST_GROUPS, ENGLISH_ITEM_DEFAULTS, ENGLISH_ITEM_TARGETS, ENGLISH_SKILLS, type EnglishSkill } from '../../model/englishChecklist';
import { businessToday } from '../../model/waterGoal';
import { formatMonthDay } from '../../shared/format';
import { AchievementGrid, AchievementGroupNav, type AchievementItem } from '../../ui/AchievementGrid';
import { ProgressRing } from '../../ui/ProgressRing';
import {
  AppButton,
  IconBadge,
  PageScroll,
  Pill,
  ProgressBar,
  SectionHeader,
  Segmented,
  StatTile,
  Surface,
  UIText
} from '../../ui/primitives';
import { palette, radius, useTheme } from '../../ui/theme';

function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function safeNumber(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

const SKILL_UI: Record<
  EnglishSkill,
  {
    label: string;
    icon: string;
    heroTitle: string;
    unit: string;
    quickValues: number[];
    progressGroup: string;
    defaultTarget: number;
  }
> = {
  listening: {
    label: '听力',
    icon: '🎧',
    heroTitle: '今日听力',
    unit: '章',
    quickValues: [1, 2, 5],
    progressGroup: '听力',
    defaultTarget: 1
  },
  speaking: {
    label: '口语',
    icon: '🗣️',
    heroTitle: '今日口语',
    unit: '次',
    quickValues: [1, 3, 5],
    progressGroup: '口语',
    defaultTarget: 1
  },
  reading: {
    label: '词汇',
    icon: '📖',
    heroTitle: '今日词汇',
    unit: '词',
    quickValues: [5, 10, 20],
    progressGroup: '百词斩',
    defaultTarget: 20
  },
  writing: {
    label: '写作',
    icon: '✍️',
    heroTitle: '今日写作',
    unit: '篇',
    quickValues: [1, 2, 3],
    progressGroup: '写作',
    defaultTarget: 1
  }
};

function dailyMapFor(data: EnglishData, skill: EnglishSkill): Record<string, number> {
  return skill === 'reading' ? data.wordsByDay : data.dailyBySkill?.[skill] ?? {};
}

function skillStreakValue(
  data: EnglishData,
  skill: EnglishSkill,
  today: string,
  addDays: (day: string, delta: number) => string
): number {
  const daily = dailyMapFor(data, skill);
  let count = 0;
  let day = today;
  while ((daily[day] ?? 0) > 0) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}

export function EnglishPanel({
  tab,
  skill,
  onChangeSkill
}: {
  tab: 'today' | 'stats' | 'achievements' | 'profile';
  skill: EnglishSkill;
  onChangeSkill?: (skill: EnglishSkill) => void;
}): React.JSX.Element {
  const { feature } = useTheme();
  const english = feature.english;
  const [data, setData] = useState<EnglishData>(DEFAULT_ENGLISH);
  const [custom, setCustom] = useState('');
  const [target, setTarget] = useState('20');
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'warning' | 'success'>('warning');
  const [activeGroup, setActiveGroup] = useState(
    ENGLISH_CHECKLIST_GROUPS.find((group) => group.skill === 'reading')?.name ?? '百词斩'
  );
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [targetDraft, setTargetDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadEnglish().then((loaded) => {
      const itemProgress = { ...ENGLISH_ITEM_DEFAULTS, ...(loaded.itemProgress ?? {}) };
      const itemTargets = { ...ENGLISH_ITEM_TARGETS, ...(loaded.itemTargets ?? {}) };
      setData({ ...loaded, itemProgress, itemTargets });
      setTarget(String(loaded.target));
      const nextDraft: Record<string, string> = {};
      for (const [key, value] of Object.entries(itemProgress)) {
        nextDraft[key] = String(value);
      }
      setDraft(nextDraft);
      const nextTargetDraft: Record<string, string> = {};
      for (const [key, value] of Object.entries(itemTargets)) {
        nextTargetDraft[key] = String(value);
      }
      setTargetDraft(nextTargetDraft);
    });
  }, []);

  useEffect(() => {
    setTarget(
      String(
        skill === 'reading'
          ? data.target
          : data.targetsBySkill?.[skill] ?? SKILL_UI[skill].defaultTarget
      )
    );
  }, [skill, data.target, data.targetsBySkill]);

  const persist = (next: EnglishData): void => {
    setData(next);
    void saveEnglish(next);
  };

  const today = businessToday();
  const ui = SKILL_UI[skill];
  const dailyMap = dailyMapFor(data, skill);
  const todayWords = dailyMap[today] ?? 0;
  const skillTarget = skill === 'reading' ? data.target : data.targetsBySkill?.[skill] ?? ui.defaultTarget;
  const streak = skillStreakValue(data, skill, today, addDays);
  const ratio = Math.min(1, todayWords / Math.max(1, skillTarget));
  const skillLabel = ENGLISH_SKILLS.find((item) => item.key === skill)?.label ?? '读';
  const progressGroup = ENGLISH_CHECKLIST_GROUPS.find((group) => group.name === ui.progressGroup);
  const skillTotal = progressGroup
    ? Math.max(
        0,
        ...progressGroup.items.map(
          (item) => data.itemProgress?.[item.id] ?? ENGLISH_ITEM_DEFAULTS[item.id] ?? 0
        )
      )
    : 0;

  const allGroups = useMemo(
    () =>
      ENGLISH_CHECKLIST_GROUPS.map((group) => {
        const items: AchievementItem[] = group.items.map((definition) => {
          const progress = data.itemProgress?.[definition.id] ?? ENGLISH_ITEM_DEFAULTS[definition.id] ?? 0;
          const need = data.itemTargets?.[definition.id] ?? ENGLISH_ITEM_TARGETS[definition.id] ?? definition.need;
          return {
            key: definition.id,
            name: definition.name,
            desc: definition.desc,
            icon: definition.icon,
            points: definition.points,
            unlocked: progress >= need,
            progress,
            need
          };
        });
        return { name: group.name, skill: group.skill, items };
      }),
    [data]
  );

  const groups = allGroups.filter((group) => group.skill === skill);
  const selectedGroup = groups.find((group) => group.name === activeGroup) ?? groups[0];
  const selectedDefinitionGroup =
    ENGLISH_CHECKLIST_GROUPS.find((group) => group.name === activeGroup && group.skill === skill) ??
    ENGLISH_CHECKLIST_GROUPS.find((group) => group.skill === skill) ??
    ENGLISH_CHECKLIST_GROUPS[0];
  const unlockedCount = groups.reduce((sum, group) => sum + group.items.filter((item) => item.unlocked).length, 0);
  const achievementCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  const changeSkill = (next: EnglishSkill): void => {
    onChangeSkill?.(next);
    setActiveGroup(ENGLISH_CHECKLIST_GROUPS.find((group) => group.skill === next)?.name ?? '百词斩');
  };

  const skillNav = (
    <Segmented
      options={ENGLISH_SKILLS.map((item) => ({ key: item.key, label: item.label, icon: item.icon }))}
      value={skill}
      onChange={(key) => changeSkill(key as EnglishSkill)}
      accent={english.main}
      style={{ marginBottom: 14 }}
      compact
    />
  );

  const addRecord = (count: number): void => {
    if (!(count > 0 && count <= 500)) {
      setNoticeTone('warning');
      setNotice(`单次记录需在 1–500 ${ui.unit}之间`);
      return;
    }
    setNotice('');
    const nextProgress = { ...(data.itemProgress ?? {}) };
    if (skill === 'reading') {
      const nextTotal = skillTotal + count;
      for (const item of ENGLISH_CHECKLIST_GROUPS[0]?.items ?? []) {
        nextProgress[item.id] = Math.max(
          nextProgress[item.id] ?? ENGLISH_ITEM_DEFAULTS[item.id] ?? 0,
          nextTotal
        );
      }
      setDraft((current) => {
        const next = { ...current };
        for (const item of ENGLISH_CHECKLIST_GROUPS[0]?.items ?? []) {
          next[item.id] = String(nextProgress[item.id] ?? 0);
        }
        return next;
      });
      persist({
        ...data,
        wordsByDay: { ...data.wordsByDay, [today]: todayWords + count },
        itemProgress: nextProgress
      });
      return;
    }

    for (const item of progressGroup?.items ?? []) {
      nextProgress[item.id] =
        (nextProgress[item.id] ?? ENGLISH_ITEM_DEFAULTS[item.id] ?? 0) + count;
    }
    setDraft((current) => {
      const next = { ...current };
      for (const item of progressGroup?.items ?? []) {
        next[item.id] = String(nextProgress[item.id] ?? 0);
      }
      return next;
    });
    persist({
      ...data,
      dailyBySkill: {
        ...data.dailyBySkill,
        [skill]: {
          ...(data.dailyBySkill?.[skill] ?? {}),
          [today]: todayWords + count
        }
      },
      itemProgress: nextProgress
    });
  };

  const applyTarget = (): void => {
    const value = Math.round(safeNumber(target));
    if (value < 1 || value > 500) {
      setNoticeTone('warning');
      setNotice(`每日目标需在 1–500 ${ui.unit}之间`);
      return;
    }
    setNotice('');
    if (skill === 'reading') {
      persist({ ...data, target: value });
    } else {
      persist({
        ...data,
        targetsBySkill: {
          ...data.targetsBySkill,
          [skill]: value
        }
      });
    }
  };

  const saveGroupProgress = (): void => {
    if (!selectedDefinitionGroup) {
      return;
    }
    const nextProgress = { ...(data.itemProgress ?? {}) };
    const nextTargets = { ...(data.itemTargets ?? {}) };
    for (const item of selectedDefinitionGroup.items) {
      nextProgress[item.id] = Math.max(0, Math.round(safeNumber(draft[item.id] ?? '')));
      nextTargets[item.id] = Math.max(1, Math.round(safeNumber(targetDraft[item.id] ?? '')));
    }
    persist({ ...data, itemProgress: nextProgress, itemTargets: nextTargets });
    setNoticeTone('success');
    setNotice(`${selectedDefinitionGroup.name}进度已保存`);
  };

  const weekSeries = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(today, -(6 - index));
    return { day, label: day.slice(5), value: dailyMap[day] ?? 0 };
  });

  const progressEditor = (
    <>
        <SectionHeader title="进度管理" caption="每条清单独立记录，目标可逐条调整" style={{ marginTop: 22 }} />
        {groups.length > 1 ? (
          <AchievementGroupNav groups={groups} value={activeGroup} onChange={setActiveGroup} accent={english.main} />
        ) : null}
        <Surface>
          {selectedGroup?.items.map((item) => {
            const definition = selectedDefinitionGroup?.items.find((candidate) => candidate.id === item.key);
            const unit = definition?.unit ?? selectedDefinitionGroup?.unit ?? '';
            return (
              <View key={item.key} style={styles.progressRow}>
                <IconBadge icon={item.icon} accent={english.main} size={30} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <UIText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 13 }}>
                    {item.name}
                  </UIText>
                  <UIText variant="caption" tone="muted" numberOfLines={1}>
                    {item.desc}
                  </UIText>
                </View>
                <View style={styles.progressInputWrap}>
                  <TextInput
                    value={draft[item.key] ?? String(item.progress)}
                    onChangeText={(value) => setDraft((current) => ({ ...current, [item.key]: value }))}
                    keyboardType="number-pad"
                    style={styles.progressInput}
                    placeholder="0"
                    placeholderTextColor={palette.faint}
                  />
                  <UIText variant="caption" tone="faint">
                    /
                  </UIText>
                  <TextInput
                    value={targetDraft[item.key] ?? String(item.need)}
                    onChangeText={(value) => setTargetDraft((current) => ({ ...current, [item.key]: value }))}
                    keyboardType="number-pad"
                    style={styles.progressInput}
                    placeholder="目标"
                    placeholderTextColor={palette.faint}
                  />
                  <UIText variant="caption" tone="faint">
                    {unit}
                  </UIText>
                </View>
              </View>
            );
          })}
          <AppButton
            label={`保存${selectedDefinitionGroup?.name ?? ''}进度`}
            variant="soft"
            accent={english.main}
            onPress={saveGroupProgress}
            style={{ marginTop: 12 }}
          />
        </Surface>

    </>
  );

  if (tab === 'achievements') {
    return (
      <PageScroll>
       <Surface tone="soft" style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBadge icon="🏆" accent={english.main} size={44} />
            <View style={{ flex: 1 }}>
              <UIText variant="bodyStrong">{skillLabel}成就</UIText>
              <UIText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                累计 {skillTotal} {ui.unit} · 连续 {streak} 天
              </UIText>
            </View>
            <Pill label={`${unlockedCount}/${achievementCount}`} accent={english.main} tone="solid" />
          </View>
        </Surface>
        {groups.length > 1 ? (
          <AchievementGroupNav groups={groups} value={activeGroup} onChange={setActiveGroup} accent={english.main} />
        ) : null}
        <AchievementGrid groups={selectedGroup ? [selectedGroup] : []} accent={english.main} showHeader />
        {progressEditor}
      </PageScroll>
    );
  }

  if (tab === 'stats') {
    return (
      <PageScroll>
       <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatTile value={skillTotal} unit={ui.unit} label={`累计${ui.label}`} accent={english.deep} icon={ui.icon} />
          <StatTile value={streak} unit="天" label="连续打卡" accent={english.deep} icon="🔥" />
          <StatTile value={unlockedCount} unit="项" label="已解锁" accent={english.deep} icon="🏅" />
        </View>

        {notice ? (
          <Surface tone="soft" style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconBadge
              icon={noticeTone === 'success' ? '✓' : '!'}
              accent={noticeTone === 'success' ? palette.success : palette.warning}
              size={28}
            />
            <UIText
              variant="small"
              color={noticeTone === 'success' ? palette.success : palette.warning}
              style={{ flex: 1 }}
            >
              {notice}
            </UIText>
          </Surface>
        ) : null}

        <SectionHeader title={`${ui.label}近 7 天`} caption="每天一点点，积累看得见" style={{ marginTop: 22 }} />
        <Surface>
          <LineChart
            values={weekSeries.map((point) => point.value)}
            labels={weekSeries.map((point) => point.day.slice(8))}
            pointLabels={weekSeries.map((point) => formatMonthDay(point.day))}
            unit={ui.unit}
            target={skillTarget}
            accent={english.main}
          />
          <UIText variant="caption" tone="faint" style={{ marginTop: 8, textAlign: 'center' }}>
            虚线为每日目标 {skillTarget} {ui.unit}。
          </UIText>
        </Surface>

        <SectionHeader title="英语节奏" style={{ marginTop: 22 }} />
        <Surface tone="soft">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <UIText variant="bodyStrong">今日目标完成度</UIText>
            <Pill label={`${Math.round(ratio * 100)}%`} accent={english.main} tone="solid" />
          </View>
          <ProgressBar ratio={ratio} color={english.main} height={8} />
          <UIText variant="caption" tone="muted" style={{ marginTop: 8 }}>
            {todayWords >= skillTarget ? '今天的目标已经完成，可以适当超额。' : `还差 ${skillTarget - todayWords} ${ui.unit}完成今天的目标。`}
          </UIText>
        </Surface>
      </PageScroll>
    );
  }

  return (
    <PageScroll>
      {skillNav}
      <Surface padding={0} radiusValue={radius.xl} style={{ overflow: 'hidden' }}>
        <View style={{ backgroundColor: english.wash, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pill label={ui.heroTitle} accent={english.main} dot />
            <IconBadge icon={ui.icon} accent={english.main} size={38} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <UIText variant="display" color={english.deep}>
                  {todayWords}
                </UIText>
                <UIText variant="small" tone="muted">
                  / {skillTarget} {ui.unit}
                </UIText>
              </View>
              <UIText variant="small" tone="muted" style={{ marginTop: 2 }}>
                {todayWords >= skillTarget ? '今日目标已达成，保持节奏' : `还差 ${skillTarget - todayWords} ${ui.unit}`}
              </UIText>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Pill label={`连续 ${streak} 天`} accent={english.main} />
                <Pill label={`累计 ${skillTotal} ${ui.unit}`} accent={english.main} tone="outline" />
              </View>
            </View>
            <ProgressRing
              ratio={ratio}
              size={110}
              color={english.main}
              trackColor={`${english.main}16`}
              value={`${Math.round(ratio * 100)}`}
              unit="%"
              label="今日"
            />
          </View>
        </View>
      </Surface>

      {notice ? (
        <Surface tone="soft" style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <IconBadge
            icon={noticeTone === 'success' ? '✓' : '!'}
            accent={noticeTone === 'success' ? palette.success : palette.warning}
            size={28}
          />
          <UIText
            variant="small"
            color={noticeTone === 'success' ? palette.success : palette.warning}
            style={{ flex: 1 }}
          >
            {notice}
          </UIText>
        </Surface>
      ) : null}

      <SectionHeader title="快速记录" caption="学完一组就点一下" style={{ marginTop: 22 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {ui.quickValues.map((count) => (
          <Pressable
            key={count}
            accessibilityRole="button"
            onPress={() => addRecord(count)}
            style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.72 }]}
          >
            <UIText variant="h2" color={english.deep}>
              +{count}
            </UIText>
            <UIText variant="caption" tone="muted" style={{ marginTop: 1 }}>
              {ui.unit}
            </UIText>
          </Pressable>
        ))}
        <View style={[styles.quickCard, { flex: 1.4, paddingHorizontal: 10 }]}>
          <TextInput
            value={custom}
            onChangeText={setCustom}
            keyboardType="number-pad"
            placeholder="自定义"
            placeholderTextColor={palette.faint}
            style={styles.quickInput}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              addRecord(Math.round(safeNumber(custom)));
              setCustom('');
            }}
            hitSlop={6}
          >
            <UIText variant="caption" color={english.main} style={{ fontWeight: '700' }}>
              确认
            </UIText>
          </Pressable>
        </View>
      </View>

      <Surface style={{ marginTop: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <UIText variant="caption" tone="muted" style={styles.fieldLabel}>
              每日目标（{ui.unit}）
            </UIText>
            <TextInput
              value={target}
              onChangeText={setTarget}
              keyboardType="number-pad"
              style={styles.input}
              placeholder="20"
              placeholderTextColor={palette.faint}
            />
          </View>
          <AppButton label="保存目标" variant="soft" accent={english.main} onPress={applyTarget} style={{ marginTop: 16 }} />
        </View>
        <UIText variant="caption" tone="faint" style={{ marginTop: 8 }}>
          建议先定一个轻量目标，连续比单次数量更重要。
        </UIText>
      </Surface>

      <SectionHeader title="清单概览" caption="28 考研 + 六级" style={{ marginTop: 22 }} />
      <Surface tone="soft">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconBadge icon="🏆" accent={english.main} size={42} />
          <View style={{ flex: 1 }}>
            <UIText variant="bodyStrong">已解锁 {unlockedCount} / {achievementCount} 项</UIText>
            <UIText variant="caption" tone="muted" style={{ marginTop: 3 }}>
              每条清单独立记录，进度可在「洞察 / 成就」中维护
            </UIText>
          </View>
        </View>
      </Surface>

      <SectionHeader title={`${ui.label}近 7 天`} caption={`${ui.unit}趋势`} style={{ marginTop: 22 }} />
      <Surface>
        <LineChart
          values={weekSeries.map((point) => point.value)}
          labels={weekSeries.map((point) => point.day.slice(8))}
          pointLabels={weekSeries.map((point) => formatMonthDay(point.day))}
          unit={ui.unit}
          target={skillTarget}
          accent={english.main}
        />
      </Surface>
    </PageScroll>
  );
}

const styles = StyleSheet.create({
  quickCard: {
    flex: 1,
    minHeight: 62,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6
  },
  quickInput: {
    width: '100%',
    textAlign: 'center',
    fontSize: 13,
    color: palette.ink,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    marginBottom: 4
  },
  fieldLabel: { marginBottom: 5, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
    color: palette.ink
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  progressInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 7
  },
  progressInput: {
    width: 54,
    paddingVertical: 7,
    fontSize: 13,
    fontWeight: '700',
    color: palette.ink,
    textAlign: 'right'
  }
});
