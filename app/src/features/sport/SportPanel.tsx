import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { AchievementStateView } from '../../api/sportApi';
import { loadSport, saveSport, type SportRecord } from '../../check/localData';
import { LineChart } from '../../components/LineChart';
import {
  ACHIEVEMENTS,
  GROUP_NAMES,
  effectivePaceThreshold,
  evaluate,
  formatPace,
  paceLimitSec,
  paceScale,
  type AchievementDef,
  type AthleteProfile,
  type SportRecord as ModelSportRecord
} from '../../model/sport';
import { businessToday } from '../../model/waterGoal';
import type { SportStore } from '../../sport/sportStore';
import { formatMonthDay } from '../../shared/format';
import { AchievementGrid, AchievementGroupNav } from '../../ui/AchievementGrid';
import {
  AppButton,
  EmptyState,
  IconBadge,
  PageScroll,
  Pill,
  SectionHeader,
  Segmented,
  StatTile,
  Surface,
  UIText
} from '../../ui/primitives';
import { palette, radius, useTheme } from '../../ui/theme';

const SPORT_PROFILE: AthleteProfile = { gender: 'male', age: 30, weightG: 70000, heightCM: 175 };

function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function safeNumber(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toModelRecord(record: SportRecord): ModelSportRecord {
  return {
    recordId: record.id,
    type: record.type,
    day: record.day,
    distanceM: record.distanceM,
    durationS: record.durationS,
    steps: record.steps,
    continuous: record.continuous
  };
}

// 周 / 月 / 季度 三种粒度的步数序列
function sportSeries(
  range: 'week' | 'month' | 'quarter',
  records: SportRecord[],
  today: string
): { label: string; value: number }[] {
  if (range === 'month') {
    return Array.from({ length: 30 }, (_, index) => {
      const day = addDays(today, -(29 - index));
      const value = records.filter((record) => record.day === day).reduce((sum, record) => sum + record.steps, 0);
      return { label: index % 5 === 0 || index === 29 ? day.slice(5) : '', value };
    });
  }
  if (range === 'quarter') {
    return Array.from({ length: 13 }, (_, index) => {
      const weekStart = addDays(today, -(12 - index) * 7);
      const days = Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset)).filter((day) => day <= today);
      const recorded = days.filter((day) => records.some((record) => record.day === day));
      const total = days.reduce(
        (sum, day) => sum + records.filter((record) => record.day === day).reduce((s, record) => s + record.steps, 0),
        0
      );
      return {
        label: index % 2 === 0 ? weekStart.slice(5) : '',
        value: recorded.length > 0 ? Math.round(total / recorded.length) : 0
      };
    });
  }
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(today, -(6 - index));
    return { label: day.slice(5), value: records.filter((record) => record.day === day).reduce((sum, record) => sum + record.steps, 0) };
  });
}

function achievementGroups(records: SportRecord[], remote: AchievementStateView[]): {
  groups: { name: string; items: { key: string; name: string; desc: string; icon: string; points: number; unlocked: boolean; progress: number; need: number; status?: 'locked' | 'unlocked' | 'granting' | 'granted'; grantedPoints?: number }[] }[];
  unlocked: number;
} {
  const modelRecords = records.map(toModelRecord);
  const states = ACHIEVEMENTS.map((definition) => ({
    definition,
    state: evaluate(modelRecords, definition as AchievementDef, SPORT_PROFILE)
  }));
  const groupKeys: AchievementDef['group'][] = ['walking', 'cycling', 'pace', 'distance', 'combo'];
  const remoteById = new Map(remote.map((item) => [item.achievementId, item]));
  const groups = groupKeys.map((group) => ({
    name: GROUP_NAMES[group],
    items: states
      .filter(({ definition }) => definition.group === group)
      .map(({ definition, state }) => {
        const granted = remoteById.get(definition.id);
        const base = { key: definition.id, name: definition.name, desc: definition.desc, icon: definition.icon, points: definition.points };
        if (granted) {
          return {
            ...base,
            points: granted.points,
            unlocked: granted.status !== 'locked',
            status: granted.status,
            grantedPoints: granted.grantedPoints,
            progress: granted.progress,
            need: granted.need > 0 ? granted.need : 1
          };
        }
        return {
          ...base,
          unlocked: state.unlocked,
          progress: state.progress,
          need: state.need > 0 ? state.need : 1
        };
      })
  }));
  const unlocked = groups.reduce((sum, group) => sum + group.items.filter((item) => item.unlocked).length, 0);
  return { groups, unlocked };
}

export function SportPanel({
  tab,
  sportStore
}: {
  tab: 'today' | 'stats' | 'achievements' | 'profile';
  sportStore?: SportStore;
}): React.JSX.Element {
  const { feature } = useTheme();
  const sport = feature.sport;
  const [records, setRecords] = useState<SportRecord[]>([]);
  const [type, setType] = useState<SportRecord['type']>('walking');
  const [distanceKm, setDistanceKm] = useState('');
  const [minutes, setMinutes] = useState('');
  const [steps, setSteps] = useState('');
  const [range, setRange] = useState<'week' | 'month' | 'quarter'>('week');
  const [achievementGroup, setAchievementGroup] = useState<string>(GROUP_NAMES.walking);
  const [remote, setRemote] = useState<AchievementStateView[]>(sportStore?.getSnapshot().achievements ?? []);
  const [balance, setBalance] = useState<number | null>(sportStore?.getSnapshot().pointsBalance ?? null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    void loadSport().then(setRecords);
  }, []);

  useEffect(() => {
    if (!sportStore) {
      return;
    }
    const unsubscribe = sportStore.subscribe((snapshot) => {
      setRemote(snapshot.achievements);
      setBalance(snapshot.pointsBalance);
    });
    void sportStore.loadRemote();
    return unsubscribe;
  }, [sportStore]);

  const persist = (next: SportRecord[]): void => {
    setRecords(next);
    void saveSport(next);
  };

  const today = businessToday();
  const todayRecords = records.filter((record) => record.day === today);
  const todaySteps = todayRecords.reduce((sum, record) => sum + record.steps, 0);
  const todayDistance = todayRecords.reduce((sum, record) => sum + record.distanceM, 0);
  const todayMinutes = Math.round(todayRecords.reduce((sum, record) => sum + record.durationS, 0) / 60);

  const add = (): void => {
    const km = safeNumber(distanceKm);
    const mins = safeNumber(minutes);
    const stepCount = safeNumber(steps);
    if (km < 0 || km > 300 || mins < 0 || mins > 1440 || stepCount < 0 || stepCount > 100000) {
      setFormError('请输入 0–300 km、0–1440 分钟、0–100000 步之间的数值');
      return;
    }
    if (km === 0 && mins === 0 && stepCount === 0) {
      setFormError('距离、时长、步数至少填写一项');
      return;
    }
    setFormError('');
    const record: SportRecord = {
      id: `sp_${Date.now()}`,
      type,
      day: today,
      distanceM: Math.round(km * 1000),
      durationS: Math.round(mins * 60),
      steps: Math.round(stepCount),
      continuous: true
    };
    persist([record, ...records]);
    if (sportStore) {
      void sportStore
        .addRecord({
          recordId: record.id,
          type: record.type,
          day: record.day,
          distanceM: record.distanceM,
          durationS: record.durationS,
          steps: record.steps,
          continuous: record.continuous
        })
        .catch(() => undefined);
    }
    setDistanceKm('');
    setMinutes('');
    setSteps('');
  };

  const removeRecord = (recordId: string): void => {
    persist(records.filter((record) => record.id !== recordId));
    if (sportStore) {
      void sportStore.removeRecord(recordId).catch(() => undefined);
    }
  };

  if (tab === 'stats') {
    const { unlocked } = achievementGroups(records, remote);
    return (
      <PageScroll>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatTile value={unlocked} unit="个" label="已解锁成就" accent={sport.deep} icon="🏅" />
          <StatTile value={(records.reduce((sum, record) => sum + record.distanceM, 0) / 1000).toFixed(1)} unit="km" label="累计距离" accent={sport.deep} icon="📍" />
          <StatTile value={records.reduce((sum, record) => sum + record.steps, 0)} unit="步" label="累计步数" accent={sport.deep} icon="👟" />
        </View>

        <SectionHeader title="运动趋势" caption="按周 / 月 / 季度查看步数" style={{ marginTop: 22 }} />
        <Surface>
          <Segmented
            options={[
              { key: 'week', label: '周记' },
              { key: 'month', label: '月记' },
              { key: 'quarter', label: '季度记' }
            ]}
            value={range}
            onChange={setRange}
            accent={sport.main}
            compact
          />
          <View style={{ marginTop: 12 }}>
            <LineChart
              values={sportSeries(range, records, today).map((point) => point.value)}
              labels={sportSeries(range, records, today).map((point) => point.label)}
              unit="步"
              accent={sport.main}
            />
          </View>
        </Surface>

        <SectionHeader title="个性化配速极限" caption="依据身体档案估算，仅用于成就激励" style={{ marginTop: 22 }} />
        <Surface tone="soft" style={{ backgroundColor: sport.wash, borderColor: `${sport.main}22` }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <UIText variant="caption" tone="muted">
                个人极限配速
              </UIText>
              <UIText variant="h2" color={sport.deep} style={{ marginTop: 2 }}>
                {formatPace(paceLimitSec(SPORT_PROFILE))}
              </UIText>
            </View>
            <Pill label={`缩放 ${paceScale(SPORT_PROFILE).toFixed(2)}`} accent={sport.main} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {[300, 280, 260, 240, 230, 220, 210].map((standard) => (
              <View key={standard} style={[styles.paceTag, { borderColor: `${sport.main}33`, backgroundColor: palette.surface }]}>
                <UIText variant="caption" color={sport.deep}>
                  {formatPace(effectivePaceThreshold(standard, SPORT_PROFILE))}
                </UIText>
              </View>
            ))}
          </View>
          <UIText variant="caption" tone="faint" style={{ marginTop: 10, lineHeight: 16 }}>
            配速阈值按性别、年龄、体重估算，不构成训练或医学建议。
          </UIText>
        </Surface>
      </PageScroll>
    );
  }

  if (tab === 'achievements') {
    const { groups } = achievementGroups(records, remote);
    const activeGroup = groups.find((group) => group.name === achievementGroup) ?? groups[0];
    const totalUnlocked = groups.reduce((sum, group) => sum + group.items.filter((item) => item.unlocked).length, 0);
    return (
      <PageScroll>
        <Surface tone="soft" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <IconBadge icon="🏅" accent={sport.main} size={44} />
          <View style={{ flex: 1 }}>
            <UIText variant="bodyStrong">运动成就</UIText>
            <UIText variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {sportStore ? `积分余额 ${balance === null ? '—' : balance}` : '游客模式 · 本地判定'}
            </UIText>
          </View>
          <Pill label={`${totalUnlocked}/${ACHIEVEMENTS.length}`} accent={sport.main} tone="solid" />
        </Surface>
        <AchievementGroupNav groups={groups} value={activeGroup?.name ?? ''} onChange={setAchievementGroup} accent={sport.main} />
        {activeGroup ? <AchievementGrid groups={[activeGroup]} accent={sport.main} showHeader={false} /> : null}
      </PageScroll>
    );
  }

  return (
    <PageScroll>
      <Surface padding={0} radiusValue={radius.xl} style={{ overflow: 'hidden' }}>
        <View style={{ backgroundColor: sport.wash, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pill label="今日运动" accent={sport.main} dot />
            <IconBadge icon="🏃" accent={sport.main} size={38} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 10 }}>
            <UIText variant="display" color={sport.deep}>
              {todaySteps.toLocaleString('zh-CN')}
            </UIText>
            <UIText variant="small" tone="muted">
              步
            </UIText>
          </View>
          <UIText variant="small" tone="muted" style={{ marginTop: 2 }}>
            {todayRecords.length === 0 ? '今天还没有运动记录，动起来吧' : `共 ${todayRecords.length} 条记录，继续保持`}
          </UIText>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <StatTile value={(todayDistance / 1000).toFixed(2)} unit="km" label="今日距离" accent={sport.deep} />
            <StatTile value={todayMinutes} unit="分钟" label="今日时长" accent={sport.deep} />
            <StatTile value={todayRecords.length} unit="条" label="今日记录" accent={sport.deep} />
          </View>
        </View>
      </Surface>

      <SectionHeader title="添加运动记录" caption="步行、骑行、跑步都算数" style={{ marginTop: 22 }} />
      <Surface>
        <Segmented
          options={[
            { key: 'walking', label: '步行', icon: '🚶' },
            { key: 'cycling', label: '骑行', icon: '🚴' },
            { key: 'running', label: '跑步', icon: '🏃' }
          ]}
          value={type}
          onChange={setType}
          accent={sport.main}
        />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <View style={{ flex: 1 }}>
            <UIText variant="caption" tone="muted" style={styles.fieldLabel}>
              距离 km
            </UIText>
            <TextInput
              value={distanceKm}
              onChangeText={setDistanceKm}
              keyboardType="decimal-pad"
              placeholder="5.2"
              placeholderTextColor={palette.faint}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <UIText variant="caption" tone="muted" style={styles.fieldLabel}>
              时长 分钟
            </UIText>
            <TextInput
              value={minutes}
              onChangeText={setMinutes}
              keyboardType="number-pad"
              placeholder="30"
              placeholderTextColor={palette.faint}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <UIText variant="caption" tone="muted" style={styles.fieldLabel}>
              步数
            </UIText>
            <TextInput
              value={steps}
              onChangeText={setSteps}
              keyboardType="number-pad"
              placeholder="12000"
              placeholderTextColor={palette.faint}
              style={styles.input}
            />
          </View>
        </View>
        {formError ? (
          <UIText variant="caption" color={palette.danger} style={{ marginTop: 8 }}>
            {formError}
          </UIText>
        ) : null}
        <AppButton label="保存记录" fullWidth accent={sport.main} icon="＋" onPress={add} style={{ marginTop: 12 }} />
      </Surface>

      <SectionHeader
        title="今日记录"
        caption={`${formatMonthDay(today)} · ${todayRecords.length} 条`}
        style={{ marginTop: 22 }}
      />
      {todayRecords.length === 0 ? (
        <Surface tone="soft">
          <EmptyState icon="👟" title="还没有运动记录" message="记录一次步行、骑行或跑步，开始累计成就。" accent={sport.main} />
        </Surface>
      ) : (
        <Surface padding={14}>
          {todayRecords.map((record, index) => (
            <View key={record.id} style={[styles.recordRow, index < todayRecords.length - 1 && styles.recordBorder]}>
              <IconBadge
                icon={record.type === 'walking' ? '🚶' : record.type === 'cycling' ? '🚴' : '🏃'}
                accent={sport.main}
                size={34}
              />
              <View style={{ flex: 1 }}>
                <UIText variant="bodyStrong">
                  {record.type === 'walking' ? '步行' : record.type === 'cycling' ? '骑行' : '跑步'}
                </UIText>
                <UIText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  {record.distanceM > 0 ? `${(record.distanceM / 1000).toFixed(2)} km` : ''}
                  {record.distanceM > 0 && record.steps > 0 ? ' · ' : ''}
                  {record.steps > 0 ? `${record.steps.toLocaleString('zh-CN')} 步` : ''}
                  {record.durationS > 0 ? ` · ${Math.round(record.durationS / 60)} 分钟` : ''}
                </UIText>
              </View>
              <Pressable accessibilityRole="button" onPress={() => removeRecord(record.id)} hitSlop={8}>
                <UIText variant="caption" tone="muted">
                  删除
                </UIText>
              </Pressable>
            </View>
          ))}
        </Surface>
      )}
      <UIText variant="caption" tone="faint" align="center" style={{ marginTop: 14 }}>
        记录仅用于个人激励，配速与成就判定不构成训练建议。
      </UIText>
    </PageScroll>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { marginBottom: 5, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    color: palette.ink
  },
  paceTag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  recordBorder: { borderBottomWidth: 1, borderBottomColor: palette.line }
});
