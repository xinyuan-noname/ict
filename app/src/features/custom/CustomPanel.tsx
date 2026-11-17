import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { CustomPlanApi } from '../../api/customPlanApi';
import { saveCustomPlanState } from '../../check/customPlanStore';
import {
  createCustomPlanState,
  customSkillItems,
  type CustomAchievementItem,
  type CustomPlanMode,
  type CustomPlanState
} from '../../model/customPlan';
import { businessToday } from '../../model/waterGoal';
import { AchievementGrid, type AchievementItem } from '../../ui/AchievementGrid';
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

export interface CustomPanelProps {
  tab: 'today' | 'stats' | 'achievements';
  state: CustomPlanState | null;
  onChangeState: (state: CustomPlanState) => void;
  skill: string;
  onChangeSkill: (skill: string) => void;
  authToken?: string;
  isGuest: boolean;
  onNeedLogin?: () => void;
}

const API = new CustomPlanApi();

function toGridItems(items: CustomAchievementItem[]): AchievementItem[] {
  return items.map((item) => ({
    key: item.key,
    name: item.name,
    desc: item.desc,
    icon: item.icon,
    points: item.points,
    unlocked: item.progress >= item.need,
    progress: item.progress,
    need: item.need
  }));
}

function daysUntil(deadline: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return null;
  }
  const end = new Date(`${deadline}T23:59:59`).getTime();
  if (!Number.isFinite(end)) {
    return null;
  }
  return Math.ceil((end - Date.now()) / 86400000);
}

export function CustomPanel({
  tab,
  state,
  onChangeState,
  skill,
  onChangeSkill,
  authToken,
  isGuest,
  onNeedLogin
}: CustomPanelProps): React.JSX.Element {
  const { feature } = useTheme();
  const color = feature.custom;
  const [need, setNeed] = useState('');
  const [mode, setMode] = useState<CustomPlanMode>('recurring');
  const [deadlineInput, setDeadlineInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [editingPlan, setEditingPlan] = useState(false);
  const [editingProgress, setEditingProgress] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [targetDraft, setTargetDraft] = useState<Record<string, string>>({});

  const selectedSkill = state?.plan.skills.find((item) => item.name === skill) ?? state?.plan.skills[0];
  const items = state && selectedSkill ? customSkillItems(state, selectedSkill.name) : [];
  const today = businessToday();
  const todayCount = state && selectedSkill ? state.dailyBySkill[selectedSkill.name]?.[today] ?? 0 : 0;
  const target = state && selectedSkill ? state.targetsBySkill[selectedSkill.name] ?? 1 : 1;
  const total = items.length ? Math.max(...items.map((item) => item.progress)) : 0;
  const unlocked = items.filter((item) => item.progress >= item.need).length;

  useEffect(() => {
    const nextDraft: Record<string, string> = {};
    const nextTarget: Record<string, string> = {};
    for (const item of items) {
      nextDraft[item.key] = String(item.progress);
      nextTarget[item.key] = String(item.need);
    }
    setDraft(nextDraft);
    setTargetDraft(nextTarget);
  }, [selectedSkill?.name, state?.itemProgress, state?.itemTargets]);

  const update = (next: CustomPlanState): void => {
    onChangeState(next);
    void saveCustomPlanState(next);
  };

  const generate = async (): Promise<void> => {
    if (!need.trim()) {
      setError('先描述一下你想坚持什么');
      return;
    }
    if (isGuest || !authToken) {
      setError('登录后才能使用 AI 生成清单');
      return;
    }
    if (mode === 'deadline' && !/^\d{4}-\d{2}-\d{2}$/.test(deadlineInput)) {
      setError('请填写截止日期，格式 YYYY-MM-DD');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const result = await API.generate(authToken, need.trim(), mode, mode === 'deadline' ? deadlineInput : undefined);
      const plan = {
        ...result.plan,
        mode,
        deadline: mode === 'deadline' ? deadlineInput : undefined
      };
      const next = createCustomPlanState(plan);
      update(next);
      const first = plan.skills[0]?.name;
      if (first) {
        onChangeSkill(first);
      }
      setNeed('');
      setEditingPlan(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请稍后重试');
    } finally {
      setGenerating(false);
    }
  };

  const addRecord = (count: number): void => {
    if (!state || !selectedSkill) {
      return;
    }
    const next: CustomPlanState = {
      ...state,
      dailyBySkill: {
        ...state.dailyBySkill,
        [selectedSkill.name]: {
          ...(state.dailyBySkill[selectedSkill.name] ?? {}),
          [today]: todayCount + count
        }
      },
      itemProgress: { ...state.itemProgress }
    };
    const firstSeries = selectedSkill.series[0];
    if (firstSeries) {
      const keys = customSkillItems(state, selectedSkill.name)
        .filter((item) => item.key.startsWith(`${firstSeries.id}_`))
        .map((item) => item.key);
      for (const key of keys) {
        next.itemProgress[key] = (next.itemProgress[key] ?? 0) + count;
      }
    }
    update(next);
  };

  const saveProgress = (): void => {
    if (!state) {
      return;
    }
    const nextProgress = { ...state.itemProgress };
    const nextTargets = { ...state.itemTargets };
    for (const item of items) {
      nextProgress[item.key] = Math.max(0, Math.round(Number(draft[item.key]) || 0));
      nextTargets[item.key] = Math.max(1, Math.round(Number(targetDraft[item.key]) || item.need));
    }
    update({ ...state, itemProgress: nextProgress, itemTargets: nextTargets });
    setEditingProgress(false);
  };

  const skillOptions = state?.plan.skills.map((item) => ({ key: item.name, label: item.name, icon: item.icon })) ?? [];
  const skillTabs = skillOptions.length > 1 ? (
    <Segmented
      options={skillOptions}
      value={selectedSkill?.name ?? ''}
      onChange={onChangeSkill}
      accent={color.main}
      style={{ marginBottom: 14 }}
      compact
    />
  ) : null;

  if (!state || editingPlan) {
    return (
      <PageScroll>
        <Surface tone="soft" style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBadge icon="✨" accent={color.main} size={44} />
            <View style={{ flex: 1 }}>
              <UIText variant="bodyStrong">生成我的清单</UIText>
              <UIText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                一级标题、二级技能和成就都交给 AI 设计
              </UIText>
            </View>
          </View>
        </Surface>
        <Surface>
          <UIText variant="caption" tone="muted" style={styles.label}>
            清单类型
          </UIText>
          <Segmented
            options={[
              { key: 'recurring', label: '重复性' },
              { key: 'deadline', label: '截止性' }
            ]}
            value={mode}
            onChange={(value) => setMode(value as CustomPlanMode)}
            accent={color.main}
            compact
            style={{ marginBottom: 12 }}
          />
          {mode === 'deadline' ? (
            <View style={{ marginBottom: 12 }}>
              <UIText variant="caption" tone="muted" style={styles.label}>
                截止日期
              </UIText>
              <TextInput
                value={deadlineInput}
                onChangeText={setDeadlineInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={palette.faint}
                style={styles.dateInput}
                editable={!generating}
              />
            </View>
          ) : null}
          <UIText variant="caption" tone="muted" style={styles.label}>
            你想坚持什么？
          </UIText>
          <TextInput
            value={need}
            onChangeText={setNeed}
            multiline
            placeholder="例如：我想用 3 个月准备考研，每天学数学、英语和政治，帮我拆成清单和成就。"
            placeholderTextColor={palette.faint}
            style={styles.textarea}
            editable={!generating}
          />
          {error ? (
            <UIText variant="caption" color={palette.danger} style={{ marginTop: 8 }}>
              {error}
            </UIText>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            {state ? (
              <AppButton
                label="取消"
                variant="ghost"
                accent={color.main}
                onPress={() => {
                  setEditingPlan(false);
                  setError('');
                }}
                style={{ flex: 1 }}
              />
            ) : null}
            <AppButton
              label={generating ? '生成中…' : '生成清单'}
              variant="primary"
              accent={color.main}
              onPress={() => void generate()}
              disabled={generating}
              style={{ flex: 1.4 }}
            />
          </View>
          {isGuest ? (
            <Pressable accessibilityRole="button" onPress={onNeedLogin} style={{ marginTop: 12 }}>
              <UIText variant="caption" color={palette.brand} style={{ fontWeight: '700' }}>
                游客无法调用 AI，点这里登录
              </UIText>
            </Pressable>
          ) : null}
        </Surface>
      </PageScroll>
    );
  }

  const plan = state.plan;
  const gridItems = toGridItems(items);
  const unit = selectedSkill?.unit ?? '次';
  const isDeadline = plan.mode === 'deadline';
  const doneCount = items.filter((item) => item.progress >= item.need).length;
  const deadlineDays = plan.deadline ? daysUntil(plan.deadline) : null;

  const toggleDeadlineItem = (item: CustomAchievementItem): void => {
    if (!state) {
      return;
    }
    update({
      ...state,
      itemProgress: {
        ...state.itemProgress,
        [item.key]: item.progress >= item.need ? 0 : item.need
      }
    });
  };

  if (isDeadline) {
    return (
      <PageScroll>
        {skillTabs}
        <Surface padding={0} radiusValue={radius.xl} style={{ overflow: 'hidden' }}>
          <View style={{ backgroundColor: color.wash, padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pill label="截止性" accent={color.main} dot />
              <IconBadge icon={plan.icon} accent={color.main} size={38} />
            </View>
            <UIText variant="h2" color={color.deep} style={{ marginTop: 10 }}>
              {plan.title}
            </UIText>
            <UIText variant="caption" tone="muted" style={{ marginTop: 4 }}>
              {plan.description}
            </UIText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <Pill
                label={
                  deadlineDays === null
                    ? `截止 ${plan.deadline ?? '未设置'}`
                    : deadlineDays >= 0
                      ? `剩余 ${deadlineDays} 天`
                      : `已截止 ${Math.abs(deadlineDays)} 天`
                }
                accent={color.main}
                tone={deadlineDays !== null && deadlineDays < 0 ? 'solid' : 'tint'}
              />
              <Pill label={`完成 ${doneCount}/${items.length}`} accent={color.main} tone="outline" />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 }}>
              <View style={{ flex: 1 }}>
                <ProgressBar ratio={doneCount / Math.max(1, items.length)} color={color.main} height={8} />
                <UIText variant="caption" tone="faint" style={{ marginTop: 8 }}>
                  勾选完成的事项，不再按天重复。
                </UIText>
              </View>
              <ProgressRing
                ratio={doneCount / Math.max(1, items.length)}
                size={92}
                color={color.main}
                trackColor={`${color.main}16`}
                value={`${doneCount}/${items.length}`}
                unit=""
                label="完成"
              />
            </View>
          </View>
        </Surface>

        <SectionHeader title="截止事项" caption={`${selectedSkill?.name ?? ''} · ${unit}`} style={{ marginTop: 22 }} />
        <Surface>
          {items.map((item) => {
            const done = item.progress >= item.need;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                onPress={() => toggleDeadlineItem(item)}
                style={({ pressed }) => [styles.deadlineRow, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.checkbox, done && { backgroundColor: color.main, borderColor: color.main }]}>
                  {done ? <UIText variant="caption" color="#FFFFFF" style={{ fontWeight: '800' }}>✓</UIText> : null}
                </View>
                <IconBadge icon={item.icon} accent={color.main} size={30} />
                <View style={{ flex: 1 }}>
                  <UIText variant="bodyStrong" style={{ fontSize: 13 }}>{item.name}</UIText>
                  <UIText variant="caption" tone="muted" numberOfLines={1}>{item.desc}</UIText>
                </View>
                <UIText variant="caption" color={done ? palette.success : palette.faint} style={{ fontWeight: '700' }}>
                  {done ? '已完成' : '未完成'}
                </UIText>
              </Pressable>
            );
          })}
        </Surface>

        <AppButton
          label="重新生成清单"
          variant="ghost"
          accent={color.main}
          onPress={() => setEditingPlan(true)}
          style={{ marginTop: 18 }}
        />
      </PageScroll>
    );
  }

  if (tab === 'achievements') {
    return (
      <PageScroll>
        <Surface tone="soft" style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBadge icon="🏆" accent={color.main} size={44} />
            <View style={{ flex: 1 }}>
              <UIText variant="bodyStrong">{selectedSkill?.name ?? skill}成就</UIText>
              <UIText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                {isDeadline
                  ? `完成 ${doneCount}/${items.length} · 截止 ${plan.deadline ?? '未设置'}`
                  : `今日 ${todayCount} ${unit} · 已解锁 ${unlocked}/${items.length}`}
              </UIText>
            </View>
            <Pill label={`${unlocked}/${items.length}`} accent={color.main} tone="solid" />
          </View>
        </Surface>
        {editingProgress ? (
          <Surface style={{ marginTop: 8 }}>
            {items.map((item) => (
              <View key={item.key} style={styles.progressRow}>
                <IconBadge icon={item.icon} accent={color.main} size={28} />
                <UIText variant="caption" numberOfLines={1} style={{ flex: 1 }}>
                  {item.name}
                </UIText>
                <TextInput
                  value={draft[item.key] ?? String(item.progress)}
                  onChangeText={(value) => setDraft((current) => ({ ...current, [item.key]: value }))}
                  keyboardType="number-pad"
                  style={styles.progressInput}
                />
                <UIText variant="caption" tone="faint">/</UIText>
                <TextInput
                  value={targetDraft[item.key] ?? String(item.need)}
                  onChangeText={(value) => setTargetDraft((current) => ({ ...current, [item.key]: value }))}
                  keyboardType="number-pad"
                  style={styles.progressInput}
                />
                <UIText variant="caption" tone="faint">{item.unit}</UIText>
              </View>
            ))}
            <AppButton
              label="保存进度"
              variant="soft"
              accent={color.main}
              onPress={saveProgress}
              style={{ marginTop: 10 }}
            />
          </Surface>
        ) : (
          <>
            <AchievementGrid
              groups={[{ name: selectedSkill?.name ?? '成就', items: gridItems }]}
              accent={color.main}
              showHeader
            />
            <AppButton
              label="修改进度 / 目标"
              variant="soft"
              accent={color.main}
              onPress={() => setEditingProgress(true)}
              style={{ marginTop: 18 }}
            />
          </>
        )}
      </PageScroll>
    );
  }

  if (tab === 'stats') {
    return (
      <PageScroll>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatTile
            value={isDeadline ? doneCount : todayCount}
            unit={isDeadline ? '项' : unit}
            label={isDeadline ? '已完成' : '今日'}
            accent={color.deep}
            icon={selectedSkill?.icon ?? '✨'}
          />
          <StatTile
            value={isDeadline ? Math.max(0, deadlineDays ?? 0) : total}
            unit={isDeadline ? '天' : unit}
            label={isDeadline ? '剩余天数' : '最高进度'}
            accent={color.deep}
            icon={isDeadline ? '⏳' : '📈'}
          />
          <StatTile
            value={isDeadline ? items.length : unlocked}
            unit="项"
            label={isDeadline ? '总事项' : '已解锁'}
            accent={color.deep}
            icon={isDeadline ? '🗂️' : '🏅'}
          />
        </View>
        <SectionHeader title="清单结构" caption={plan.description} style={{ marginTop: 22 }} />
        <Surface>
          {plan.skills.map((item) => (
            <View key={item.name} style={styles.skillRow}>
              <IconBadge icon={item.icon} accent={color.main} size={30} />
              <View style={{ flex: 1 }}>
                <UIText variant="bodyStrong">{item.name}</UIText>
                <UIText variant="caption" tone="muted">
                  {item.series.length} 个成就序列 · 单位 {item.unit}
                </UIText>
              </View>
            </View>
          ))}
        </Surface>
        <AppButton
          label="重新生成清单"
          variant="ghost"
          accent={color.main}
          onPress={() => setEditingPlan(true)}
          style={{ marginTop: 18 }}
        />
      </PageScroll>
    );
  }

  return (
    <PageScroll>
      {skillTabs}
      <Surface padding={0} radiusValue={radius.xl} style={{ overflow: 'hidden' }}>
        <View style={{ backgroundColor: color.wash, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pill label={plan.title} accent={color.main} dot />
            <IconBadge icon={selectedSkill?.icon ?? plan.icon} accent={color.main} size={38} />
          </View>
          <UIText variant="caption" tone="muted" style={{ marginTop: 8 }}>
            {plan.description}
          </UIText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <UIText variant="display" color={color.deep}>
                  {todayCount}
                </UIText>
                <UIText variant="small" tone="muted">
                  / {target} {unit}
                </UIText>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pill label={`${selectedSkill?.name ?? ''} · ${unlocked}/${items.length}`} accent={color.main} />
                <Pill label={`最高 ${total} ${unit}`} accent={color.main} tone="outline" />
              </View>
            </View>
            <ProgressRing
              ratio={Math.min(1, todayCount / Math.max(1, target))}
              size={100}
              color={color.main}
              trackColor={`${color.main}16`}
              value={`${Math.round(Math.min(1, todayCount / Math.max(1, target)) * 100)}`}
              unit="%"
              label="今日"
            />
          </View>
        </View>
      </Surface>

      <SectionHeader title="快速记录" caption={`${selectedSkill?.name ?? ''} · 单位 ${unit}`} style={{ marginTop: 22 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 2, 5].map((count) => (
          <Pressable
            key={count}
            accessibilityRole="button"
            onPress={() => addRecord(count)}
            style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.72 }]}
          >
            <UIText variant="h2" color={color.deep}>
              +{count}
            </UIText>
            <UIText variant="caption" tone="muted">
              {unit}
            </UIText>
          </Pressable>
        ))}
      </View>

      <SectionHeader title="清单概览" caption={plan.title} style={{ marginTop: 22 }} />
      <Surface>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconBadge icon={plan.icon} accent={color.main} size={42} />
          <View style={{ flex: 1 }}>
            <UIText variant="bodyStrong">{plan.title}</UIText>
            <UIText variant="caption" tone="muted" style={{ marginTop: 3 }}>
              {plan.skills.map((item) => item.name).join(' / ')}
            </UIText>
          </View>
        </View>
        <ProgressBar ratio={Math.min(1, unlocked / Math.max(1, items.length))} color={color.main} height={7} />
      </Surface>

      <AppButton
        label="重新生成清单"
        variant="ghost"
        accent={color.main}
        onPress={() => setEditingPlan(true)}
        style={{ marginTop: 18 }}
      />
    </PageScroll>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6, fontWeight: '700' },
  textarea: {
    minHeight: 112,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    color: palette.ink,
    textAlignVertical: 'top'
  },
  skillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  quickCard: {
    flex: 1,
    minHeight: 68,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  progressInput: {
    width: 48,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 12,
    color: palette.ink,
    textAlign: 'right'
  },
  dateInput: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.ink
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: palette.faint,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface
  }
});
