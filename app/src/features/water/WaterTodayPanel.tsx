import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { CheckSnapshot, CheckStore } from '../../check/checkStore';
import type { WaterUnit } from '../../model/waterUnits';
import { formatClock, formatMonthDay, formatNumber, weekdayOf } from '../../shared/format';
import { AchievementGrid, type AchievementItem } from '../../ui/AchievementGrid';
import { ProgressRing, RingLegend } from '../../ui/ProgressRing';
import {
  AppButton,
  EmptyState,
  IconBadge,
  PageScroll,
  Pill,
  SectionHeader,
  Sheet,
  StatTile,
  Surface,
  UIText
} from '../../ui/primitives';
import { palette, radius, useTheme } from '../../ui/theme';
import { MlSlider } from '../../components/MlSlider';

const PRESETS = [150, 200, 250, 350, 500];

function unitIcon(unit: WaterUnit): string {
  if (unit.id === 'unit_cup') return '🥛';
  if (unit.id === 'unit_bottle') return '🍶';
  if (unit.id === 'unit_ml') return '💧';
  return '🥤';
}

export function WaterTodayPanel({
  snapshot,
  store,
  onOpenProfile
}: {
  snapshot: CheckSnapshot;
  store: CheckStore;
  onOpenProfile?: () => void;
}): React.JSX.Element {
  const { feature } = useTheme();
  const water = feature.water;
  const [ml, setMl] = useState(250);
  const [unitModal, setUnitModal] = useState(false);
  const [unitName, setUnitName] = useState('');
  const [unitMl, setUnitMl] = useState('');
  const [unitError, setUnitError] = useState<string | null>(null);

  const ratio = snapshot.targetMl > 0 ? Math.min(1, snapshot.totalMl / snapshot.targetMl) : 0;
  const remaining = Math.max(0, snapshot.targetMl - snapshot.totalMl);
  const customUnits = snapshot.units.filter((unit) => unit.id !== 'unit_ml');

  const closeUnitModal = (): void => {
    setUnitModal(false);
    setUnitName('');
    setUnitMl('');
    setUnitError(null);
  };

  const addUnit = async (): Promise<void> => {
    const error = await store.addUnit(unitName, Number(unitMl));
    if (error) {
      setUnitError(error);
      return;
    }
    closeUnitModal();
  };

  return (
    <PageScroll testID="water-today">
      <Surface padding={0} radiusValue={radius.xl} style={{ overflow: 'hidden' }}>
        <View style={{ backgroundColor: water.wash, padding: 18 }}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Pill
                label={snapshot.achieved ? '今日已达标' : '今日进行中'}
                accent={snapshot.achieved ? palette.success : water.main}
                dot
              />
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 12 }}>
                <UIText variant="display" color={water.deep}>
                  {formatNumber(snapshot.totalMl)}
                </UIText>
                <UIText variant="small" tone="muted">
                  / {snapshot.targetMl > 0 ? formatNumber(snapshot.targetMl) : '—'} ml
                </UIText>
              </View>
              <UIText variant="small" tone="muted" style={{ marginTop: 2 }}>
                {snapshot.targetMl === 0
                  ? '完善身体档案后自动计算目标'
                  : remaining > 0
                    ? `再喝 ${formatNumber(remaining)} ml 就达成今天的目标`
                    : '目标完成，保持好状态'}
              </UIText>
            </View>
            <ProgressRing
              ratio={ratio}
              size={116}
              color={water.main}
              trackColor={`${water.main}16`}
              value={`${Math.round(ratio * 100)}`}
              unit="%"
              label="达成"
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <StatTile value={formatNumber(snapshot.cups)} unit="杯" label="今日杯数" accent={water.deep} />
            <StatTile value={snapshot.streak} unit="天" label="连续达标" accent={water.deep} />
            <StatTile
              value={snapshot.averageMl !== null ? `${(snapshot.averageMl / 1000).toFixed(1)}` : '—'}
              unit="L"
              label="日均饮水"
              accent={water.deep}
            />
          </View>
        </View>
      </Surface>

      {snapshot.targetMl === 0 ? (
        <Surface tone="soft" style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconBadge icon="🎯" accent={palette.brand} size={38} />
          <View style={{ flex: 1 }}>
            <UIText variant="bodyStrong">先设定你的今日目标</UIText>
            <UIText variant="caption" tone="muted" style={{ marginTop: 2 }}>
              填写身高、体重、出生日期，自动计算每日建议饮水量。
            </UIText>
          </View>
          {onOpenProfile ? <AppButton label="去完善" size="sm" variant="soft" onPress={onOpenProfile} /> : null}
        </Surface>
      ) : null}

      <SectionHeader title="快速记录" caption="点一下，立即记一杯" style={{ marginTop: 22 }} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingRight: 4 }}
      >
        {customUnits.map((unit) => (
          <Pressable
            key={unit.id}
            accessibilityRole="button"
            onPress={() => void store.logUnit(unit.id)}
            style={({ pressed }) => [styles.unitCard, pressed && { opacity: 0.72 }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <IconBadge icon={unitIcon(unit)} accent={water.main} size={34} />
              <View style={styles.plusDot}>
                <UIText variant="small" color={water.main} style={{ fontWeight: '800', marginTop: -1 }}>
                  +
                </UIText>
              </View>
            </View>
            <UIText variant="bodyStrong" numberOfLines={1} style={{ marginTop: 9, fontSize: 13 }}>
              {unit.name}
            </UIText>
            <UIText variant="caption" tone="muted" style={{ marginTop: 1 }}>
              {unit.ml} ml
            </UIText>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setUnitModal(true);
            setUnitError(null);
          }}
          style={({ pressed }) => [styles.unitCard, styles.unitCardAdd, pressed && { opacity: 0.72 }]}
        >
          <IconBadge icon="＋" accent={water.main} size={34} variant="outline" />
          <UIText variant="bodyStrong" style={{ marginTop: 9, fontSize: 13 }} color={water.main}>
            自定义
          </UIText>
          <UIText variant="caption" tone="muted" style={{ marginTop: 1 }}>
            常用杯子
          </UIText>
        </Pressable>
      </ScrollView>

      <Surface style={{ marginTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <UIText variant="label" color={water.main}>
              自定义份量
            </UIText>
            <UIText variant="h2" style={{ marginTop: 3 }}>
              + {ml} ml
            </UIText>
          </View>
          <IconBadge icon="💧" accent={water.main} size={42} />
        </View>
        <View style={{ marginTop: 10 }}>
          <MlSlider value={ml} onChange={setMl} accent={water.main} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {PRESETS.map((preset) => {
            const active = preset === ml;
            return (
              <Pressable
                key={preset}
                accessibilityRole="button"
                onPress={() => setMl(preset)}
                style={[styles.preset, active && { backgroundColor: water.tint, borderColor: water.main }]}
              >
                <UIText variant="caption" color={active ? water.deep : palette.muted} style={{ fontWeight: active ? '700' : '500' }}>
                  {preset} ml
                </UIText>
              </Pressable>
            );
          })}
        </View>
        <AppButton
          label={`记录 ${ml} ml`}
          icon="＋"
          fullWidth
          accent={water.main}
          onPress={() => void store.addWater(ml)}
          style={{ marginTop: 14 }}
          testID="commit-ml"
        />
      </Surface>

      <SectionHeader
        title="今日记录"
        caption={snapshot.totalMl > 0 ? `共 ${snapshot.records.length} 条 · ${formatMonthDay(snapshot.day)} ${weekdayOf(snapshot.day)}` : '今天还没有记录'}
        style={{ marginTop: 22 }}
      />
      {snapshot.records.length === 0 ? (
        <Surface tone="soft">
          <EmptyState
            icon="💧"
            title="从第一杯开始"
            message="记录会在本机/云端保存，随时可以撤销。"
            accent={water.main}
          />
        </Surface>
      ) : (
        <Surface padding={14}>
          {snapshot.records.map((record, index) => (
            <View
              key={record.recordId}
              style={[styles.recordRow, index < snapshot.records.length - 1 && styles.recordBorder]}
            >
              <IconBadge icon="💧" accent={water.main} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <UIText variant="bodyStrong">
                  {record.ml} ml
                  {record.unitName && record.amount ? (
                    <UIText variant="caption" tone="muted">
                      {'  '}
                      {record.amount} {record.unitName}
                    </UIText>
                  ) : null}
                </UIText>
                <UIText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  {formatClock(record.createdAt)}
                </UIText>
              </View>
              <Pressable accessibilityRole="button" onPress={() => void store.removeRecord(record.recordId)} hitSlop={8}>
                <UIText variant="caption" color={water.main} style={{ fontWeight: '700' }}>
                  撤销
                </UIText>
              </Pressable>
            </View>
          ))}
        </Surface>
      )}

      <RingLegend
        items={[
          { label: '今日目标', value: snapshot.targetMl > 0 ? `${formatNumber(snapshot.targetMl)} ml` : '待设置' },
          { label: '剩余', value: remaining > 0 ? `${formatNumber(remaining)} ml` : '已完成', color: water.main },
          { label: '连续', value: `${snapshot.streak} 天` }
        ]}
      />

      <Sheet
        visible={unitModal}
        onClose={closeUnitModal}
        title="自定义饮水单位"
        footer={
          <AppButton
            label="保存并使用"
            fullWidth
            accent={water.main}
            onPress={() => void addUnit()}
          />
        }
      >
        <UIText variant="small" tone="muted" style={{ marginBottom: 12 }}>
          记录始终以 ml 记账，单位只影响记录时的展示；容量范围 50–2000 ml。
        </UIText>
        <View style={styles.field}>
          <UIText variant="caption" tone="muted" style={styles.fieldLabel}>
            单位名称
          </UIText>
          <TextInput
            value={unitName}
            onChangeText={setUnitName}
            maxLength={12}
            placeholder="如 马克杯"
            placeholderTextColor={palette.faint}
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <UIText variant="caption" tone="muted" style={styles.fieldLabel}>
            容量 ml
          </UIText>
          <TextInput
            value={unitMl}
            onChangeText={setUnitMl}
            keyboardType="number-pad"
            placeholder="如 350"
            placeholderTextColor={palette.faint}
            style={styles.input}
          />
        </View>
        {unitError ? (
          <UIText variant="small" color={palette.danger} style={{ marginTop: 4 }}>
            {unitError}
          </UIText>
        ) : null}
      </Sheet>
    </PageScroll>
  );
}

export function WaterAchievementsPanel({ snapshot }: { snapshot: CheckSnapshot }): React.JSX.Element {
  const { feature } = useTheme();
  const water = feature.water;
  const achievedDays = snapshot.week.filter((day) => day.achieved).length;
  const early = snapshot.records.some((record) => {
    const clock = formatClock(record.createdAt);
    return clock.length === 5 && clock < '09:00';
  });
  const items: AchievementItem[] = [
    {
      key: 'first-cup',
      name: '第一杯',
      desc: '完成第一次饮水记录',
      icon: '💧',
      points: 10,
      unlocked: snapshot.records.length > 0 || snapshot.totalMl > 0,
      progress: snapshot.records.length > 0 || snapshot.totalMl > 0 ? 1 : 0,
      need: 1
    },
    {
      key: 'goal-today',
      name: '今日达标',
      desc: '完成当日饮水目标',
      icon: '🎯',
      points: 20,
      unlocked: snapshot.achieved,
      progress: snapshot.achieved ? 1 : 0,
      need: 1
    },
    {
      key: 'streak-3',
      name: '三日不断',
      desc: '连续 3 天完成目标',
      icon: '🔥',
      points: 30,
      unlocked: snapshot.streak >= 3,
      progress: Math.min(snapshot.streak, 3),
      need: 3
    },
    {
      key: 'streak-7',
      name: '一周好习惯',
      desc: '连续 7 天完成目标',
      icon: '🏅',
      points: 60,
      unlocked: snapshot.streak >= 7,
      progress: Math.min(snapshot.streak, 7),
      need: 7
    },
    {
      key: 'cups-8',
      name: '八杯水',
      desc: '单日完成 8 杯记录',
      icon: '🥛',
      points: 30,
      unlocked: snapshot.cups >= 8,
      progress: Math.min(snapshot.cups, 8),
      need: 8
    },
    {
      key: 'week-5',
      name: '本周五天',
      desc: '本周有 5 天达成目标',
      icon: '📅',
      points: 50,
      unlocked: achievedDays >= 5,
      progress: Math.min(achievedDays, 5),
      need: 5
    },
    {
      key: 'early-bird',
      name: '早起的杯子',
      desc: '在 09:00 前完成一次记录',
      icon: '🌅',
      points: 20,
      unlocked: early,
      progress: early ? 1 : 0,
      need: 1
    }
  ];
  return (
    <PageScroll>
      <Surface tone="soft" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <IconBadge icon="🏆" accent={water.main} size={44} />
        <View style={{ flex: 1 }}>
          <UIText variant="bodyStrong">饮水成就</UIText>
          <UIText variant="caption" tone="muted" style={{ marginTop: 2 }}>
            连续 {snapshot.streak} 天 · 本周 {achievedDays}/7 天达成
          </UIText>
        </View>
        <Pill label={`${items.filter((item) => item.unlocked).length}/${items.length}`} accent={water.main} tone="solid" />
      </Surface>
      <AchievementGrid groups={[{ name: '饮水里程碑', items }]} accent={water.main} />
    </PageScroll>
  );
}

const styles = StyleSheet.create({
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unitCard: {
    width: 108,
    minHeight: 116,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line
  },
  unitCardAdd: { borderStyle: 'dashed', backgroundColor: palette.surfaceAlt },
  plusDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center'
  },
  preset: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  recordBorder: { borderBottomWidth: 1, borderBottomColor: palette.line },
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
  }
});
