import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  MED_SLOTS,
  loadMedication,
  medStreak,
  medTodayDone,
  medViews,
  saveMedication,
  type DoseView,
  type MedDose,
  type MedItem
} from '../../check/localData';
import { LineChart } from '../../components/LineChart';
import { businessToday } from '../../model/waterGoal';
import { formatMonthDay, weekdayOf } from '../../shared/format';
import { AchievementGrid, type AchievementItem } from '../../ui/AchievementGrid';
import {
  AppButton,
  EmptyState,
  IconBadge,
  PageScroll,
  Pill,
  ProgressBar,
  SectionHeader,
  Sheet,
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

function statusMeta(view: DoseView): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted'; icon: string } {
  if (view.status === 'taken') return { label: '已打卡', tone: 'success', icon: '✓' };
  if (view.status === 'late') return { label: '补打完成', tone: 'success', icon: '✓' };
  if (view.status === 'missed') return { label: '已错过', tone: 'danger', icon: '!' };
  return { label: '待打卡', tone: 'muted', icon: '○' };
}

const toneColor = {
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
  muted: palette.muted
} as const;

const MED_ACHIEVEMENTS = [
  { id: 'med_daily', name: '今日全部打卡', desc: '当日所有药物按时打卡', icon: '✅', need: 1, kind: 'today', points: 20 },
  { id: 'med_streak3', name: '连续服药 3 天', desc: '连续 3 天全部打卡', icon: '🔥', need: 3, kind: 'streak', points: 40 },
  { id: 'med_streak7', name: '连续服药 7 天', desc: '连续 7 天全部打卡', icon: '🏅', need: 7, kind: 'streak', points: 60 },
  { id: 'med_streak30', name: '连续服药 30 天', desc: '连续 30 天全部打卡', icon: '👑', need: 30, kind: 'streak', points: 120 },
  { id: 'med_items_3', name: '三种药物', desc: '同时管理 3 种药物', icon: '💊', need: 3, kind: 'items', points: 30 },
  { id: 'med_doses_50', name: '累计 50 次', desc: '累计完成 50 次服药', icon: '📈', need: 50, kind: 'doses', points: 80 },
  { id: 'med_doses_200', name: '累计 200 次', desc: '累计完成 200 次服药', icon: '🏆', need: 200, kind: 'doses', points: 110 }
] as const;

export function MedicationPanel({ tab }: { tab: 'today' | 'stats' | 'achievements' | 'profile' }): React.JSX.Element {
  const { feature } = useTheme();
  const med = feature.medication;
  const [items, setItems] = useState<MedItem[]>([]);
  const [doses, setDoses] = useState<MedDose[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [formView, setFormView] = useState(false);
  const [formError, setFormError] = useState('');
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [slots, setSlots] = useState<string[]>(['morning', 'noon']);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void loadMedication().then(({ items: nextItems, doses: nextDoses }) => {
      setItems(nextItems);
      setDoses(nextDoses);
    });
  }, []);

  const persist = (nextItems: MedItem[], nextDoses: MedDose[]): void => {
    setItems(nextItems);
    setDoses(nextDoses);
    void saveMedication(nextItems, nextDoses);
  };

  const nowHour = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
  const today = businessToday();
  const views = medViews(items, doses, today, nowHour);
  const taken = views.filter((view) => view.status === 'taken' || view.status === 'late').length;
  const streak = medStreak(items, doses, addDays);
  const activeItems = items.filter((item) => item.status === 'active');
  const totalDoses = doses.length;

  const takeDose = (view: DoseView): void => {
    persist(items, [
      ...doses,
      {
        id: `dose_${Date.now()}`,
        itemId: view.itemId,
        day: today,
        slot: view.slot,
        late: view.status === 'missed'
      }
    ]);
  };
  const cancelDose = (doseId: string): void => {
    persist(items, doses.filter((dose) => dose.id !== doseId));
  };

  const openForm = (): void => {
    setFormView(true);
    setFormError('');
  };
  const closeForm = (): void => {
    setFormView(false);
    setName('');
    setDosage('');
    setSlots(['morning', 'noon']);
    setFormError('');
  };
  const addMed = (): void => {
    if (!name.trim() || !dosage.trim() || slots.length === 0) {
      setFormError('药名、剂量与至少一个时段必填');
      return;
    }
    persist(
      [...items, { id: `med_${Date.now()}`, name: name.trim(), dosage: dosage.trim(), slots, status: 'active' }],
      doses
    );
    setNotice('已添加药物，按计划打卡即可');
    closeForm();
  };
  const stopMed = (id: string): void => {
    persist(items.map((item) => (item.id === id ? { ...item, status: 'stopped' } : item)), doses);
  };

  if (tab === 'stats') {
    const days = Array.from({ length: 7 }, (_, index) => {
      const day = addDays(today, -(6 - index));
      const dayViews = medViews(items, doses, day, 23);
      const dayTaken = dayViews.filter((view) => view.status === 'taken' || view.status === 'late').length;
      return {
        day,
        rate: dayViews.length > 0 ? Math.round((dayTaken / dayViews.length) * 100) : 0
      };
    });
    return (
      <PageScroll>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatTile value={streak} unit="天" label="连续完成" accent={med.deep} icon="🔥" />
          <StatTile value={totalDoses} unit="次" label="累计服药" accent={med.deep} icon="💊" />
          <StatTile value={activeItems.length} unit="种" label="在服药物" accent={med.deep} icon="📋" />
        </View>
        <SectionHeader title="近 7 天完成率" caption="按每日计划次数计算" style={{ marginTop: 22 }} />
        <Surface>
          <LineChart
            values={days.map((day) => day.rate)}
            labels={days.map((day) => day.day.slice(5).slice(3))}
            pointLabels={days.map((day) => day.day)}
            unit="%"
            target={100}
            accent={med.main}
          />
          <UIText variant="caption" tone="faint" style={{ marginTop: 8, textAlign: 'center' }}>
            虚线为 100% 目标；无药物计划的日期按 0% 计。
          </UIText>
        </Surface>
        <SectionHeader title="近期记录" caption="最近 7 天" style={{ marginTop: 22 }} />
        <Surface padding={14}>
          {days
            .slice()
            .reverse()
            .map((day, index) => (
              <View key={day.day} style={[styles.recordRow, index < days.length - 1 && styles.recordBorder]}>
                <UIText variant="small" tone="muted" style={{ width: 78 }}>
                  {formatMonthDay(day.day)} {weekdayOf(day.day)}
                </UIText>
                <ProgressBar ratio={day.rate / 100} color={med.main} height={5} style={{ flex: 1 }} />
                <UIText variant="caption" color={day.rate >= 100 ? med.deep : palette.muted} style={{ width: 40, textAlign: 'right' }}>
                  {day.rate}%
                </UIText>
              </View>
            ))}
        </Surface>
      </PageScroll>
    );
  }

  if (tab === 'achievements') {
    const achievementItems: AchievementItem[] = MED_ACHIEVEMENTS.map((achievement) => {
      const progress =
        achievement.kind === 'today'
          ? medTodayDone(items, doses, nowHour)
            ? 1
            : 0
          : achievement.kind === 'streak'
            ? streak
            : achievement.kind === 'items'
              ? activeItems.length
              : totalDoses;
      return {
        key: achievement.id,
        name: achievement.name,
        desc: achievement.desc,
        icon: achievement.icon,
        points: achievement.points,
        unlocked: progress >= achievement.need,
        progress,
        need: achievement.need
      };
    });
    return (
      <PageScroll>
        <Surface tone="soft" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <IconBadge icon="🏆" accent={med.main} size={44} />
          <View style={{ flex: 1 }}>
            <UIText variant="bodyStrong">服药成就</UIText>
            <UIText variant="caption" tone="muted" style={{ marginTop: 2 }}>
              连续 {streak} 天 · 累计 {totalDoses} 次
            </UIText>
          </View>
          <Pill label={`${achievementItems.filter((item) => item.unlocked).length}/${achievementItems.length}`} accent={med.main} tone="solid" />
        </Surface>
        <AchievementGrid groups={[{ name: '服药里程碑', items: achievementItems }]} accent={med.main} />
      </PageScroll>
    );
  }

  const grouped = MED_SLOTS.map(([slot, label]) => ({
    slot,
    label,
    items: views.filter((view) => view.slot === slot)
  })).filter((group) => group.items.length > 0);
  const ratio = views.length > 0 ? taken / views.length : 0;

  return (
    <>
      <PageScroll>
        {notice ? (
          <Surface tone="soft" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <IconBadge icon="✓" accent={med.main} size={28} />
            <UIText variant="small" color={med.deep} style={{ flex: 1 }}>
              {notice}
            </UIText>
            <Pressable accessibilityRole="button" onPress={() => setNotice('')} hitSlop={8}>
              <UIText variant="caption" tone="muted">
                收起
              </UIText>
            </Pressable>
          </Surface>
        ) : null}

        <Surface padding={0} radiusValue={radius.xl} style={{ overflow: 'hidden' }}>
          <View style={{ backgroundColor: med.wash, padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pill label="今日服药" accent={med.main} dot />
              <IconBadge icon="💊" accent={med.main} size={38} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 10 }}>
              <UIText variant="display" color={med.deep}>
                {taken}
              </UIText>
              <UIText variant="h2" tone="muted">
                / {views.length} 次
              </UIText>
            </View>
            <UIText variant="small" tone="muted" style={{ marginTop: 2 }}>
              {views.length === 0
                ? '还没有药物计划，添加后按四个时段打卡'
                : ratio >= 1
                  ? '今日计划全部完成，做得很好'
                  : `还有 ${views.length - taken} 次待打卡`}
            </UIText>
            <ProgressBar ratio={ratio} color={med.main} height={8} style={{ marginTop: 14 }} />
            {views.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <StatTile value={`${Math.round(ratio * 100)}`} unit="%" label="完成率" accent={med.deep} />
                <StatTile value={streak} unit="天" label="连续完成" accent={med.deep} />
                <StatTile value={activeItems.length} unit="种" label="在服药物" accent={med.deep} />
              </View>
            ) : null}
          </View>
        </Surface>

        <SectionHeader
          title="今日安排"
          caption={`${formatMonthDay(today)} ${weekdayOf(today)} · 按时间顺序`}
          actionLabel="管理药物"
          onAction={() => {
            setFormView(false);
            setManageOpen(true);
          }}
          style={{ marginTop: 22 }}
        />

        {views.length === 0 ? (
          <Surface tone="soft" style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <IconBadge icon="💊" accent={med.main} size={40} />
            <View style={{ flex: 1 }}>
              <UIText variant="bodyStrong">添加第一种药物</UIText>
              <UIText variant="caption" tone="muted" style={{ marginTop: 2, lineHeight: 16 }}>
                设置药名、剂量与时段，之后每天按计划打卡。
              </UIText>
            </View>
            <AppButton
              label="新增"
              size="sm"
              variant="soft"
              accent={med.main}
              onPress={() => {
                setManageOpen(true);
                setFormView(true);
              }}
            />
          </Surface>
        ) : (
          <View style={{ gap: 14 }}>
            {grouped.map((group) => (
              <View key={group.slot}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: med.main }} />
                  <UIText variant="caption" color={med.deep} style={{ fontWeight: '700' }}>
                    {group.label}
                  </UIText>
                  <View style={{ flex: 1, height: 1, backgroundColor: palette.line }} />
                  <UIText variant="caption" tone="faint">
                    {group.items.filter((view) => view.status === 'taken' || view.status === 'late').length}/{group.items.length}
                  </UIText>
                </View>
                <View style={{ gap: 8 }}>
                  {group.items.map((view) => {
                    const meta = statusMeta(view);
                    const color = toneColor[meta.tone];
                    const done = view.status === 'taken' || view.status === 'late';
                    return (
                      <Surface key={`${view.itemId}-${view.slot}`} padding={12} radiusValue={radius.md}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                          <View
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 19,
                              borderWidth: 1.5,
                              borderColor: `${color}55`,
                              backgroundColor: `${color}12`,
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <UIText variant="bodyStrong" color={color}>
                              {meta.icon}
                            </UIText>
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <UIText variant="bodyStrong" numberOfLines={1}>
                              {view.name}
                            </UIText>
                            <UIText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                              {view.dosage} · {group.label}
                            </UIText>
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 7 }}>
                            <Pill label={meta.label} accent={color} tone={done ? 'tint' : 'outline'} />
                            {done ? (
                              <Pressable accessibilityRole="button" onPress={() => view.doseId && cancelDose(view.doseId)} hitSlop={8}>
                                <UIText variant="caption" tone="muted">
                                  撤回
                                </UIText>
                              </Pressable>
                            ) : (
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => takeDose(view)}
                                style={[styles.takeButton, { backgroundColor: `${med.main}12`, borderColor: `${med.main}45` }]}
                              >
                                <UIText variant="caption" color={med.deep} style={{ fontWeight: '700' }}>
                                  {view.status === 'missed' ? '补打' : '打卡'}
                                </UIText>
                              </Pressable>
                            )}
                          </View>
                        </View>
                      </Surface>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}

        <AppButton
          label="管理药物与计划"
          variant="secondary"
          accent={med.main}
          fullWidth
          icon="⚙"
          onPress={() => {
            setFormView(false);
            setManageOpen(true);
          }}
          style={{ marginTop: 16 }}
        />
        <UIText variant="caption" tone="faint" align="center" style={{ marginTop: 14 }}>
          服药提醒仅用于个人记录，不替代医生处方与用药建议。
        </UIText>
      </PageScroll>

      <Sheet
        visible={manageOpen}
        onClose={() => {
          setManageOpen(false);
          closeForm();
        }}
        title={formView ? '新增药物' : '药物管理'}
        footer={
          formView ? (
            <AppButton label="添加药物" fullWidth accent={med.main} onPress={addMed} />
          ) : (
            <AppButton label="＋ 新增药物" fullWidth accent={med.main} onPress={openForm} />
          )
        }
      >
        {formView ? (
          <View>
            <View style={styles.field}>
              <UIText variant="caption" tone="muted" style={styles.fieldLabel}>
                药名
              </UIText>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="如 维生素D"
                placeholderTextColor={palette.faint}
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <UIText variant="caption" tone="muted" style={styles.fieldLabel}>
                剂量
              </UIText>
              <TextInput
                value={dosage}
                onChangeText={setDosage}
                placeholder="如 1 粒 / 5 ml"
                placeholderTextColor={palette.faint}
                style={styles.input}
              />
            </View>
            <UIText variant="caption" tone="muted" style={styles.fieldLabel}>
              服用时段
            </UIText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {MED_SLOTS.map(([key, label]) => {
                const active = slots.includes(key);
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    onPress={() => setSlots((prev) => (prev.includes(key) ? prev.filter((slot) => slot !== key) : [...prev, key]))}
                    style={[
                      styles.slotChip,
                      active && { backgroundColor: med.tint, borderColor: med.main }
                    ]}
                  >
                    <UIText variant="caption" color={active ? med.deep : palette.muted} style={{ fontWeight: active ? '700' : '500' }}>
                      {label}
                    </UIText>
                  </Pressable>
                );
              })}
            </View>
            {formError ? (
              <UIText variant="small" color={palette.danger} style={{ marginTop: 10 }}>
                {formError}
              </UIText>
            ) : null}
            <AppButton
              label="返回药物列表"
              variant="ghost"
              accent={med.main}
              onPress={closeForm}
              style={{ marginTop: 6 }}
            />
          </View>
        ) : (
          <View>
            {items.length === 0 ? (
              <EmptyState icon="💊" title="还没有药物条目" message="添加药物后，会在今日安排里生成打卡项。" accent={med.main} />
            ) : (
              <View style={{ gap: 10 }}>
                {items.map((item) => (
                  <Surface key={item.id} tone="soft" padding={12} radiusValue={radius.md}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <UIText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                        {item.name}
                      </UIText>
                      <Pill
                        label={item.status === 'active' ? '服用中' : '已停用'}
                        accent={item.status === 'active' ? med.main : palette.muted}
                      />
                    </View>
                    <UIText variant="caption" tone="muted" style={{ marginTop: 3 }}>
                      {item.dosage} · {item.slots.map((slot) => MED_SLOTS.find(([key]) => key === slot)?.[1]).filter(Boolean).join(' / ')}
                    </UIText>
                    <AppButton
                      label={item.status === 'active' ? '停用' : '已停用'}
                      variant="ghost"
                      accent={item.status === 'active' ? palette.muted : palette.faint}
                      size="sm"
                      disabled={item.status !== 'active'}
                      onPress={() => stopMed(item.id)}
                      style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 0 }}
                    />
                  </Surface>
                ))}
              </View>
            )}
          </View>
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  recordBorder: { borderBottomWidth: 1, borderBottomColor: palette.line },
  takeButton: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  field: { marginBottom: 12 },
  fieldLabel: { marginBottom: 5, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.ink
  },
  slotChip: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7
  }
});
