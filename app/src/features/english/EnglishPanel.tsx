import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { DEFAULT_ENGLISH, loadEnglish, saveEnglish, type EnglishData } from '../../check/localData';
import { LineChart } from '../../components/LineChart';
import {
  ENGLISH_ACHIEVEMENTS,
  ENGLISH_TOTAL_POINTS,
  englishAchievementState,
  englishStreak,
  englishTotal
} from '../../model/english';
import { businessToday } from '../../model/waterGoal';
import { formatMonthDay } from '../../shared/format';
import { AchievementGrid, type AchievementItem } from '../../ui/AchievementGrid';
import { ProgressRing } from '../../ui/ProgressRing';
import {
  AppButton,
  IconBadge,
  PageScroll,
  Pill,
  ProgressBar,
  SectionHeader,
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

export function EnglishPanel({ tab }: { tab: 'today' | 'stats' | 'achievements' | 'profile' }): React.JSX.Element {
  const { feature } = useTheme();
  const english = feature.english;
  const [data, setData] = useState<EnglishData>(DEFAULT_ENGLISH);
  const [custom, setCustom] = useState('');
  const [target, setTarget] = useState('20');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void loadEnglish().then((loaded) => {
      setData(loaded);
      setTarget(String(loaded.target));
    });
  }, []);

  const persist = (next: EnglishData): void => {
    setData(next);
    void saveEnglish(next);
  };

  const today = businessToday();
  const todayWords = data.wordsByDay[today] ?? 0;
  const total = englishTotal(data);
  const streak = englishStreak(data, today, addDays);
  const ratio = Math.min(1, todayWords / Math.max(1, data.target));

  const addWords = (count: number): void => {
    if (!(count > 0 && count <= 500)) {
      setNotice('单次记录需在 1–500 词之间');
      return;
    }
    setNotice('');
    persist({ ...data, wordsByDay: { ...data.wordsByDay, [today]: todayWords + count } });
  };
  const applyTarget = (): void => {
    const value = Math.round(safeNumber(target));
    if (value < 1 || value > 500) {
      setNotice('每日目标需在 1–500 词之间');
      return;
    }
    setNotice('');
    persist({ ...data, target: value });
  };

  const weekSeries = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(today, -(6 - index));
    return { day, label: day.slice(5), value: data.wordsByDay[day] ?? 0 };
  });

  if (tab === 'stats') {
    return (
      <PageScroll>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatTile value={total} unit="词" label="累计词数" accent={english.deep} icon="📚" />
          <StatTile value={streak} unit="天" label="连续学习" accent={english.deep} icon="🔥" />
          <StatTile value={ENGLISH_TOTAL_POINTS} unit="分" label="成就积分" accent={english.deep} icon="🏅" />
        </View>
        <SectionHeader title="近 7 天词数" caption="每天一点点，积累看得见" style={{ marginTop: 22 }} />
        <Surface>
          <LineChart
            values={weekSeries.map((point) => point.value)}
            labels={weekSeries.map((point) => point.day.slice(8))}
            pointLabels={weekSeries.map((point) => formatMonthDay(point.day))}
            unit="词"
            target={data.target}
            accent={english.main}
          />
          <UIText variant="caption" tone="faint" style={{ marginTop: 8, textAlign: 'center' }}>
            虚线为每日目标 {data.target} 词。
          </UIText>
        </Surface>
        <SectionHeader title="学习节奏" style={{ marginTop: 22 }} />
        <Surface tone="soft">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <UIText variant="bodyStrong">今日目标完成度</UIText>
            <Pill label={`${Math.round(ratio * 100)}%`} accent={english.main} tone="solid" />
          </View>
          <ProgressBar ratio={ratio} color={english.main} height={8} />
          <UIText variant="caption" tone="muted" style={{ marginTop: 8 }}>
            {todayWords >= data.target ? '今天的目标已经完成，可以适当超额。' : `还差 ${data.target - todayWords} 词完成今天的目标。`}
          </UIText>
        </Surface>
      </PageScroll>
    );
  }

  if (tab === 'achievements') {
    const items: AchievementItem[] = ENGLISH_ACHIEVEMENTS.map((definition) => {
      const state = englishAchievementState(definition, data, today, addDays);
      return {
        key: definition.id,
        name: definition.name,
        desc: definition.desc,
        icon: definition.icon,
        points: definition.points,
        unlocked: state.unlocked,
        progress: state.progress,
        need: state.need
      };
    });
    return (
      <PageScroll>
        <Surface tone="soft" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <IconBadge icon="📖" accent={english.main} size={44} />
          <View style={{ flex: 1 }}>
            <UIText variant="bodyStrong">英语成就</UIText>
            <UIText variant="caption" tone="muted" style={{ marginTop: 2 }}>
              累计 {total} 词 · 连续 {streak} 天
            </UIText>
          </View>
          <Pill label={`${items.filter((item) => item.unlocked).length}/${items.length}`} accent={english.main} tone="solid" />
        </Surface>
        <AchievementGrid groups={[{ name: '学习里程碑', items }]} accent={english.main} />
      </PageScroll>
    );
  }

  return (
    <PageScroll>
      <Surface padding={0} radiusValue={radius.xl} style={{ overflow: 'hidden' }}>
        <View style={{ backgroundColor: english.wash, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pill label="今日词汇" accent={english.main} dot />
            <IconBadge icon="📖" accent={english.main} size={38} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <UIText variant="display" color={english.deep}>
                  {todayWords}
                </UIText>
                <UIText variant="small" tone="muted">
                  / {data.target} 词
                </UIText>
              </View>
              <UIText variant="small" tone="muted" style={{ marginTop: 2 }}>
                {todayWords >= data.target ? '今日目标已达成，保持节奏' : `还差 ${data.target - todayWords} 词`}
              </UIText>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Pill label={`连续 ${streak} 天`} accent={english.main} />
                <Pill label={`累计 ${total} 词`} accent={english.main} tone="outline" />
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
          <IconBadge icon="!" accent={palette.warning} size={28} />
          <UIText variant="small" color={palette.warning} style={{ flex: 1 }}>
            {notice}
          </UIText>
        </Surface>
      ) : null}

      <SectionHeader title="快速记录" caption="学完一组就点一下" style={{ marginTop: 22 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[5, 10, 20].map((count) => (
          <Pressable
            key={count}
            accessibilityRole="button"
            onPress={() => addWords(count)}
            style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.72 }]}
          >
            <UIText variant="h2" color={english.deep}>
              +{count}
            </UIText>
            <UIText variant="caption" tone="muted" style={{ marginTop: 1 }}>
              词
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
              addWords(Math.round(safeNumber(custom)));
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
              每日目标（词）
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
          建议从 10–30 词开始，连续比单次数量更重要。
        </UIText>
      </Surface>

      <SectionHeader title="近 7 天" caption="词数趋势" style={{ marginTop: 22 }} />
      <Surface>
        <LineChart
          values={weekSeries.map((point) => point.value)}
          labels={weekSeries.map((point) => point.day.slice(8))}
          pointLabels={weekSeries.map((point) => formatMonthDay(point.day))}
          unit="词"
          target={data.target}
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
  }
});
