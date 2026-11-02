import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CheckSnapshot, CheckStore } from '../check/checkStore';
import { DEFAULT_CUP_ML, formatML, type Gender } from '../model/waterGoal';

type Tab = 'today' | 'stats' | 'profile';

export interface CheckShellProps {
  store: CheckStore;
  isGuest: boolean;
  displayName: string;
  onUpgrade?: () => void;
  onExit: () => void;
  onOpenRewards?: () => void;
}

export function CheckShell({ store, isGuest, displayName, onUpgrade, onExit, onOpenRewards }: CheckShellProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<CheckSnapshot>(store.getSnapshot());
  const [tab, setTab] = useState<Tab>('today');

  useEffect(() => {
    const unsubscribe = store.subscribe(setSnapshot);
    void store.load();
    return unsubscribe;
  }, [store]);

  const ratio = snapshot.targetMl > 0 ? Math.min(1, snapshot.totalMl / snapshot.targetMl) : 0;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.brand}>check</Text>
        <Text style={styles.badge}>{isGuest ? '游客模式' : displayName}</Text>
      </View>

      {snapshot.errorMessage ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{snapshot.errorMessage}</Text>
        </View>
      ) : null}
      {snapshot.notice ? <Text style={styles.notice}>{snapshot.notice}</Text> : null}

      <View style={styles.body}>
        {tab === 'today' ? <TodayView snapshot={snapshot} ratio={ratio} store={store} /> : null}
        {tab === 'stats' ? <StatsView snapshot={snapshot} /> : null}
        {tab === 'profile' ? (
          <ProfileView
            snapshot={snapshot}
            store={store}
            isGuest={isGuest}
            onUpgrade={onUpgrade}
            onExit={onExit}
            onOpenRewards={onOpenRewards}
          />
        ) : null}
      </View>

      <View style={styles.tabs}>
        {([
          ['today', '今日'],
          ['stats', '统计'],
          ['profile', '我的']
        ] as [Tab, string][]).map(([key, label]) => (
          <Pressable key={key} accessibilityRole="button" onPress={() => setTab(key)} style={styles.tab}>
            <Text style={[styles.tabText, tab === key && styles.tabActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function TodayView({ snapshot, ratio, store }: { snapshot: CheckSnapshot; ratio: number; store: CheckStore }): React.JSX.Element {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <ProgressRing ratio={ratio} />
      <Text style={styles.hero}>
        {snapshot.totalMl} <Text style={styles.heroUnit}>/ {snapshot.targetMl} ml</Text>
      </Text>
      <Text style={styles.sub}>
        {snapshot.targetMl === 0 ? '请先在「我的」填写身体档案' : snapshot.achieved ? '今日目标已达成' : `还差 ${snapshot.targetMl - snapshot.totalMl} ml`}
      </Text>
      <Text style={styles.sub}>连续达成 {snapshot.streak} 天 · 约 {snapshot.cups} 杯（{DEFAULT_CUP_ML} ml/杯）</Text>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" testID="add-250" style={styles.primary} onPress={() => void store.addWater(250)}>
          <Text style={styles.primaryText}>+250 ml</Text>
        </Pressable>
        <Pressable accessibilityRole="button" testID="add-500" style={styles.secondary} onPress={() => void store.addWater(500)}>
          <Text style={styles.secondaryText}>+500 ml</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>今日记录</Text>
      {snapshot.totalMl === 0 ? <Text style={styles.empty}>还没有记录</Text> : null}
      {snapshot.week.length >= 0
        ? null
        : null}
      <RecordList store={store} snapshot={snapshot} />
    </ScrollView>
  );
}

function RecordList({ store, snapshot }: { store: CheckStore; snapshot: CheckSnapshot }): React.JSX.Element {
  const [records, setRecords] = useState<{ recordId: string; ml: number; createdAt: string }[]>([]);
  useEffect(() => {
    const refresh = async (): Promise<void> => {
      const raw = await import('@react-native-async-storage/async-storage');
      if (snapshot.isGuest) {
        try {
          const text = await raw.default.getItem('guest.check.v1');
          const data = text ? JSON.parse(text) : { records: [] };
          const today = snapshot.day;
          setRecords((data.records ?? []).filter((r: { day: string }) => r.day === today));
        } catch {
          setRecords([]);
        }
      } else {
        setRecords([]);
      }
    };
    void refresh();
  }, [snapshot.isGuest, snapshot.day, snapshot.totalMl]);

  return (
    <View>
      {records.map((r) => (
        <View key={r.recordId} style={styles.record}>
          <Text style={styles.recordText}>{r.ml} ml</Text>
          <Pressable accessibilityRole="button" onPress={() => void store.removeRecord(r.recordId)}>
            <Text style={styles.delete}>撤销</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function ProgressRing({ ratio }: { ratio: number }): React.JSX.Element {
  const size = 200;
  const center = size / 2;
  const segments = 60;
  const radius = 86;
  const active = Math.round(segments * ratio);
  return (
    <View style={{ width: size, height: size, alignSelf: 'center', marginVertical: 12 }}>
      {Array.from({ length: segments }, (_, i) => {
        const angle = (i / segments) * 360;
        return (
          <View
            key={i}
            style={{
              position: 'absolute', left: center - 2, top: center - 2, width: 4, height: 14,
              borderRadius: 2, backgroundColor: i < active ? '#c7000b' : '#f0dcdd',
              transform: [{ rotate: `${angle}deg` }, { translateY: -radius }]
            }}
          />
        );
      })}
      <View style={styles.ringCenter}>
        <Text style={styles.ringPercent}>{Math.round(ratio * 100)}%</Text>
        <Text style={styles.ringLabel}>今日进度</Text>
      </View>
    </View>
  );
}

function StatsView({ snapshot }: { snapshot: CheckSnapshot }): React.JSX.Element {
  const max = Math.max(snapshot.targetMl, ...snapshot.week.map((d) => d.totalMl), 1);
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.statRow}>
        <Stat label="周平均" value={formatML(snapshot.averageMl)} />
        <Stat label="达成率" value={`${Math.round(snapshot.achievementRate * 100)}%`} />
        <Stat label="连续" value={`${snapshot.streak} 天`} />
      </View>

      <Text style={styles.section}>本周饮水变化</Text>
      <View style={styles.chart}>
        {snapshot.week.map((d) => {
          const height = Math.max(4, Math.round((d.totalMl / max) * 120));
          return (
            <View key={d.day} style={styles.barCol}>
              <Text style={styles.barValue}>{d.totalMl > 0 ? d.totalMl : ''}</Text>
              <View
                style={[
                  styles.bar,
                  { height, backgroundColor: d.achieved ? '#c7000b' : d.totalMl > 0 ? '#f2a6ab' : '#eee' }
                ]}
              />
              <Text style={styles.barLabel}>{d.day.slice(5)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.legend}>目标线：{snapshot.targetMl} ml · 柱高按最大值归一</Text>

      <Text style={styles.section}>每日明细</Text>
      {snapshot.week.map((d) => (
        <View key={d.day} style={styles.tableRow}>
          <Text style={styles.tableCell}>{d.day}</Text>
          <Text style={styles.tableCell}>{formatML(d.totalMl)}</Text>
          <Text style={[styles.tableCell, { color: d.achieved ? '#1a7a3c' : '#999' }]}>
            {d.achieved ? '达成' : d.totalMl > 0 ? '未达成' : '无记录'}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ProfileView({
  snapshot,
  store,
  isGuest,
  onUpgrade,
  onExit,
  onOpenRewards
}: {
  snapshot: CheckSnapshot;
  store: CheckStore;
  isGuest: boolean;
  onUpgrade?: () => void;
  onExit: () => void;
  onOpenRewards?: () => void;
}): React.JSX.Element {
  const [height, setHeight] = useState(String(snapshot.profile?.heightCm ?? 175));
  const [weight, setWeight] = useState(String(Math.round((snapshot.profile?.weightG ?? 70000) / 1000)));
  const [age, setAge] = useState(String(snapshot.profile?.age ?? 30));
  const [gender, setGender] = useState<Gender>(snapshot.profile?.gender ?? 'male');

  const save = async (): Promise<void> => {
    await store.saveProfile({
      heightCm: Number(height), weightG: Number(weight) * 1000, age: Number(age), gender
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.section}>身体档案</Text>
      <Field label="身高 (cm)" value={height} onChange={setHeight} />
      <Field label="体重 (kg)" value={weight} onChange={setWeight} />
      <Field label="年龄" value={age} onChange={setAge} />
      <View style={styles.genderRow}>
        {(['male', 'female', 'other'] as Gender[]).map((g) => (
          <Pressable key={g} onPress={() => setGender(g)} style={[styles.gender, gender === g && styles.genderActive]}>
            <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>
              {g === 'male' ? '男' : g === 'female' ? '女' : '其他'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>今日目标：{snapshot.targetMl} ml（档案变更次日生效）</Text>
      <Pressable accessibilityRole="button" testID="save-profile" style={styles.primary} onPress={() => void save()}>
        <Text style={styles.primaryText}>保存档案</Text>
      </Pressable>

      <Text style={styles.disclaimer}>目标量仅作日常参考，不构成医学建议。</Text>

      {!isGuest && onOpenRewards ? (
        <Pressable style={styles.secondary} onPress={onOpenRewards}>
          <Text style={styles.secondaryText}>签到与头像框</Text>
        </Pressable>
      ) : null}

      <View style={styles.identity}>
        <Text style={styles.section}>{isGuest ? '游客模式' : '账号'}</Text>
        <Text style={styles.hint}>{isGuest ? '数据仅保存在本机，不会上传服务器' : '数据已保存在云端'}</Text>
        {isGuest && onUpgrade ? (
          <Pressable style={styles.secondary} onPress={onUpgrade}>
            <Text style={styles.secondaryText}>登录华为账号</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.ghost}
          onPress={() => {
            Alert.alert(isGuest ? '退出游客模式' : '退出登录', '确定退出？', [
              { text: '取消', style: 'cancel' },
              { text: '退出', style: 'destructive', onPress: onExit }
            ]);
          }}
        >
          <Text style={styles.ghostText}>{isGuest ? '退出游客模式' : '退出登录'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        style={styles.input}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 },
  brand: { fontSize: 22, fontWeight: '700', color: '#c7000b', letterSpacing: 1 },
  badge: { fontSize: 12, color: '#888' },
  body: { flex: 1 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#eee', paddingVertical: 6 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabText: { fontSize: 14, color: '#999' },
  tabActive: { color: '#c7000b', fontWeight: '600' },
  scroll: { padding: 20, paddingBottom: 32 },
  banner: { marginHorizontal: 20, marginTop: 8, backgroundColor: '#fdecec', borderRadius: 8, padding: 10 },
  bannerText: { color: '#a61b1b', fontSize: 13 },
  notice: { marginHorizontal: 20, marginTop: 8, color: '#1a7a3c', fontSize: 13 },
  hero: { fontSize: 30, fontWeight: '700', color: '#222', textAlign: 'center' },
  heroUnit: { fontSize: 15, color: '#999', fontWeight: '400' },
  sub: { fontSize: 13, color: '#888', textAlign: 'center', marginTop: 4 },
  ringCenter: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringPercent: { fontSize: 30, fontWeight: '700', color: '#c7000b' },
  ringLabel: { fontSize: 12, color: '#999', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 18 },
  primary: { backgroundColor: '#c7000b', borderRadius: 22, paddingVertical: 12, paddingHorizontal: 28 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondary: { backgroundColor: '#fff', borderColor: '#c7000b', borderWidth: 1, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 28, marginTop: 10 },
  secondaryText: { color: '#c7000b', fontSize: 15, fontWeight: '600' },
  section: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 22, marginBottom: 8 },
  empty: { color: '#aaa', fontSize: 13 },
  record: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f3f3' },
  recordText: { fontSize: 14, color: '#444' },
  delete: { fontSize: 13, color: '#c7000b' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 20, fontWeight: '700', color: '#222' },
  statLabel: { fontSize: 12, color: '#999', marginTop: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 170, marginTop: 8 },
  barCol: { flex: 1, alignItems: 'center' },
  barValue: { fontSize: 10, color: '#999', height: 14 },
  bar: { width: 18, borderRadius: 4 },
  barLabel: { fontSize: 10, color: '#999', marginTop: 4 },
  legend: { fontSize: 11, color: '#aaa', marginTop: 8, textAlign: 'center' },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  tableCell: { fontSize: 13, color: '#555', flex: 1 },
  field: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  fieldLabel: { width: 100, color: '#666', fontSize: 14 },
  input: { flex: 1, borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  genderRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  gender: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#e5e5e5' },
  genderActive: { borderColor: '#c7000b', backgroundColor: '#fff5f5' },
  genderText: { color: '#666', fontSize: 14 },
  genderTextActive: { color: '#c7000b', fontWeight: '600' },
  hint: { color: '#999', fontSize: 12, marginTop: 8 },
  disclaimer: { color: '#bbb', fontSize: 11, marginTop: 14 },
  identity: { marginTop: 10 },
  ghost: { paddingVertical: 12, marginTop: 4 },
  ghostText: { color: '#999', fontSize: 14 }
});