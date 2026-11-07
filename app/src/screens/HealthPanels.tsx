import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  DEFAULT_ENGLISH,
  MED_SLOTS,
  loadEnglish,
  loadMedication,
  loadSport,
  medStreak,
  medTodayDone,
  medViews,
  saveEnglish,
  saveMedication,
  saveSport,
  type DoseView,
  type EnglishData,
  type MedDose,
  type MedItem,
  type SportRecord
} from '../check/localData';
import { ENGLISH_ACHIEVEMENTS, ENGLISH_TOTAL_POINTS, englishAchievementState, englishStreak, englishTotal } from '../model/english';
import { LineChart } from '../components/LineChart';
import { ACHIEVEMENTS, GROUP_NAMES, evaluate, type AchievementDef, type AthleteProfile, type SportRecord as ModelSportRecord } from '../model/sport';
import { businessToday } from '../model/waterGoal';

type PanelTab = 'today' | 'stats' | 'profile';

function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function safeNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ---------- 通用成就墙 ----------
interface AchievementItem {
  key: string;
  name: string;
  desc: string;
  icon: string;
  points: number;
  unlocked: boolean;
  progress: number;
  need: number;
}

function AchievementWall({ groups }: { groups: { name: string; items: AchievementItem[] }[] }): React.JSX.Element {
  return (
    <View>
      {groups.map((group) => {
        const unlocked = group.items.filter((i) => i.unlocked).length;
        return (
          <View key={group.name} style={styles.achGroup}>
            <View style={styles.achHead}>
              <Text style={styles.achTitle}>{group.name}</Text>
              <Text style={styles.achCount}>
                {unlocked}/{group.items.length}
              </Text>
            </View>
            {group.items.map((item) => (
              <View key={item.key} style={[styles.achItem, item.unlocked && styles.achItemOn]}>
                <View style={styles.achRow}>
                  <Text style={styles.achIcon}>{item.unlocked ? item.icon : '🔒'}</Text>
                  <Text style={styles.achName}>{item.name}</Text>
                  <Text style={styles.achPts}>+{item.points}</Text>
                </View>
                <Text style={styles.achDesc}>{item.desc}</Text>
                {!item.unlocked && item.need > 1 ? (
                  <Text style={styles.achProgress}>
                    进度 {Math.min(item.progress, item.need)}/{item.need}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

// ---------- 服药 ----------
const MED_ACHIEVEMENTS = [
  { id: 'med_daily', name: '今日全部打卡', desc: '当日所有药物按时打卡', icon: '🔓', need: 1, kind: 'today', points: 20 },
  { id: 'med_streak3', name: '连续服药 3 天', desc: '连续 3 天全部打卡', icon: '🏅', need: 3, kind: 'streak', points: 40 },
  { id: 'med_streak7', name: '连续服药 7 天', desc: '连续 7 天全部打卡', icon: '🏅', need: 7, kind: 'streak', points: 60 },
  { id: 'med_streak30', name: '连续服药 30 天', desc: '连续 30 天全部打卡', icon: '👑', need: 30, kind: 'streak', points: 120 },
  { id: 'med_items_3', name: '三种药物', desc: '同时管理 3 种药物', icon: '🔓', need: 3, kind: 'items', points: 30 },
  { id: 'med_doses_50', name: '累计 50 次', desc: '累计完成 50 次服药', icon: '🏅', need: 50, kind: 'doses', points: 80 },
  { id: 'med_doses_200', name: '累计 200 次', desc: '累计完成 200 次服药', icon: '👑', need: 200, kind: 'doses', points: 110 }
];

export function MedicationPanel({ tab }: { tab: PanelTab }): React.JSX.Element {
  const [items, setItems] = useState<MedItem[]>([]);
  const [doses, setDoses] = useState<MedDose[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [slots, setSlots] = useState<string[]>(['morning', 'noon']);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void loadMedication().then(({ items: i, doses: d }) => {
      setItems(i);
      setDoses(d);
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
  const taken = views.filter((v) => v.status === 'taken' || v.status === 'late').length;
  const streak = medStreak(items, doses, addDays);

  const takeDose = (view: DoseView): void => {
    const dose: MedDose = {
      id: `dose_${Date.now()}`,
      itemId: view.itemId,
      day: today,
      slot: view.slot,
      late: view.status === 'missed'
    };
    persist(items, [...doses, dose]);
  };
  const cancelDose = (doseId: string): void => {
    persist(items, doses.filter((d) => d.id !== doseId));
  };

  const addMed = (): void => {
    if (!name.trim() || !dosage.trim() || slots.length === 0) {
      setNotice('药名、剂量与至少一个时段必填');
      return;
    }
    persist(
      [...items, { id: `med_${Date.now()}`, name: name.trim(), dosage: dosage.trim(), slots, status: 'active' }],
      doses
    );
    setName('');
    setDosage('');
    setNotice('已添加药物');
  };
  const stopMed = (id: string): void => {
    persist(items.map((item) => (item.id === id ? { ...item, status: 'stopped' } : item)), doses);
  };

  if (tab === 'stats') {
    const totalDoses = doses.length;
    const groups = [
      {
        name: '服药成就',
        items: MED_ACHIEVEMENTS.map((a) => {
          const progress =
            a.kind === 'today' ? (medTodayDone(items, doses, nowHour) ? 1 : 0)
              : a.kind === 'streak' ? streak
                : a.kind === 'items' ? items.filter((i) => i.status === 'active').length
                  : totalDoses;
          return {
            key: a.id, name: a.name, desc: a.desc, icon: a.icon, points: a.points,
            unlocked: progress >= a.need, progress, need: a.need
          };
        })
      }
    ];
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, -(6 - i));
      const dayViews = medViews(items, doses, day, 23);
      const done = dayViews.length > 0 && dayViews.every((v) => v.status === 'taken' || v.status === 'late');
      return { day, done, total: dayViews.length };
    });
    return (
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scroll}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}><Text style={styles.statValue}>{streak}</Text><Text style={styles.statLabel}>连续天数</Text></View>
          <View style={styles.statBox}><Text style={styles.statValue}>{totalDoses}</Text><Text style={styles.statLabel}>累计次数</Text></View>
          <View style={styles.statBox}><Text style={styles.statValue}>{items.filter((i) => i.status === 'active').length}</Text><Text style={styles.statLabel}>在服药物</Text></View>
        </View>
        <Text style={styles.section}>近 7 天</Text>
        {days.map((d) => (
          <View key={d.day} style={styles.row}>
            <Text style={styles.rowCell}>{d.day}</Text>
            <Text style={styles.rowCell}>{d.total} 项</Text>
            <Text style={[styles.rowCell, { color: d.done ? '#1a7a3c' : '#bbb' }]}>{d.total === 0 ? '无药物' : d.done ? '完成' : '未完成'}</Text>
          </View>
        ))}
        <Text style={styles.section}>成就</Text>
        <AchievementWall groups={groups} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scroll}>
      <Text style={styles.notice}>{notice}</Text>
      <Text style={styles.hero}>{taken} <Text style={styles.heroUnit}>/ {views.length} 次</Text></Text>
      <Text style={styles.sub}>今日服药完成率 {views.length > 0 ? Math.round((taken / views.length) * 100) : 0}%</Text>
      <Text style={styles.section}>今日待服</Text>
      {views.length === 0 ? <Text style={styles.empty}>还没有药物条目，点击「管理药物」添加</Text> : null}
      {views.map((view) => (
        <View key={`${view.itemId}-${view.slot}`} style={styles.doseRow}>
          <View style={styles.doseInfo}>
            <Text style={[styles.doseName, view.status === 'missed' && styles.doseNameMuted]}>
              {view.name} <Text style={styles.doseSlot}>{MED_SLOTS.find(([k]) => k === view.slot)?.[1]}</Text>
            </Text>
            <Text style={styles.doseMeta}>{view.dosage}</Text>
          </View>
          {view.status === 'taken' || view.status === 'late' ? (
            <Pressable style={styles.doseButtonGhost} onPress={() => view.doseId && cancelDose(view.doseId)}>
              <Text style={styles.doseButtonGhostText}>撤回</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.doseButton} onPress={() => takeDose(view)}>
              <Text style={styles.doseButtonText}>{view.status === 'missed' ? '补打' : '打卡'}</Text>
            </Pressable>
          )}
        </View>
      ))}
      <Pressable style={styles.outlineButton} onPress={() => setManageOpen(true)}>
        <Text style={styles.outlineButtonText}>管理药物</Text>
      </Pressable>

      <Modal visible={manageOpen} transparent animationType="slide" onRequestClose={() => setManageOpen(false)}>
        <Pressable style={styles.modalMask} onPress={() => setManageOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>药物管理</Text>
              <Pressable onPress={() => setManageOpen(false)}><Text style={styles.modalClose}>✕</Text></Pressable>
            </View>
            <ScrollView>
              <View style={styles.medGrid}>
                {items.map((item) => (
                  <View key={item.id} style={styles.medCard}>
                    <View style={styles.medTop}>
                      <Text style={styles.medName}>{item.name}</Text>
                      <Text style={[styles.medStatus, item.status !== 'active' && styles.medStatusOff]}>
                        {item.status === 'active' ? '服用中' : '已停用'}
                      </Text>
                    </View>
                    <Text style={styles.medDose}>{item.dosage}</Text>
                    <View style={styles.chips}>
                      {item.slots.map((slot) => (
                        <Text key={slot} style={styles.chip}>{MED_SLOTS.find(([k]) => k === slot)?.[1]}</Text>
                      ))}
                    </View>
                    <Pressable
                      style={[styles.medButton, item.status !== 'active' && styles.medButtonOff]}
                      disabled={item.status !== 'active'}
                      onPress={() => stopMed(item.id)}
                    >
                      <Text style={styles.medButtonText}>{item.status === 'active' ? '停用' : '已停用'}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
              <Text style={styles.section}>新增药物</Text>
              <View style={styles.field}><Text style={styles.fieldLabel}>药名</Text>
                <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="如 维生素D" />
              </View>
              <View style={styles.field}><Text style={styles.fieldLabel}>剂量</Text>
                <TextInput value={dosage} onChangeText={setDosage} style={styles.input} placeholder="如 1粒" />
              </View>
              <View style={styles.slotRow}>
                {MED_SLOTS.map(([key, label]) => (
                  <Pressable
                    key={key}
                    style={[styles.slotChip, slots.includes(key) && styles.slotChipOn]}
                    onPress={() => setSlots((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]))}
                  >
                    <Text style={[styles.slotChipText, slots.includes(key) && styles.slotChipTextOn]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.primaryButton} onPress={addMed}><Text style={styles.primaryText}>添加药物</Text></Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

// ---------- 运动 ----------
const SPORT_PROFILE: AthleteProfile = { gender: 'male', age: 30, weightG: 70000, heightCM: 175 };

function toModelRecord(record: SportRecord): ModelSportRecord {
  return {
    recordId: record.id, type: record.type, day: record.day,
    distanceM: record.distanceM, durationS: record.durationS, steps: record.steps, continuous: record.continuous
  };
}

export function SportPanel({ tab }: { tab: PanelTab }): React.JSX.Element {
  const [records, setRecords] = useState<SportRecord[]>([]);
  const [type, setType] = useState<SportRecord['type']>('walking');
  const [distanceKm, setDistanceKm] = useState('');
  const [minutes, setMinutes] = useState('');
  const [steps, setSteps] = useState('');

  useEffect(() => {
    void loadSport().then(setRecords);
  }, []);

  const persist = (next: SportRecord[]): void => {
    setRecords(next);
    void saveSport(next);
  };

  const today = businessToday();
  const todayRecords = records.filter((r) => r.day === today);
  const todaySteps = todayRecords.reduce((sum, r) => sum + r.steps, 0);
  const todayDistance = todayRecords.reduce((sum, r) => sum + r.distanceM, 0);
  const todayMinutes = Math.round(todayRecords.reduce((sum, r) => sum + r.durationS, 0) / 60);

  const add = (): void => {
    const km = safeNumber(distanceKm);
    const mins = safeNumber(minutes);
    const stepCount = safeNumber(steps);
    if (km < 0 || km > 300 || mins < 0 || mins > 1440 || stepCount < 0 || stepCount > 100000) return;
    persist([
      {
        id: `sp_${Date.now()}`, type, day: today,
        distanceM: Math.round(km * 1000), durationS: Math.round(mins * 60), steps: Math.round(stepCount), continuous: true
      },
      ...records
    ]);
    setDistanceKm('');
    setMinutes('');
    setSteps('');
  };

  if (tab === 'stats') {
    const modelRecords = records.map(toModelRecord);
    const states = ACHIEVEMENTS.map((def) => ({ def, state: evaluate(modelRecords, def as AchievementDef, SPORT_PROFILE) }));
    const groupKeys: AchievementDef['group'][] = ['walking', 'cycling', 'pace', 'distance', 'combo'];
    const groups = groupKeys.map((group) => ({
      name: GROUP_NAMES[group],
      items: states
        .filter(({ def }) => def.group === group)
        .map(({ def, state }) => ({
          key: def.id, name: def.name, desc: def.desc, icon: def.icon, points: def.points,
          unlocked: state.unlocked, progress: state.progress, need: state.need > 0 ? state.need : 1
        }))
    }));
    const unlocked = states.filter(({ state }) => state.unlocked).length;
    return (
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scroll}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}><Text style={styles.statValue}>{unlocked}</Text><Text style={styles.statLabel}>已解锁</Text></View>
          <View style={styles.statBox}><Text style={styles.statValue}>{records.reduce((s, r) => s + r.distanceM, 0) / 1000}</Text><Text style={styles.statLabel}>累计公里</Text></View>
          <View style={styles.statBox}><Text style={styles.statValue}>{records.reduce((s, r) => s + r.steps, 0)}</Text><Text style={styles.statLabel}>累计步数</Text></View>
        </View>
        <Text style={styles.section}>近 7 天步数</Text>
        <TrendChart
          values={Array.from({ length: 7 }, (_, i) => {
            const day = addDays(today, -(6 - i));
            return { label: day.slice(5), value: records.filter((r) => r.day === day).reduce((s, r) => s + r.steps, 0) };
          })}
          unit="步"
        />
        <Text style={styles.section}>成就（{ACHIEVEMENTS.length} 个）</Text>
        <AchievementWall groups={groups} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scroll}>
      <View style={styles.statsRow}>
        <View style={styles.statBox}><Text style={styles.statValue}>{todaySteps}</Text><Text style={styles.statLabel}>今日步数</Text></View>
        <View style={styles.statBox}><Text style={styles.statValue}>{(todayDistance / 1000).toFixed(2)}</Text><Text style={styles.statLabel}>今日公里</Text></View>
        <View style={styles.statBox}><Text style={styles.statValue}>{todayMinutes}</Text><Text style={styles.statLabel}>今日分钟</Text></View>
      </View>
      <Text style={styles.section}>添加运动记录</Text>
      <View style={styles.typeRow}>
        {(['walking', 'cycling', 'running'] as SportRecord['type'][]).map((key) => (
          <Pressable key={key} style={[styles.typeChip, type === key && styles.typeChipOn]} onPress={() => setType(key)}>
            <Text style={[styles.typeChipText, type === key && styles.typeChipTextOn]}>
              {key === 'walking' ? '步行' : key === 'cycling' ? '骑行' : '跑步'}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.field}><Text style={styles.fieldLabel}>距离 (km)</Text>
        <TextInput value={distanceKm} onChangeText={setDistanceKm} keyboardType="decimal-pad" style={styles.input} placeholder="如 5.2" />
      </View>
      <View style={styles.field}><Text style={styles.fieldLabel}>时长 (分钟)</Text>
        <TextInput value={minutes} onChangeText={setMinutes} keyboardType="number-pad" style={styles.input} placeholder="如 30" />
      </View>
      <View style={styles.field}><Text style={styles.fieldLabel}>步数</Text>
        <TextInput value={steps} onChangeText={setSteps} keyboardType="number-pad" style={styles.input} placeholder="如 12000" />
      </View>
      <Pressable style={styles.primaryButton} onPress={add}><Text style={styles.primaryText}>保存记录</Text></Pressable>
      <Text style={styles.section}>今日记录</Text>
      {todayRecords.length === 0 ? <Text style={styles.empty}>今天还没有运动记录</Text> : null}
      {todayRecords.map((record) => (
        <View key={record.id} style={styles.row}>
          <Text style={styles.rowCell}>{record.type === 'walking' ? '步行' : record.type === 'cycling' ? '骑行' : '跑步'}</Text>
          <Text style={styles.rowCell}>{record.distanceM > 0 ? `${(record.distanceM / 1000).toFixed(2)} km` : `${record.steps} 步`}</Text>
          <Pressable onPress={() => persist(records.filter((r) => r.id !== record.id))}>
            <Text style={styles.deleteText}>删除</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

// ---------- 英语 ----------
export function EnglishPanel({ tab }: { tab: PanelTab }): React.JSX.Element {
  const [data, setData] = useState<EnglishData>(DEFAULT_ENGLISH);
  const [custom, setCustom] = useState('');
  const [target, setTarget] = useState('20');

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

  const addWords = (n: number): void => {
    if (!(n > 0 && n <= 500)) return;
    persist({ ...data, wordsByDay: { ...data.wordsByDay, [today]: todayWords + n } });
  };
  const applyTarget = (): void => {
    const value = Math.round(safeNumber(target));
    if (value >= 1 && value <= 500) persist({ ...data, target: value });
  };

  if (tab === 'stats') {
    const groups = [
      {
        name: '英语成就',
        items: ENGLISH_ACHIEVEMENTS.map((def) => {
          const state = englishAchievementState(def, data, today, addDays);
          return {
            key: def.id, name: def.name, desc: def.desc, icon: def.icon, points: def.points,
            unlocked: state.unlocked, progress: state.progress, need: state.need
          };
        })
      }
    ];
    return (
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scroll}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}><Text style={styles.statValue}>{total}</Text><Text style={styles.statLabel}>累计词数</Text></View>
          <View style={styles.statBox}><Text style={styles.statValue}>{streak}</Text><Text style={styles.statLabel}>连续天数</Text></View>
          <View style={styles.statBox}><Text style={styles.statValue}>{ENGLISH_TOTAL_POINTS}</Text><Text style={styles.statLabel}>成就积分</Text></View>
        </View>
        <Text style={styles.section}>近 7 天词数</Text>
        <TrendChart
          values={Array.from({ length: 7 }, (_, i) => {
            const day = addDays(today, -(6 - i));
            return { label: day.slice(5), value: data.wordsByDay[day] ?? 0 };
          })}
          unit="词"
        />
        <Text style={styles.section}>成就</Text>
        <AchievementWall groups={groups} />
      </ScrollView>
    );
  }

  const ratio = Math.min(1, todayWords / Math.max(1, data.target));
  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scroll}>
      <Text style={styles.hero}>{todayWords} <Text style={styles.heroUnit}>/ {data.target} 词</Text></Text>
      <Text style={styles.sub}>
        {todayWords >= data.target ? '今日目标已达成' : `还差 ${data.target - todayWords} 词`} · 连续 {streak} 天
      </Text>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} /></View>
      <View style={styles.quickRow}>
        {[5, 10, 20].map((n) => (
          <Pressable key={n} style={styles.quickButton} onPress={() => addWords(n)}>
            <Text style={styles.quickText}>+{n} 词</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.field}><Text style={styles.fieldLabel}>自定义</Text>
        <TextInput value={custom} onChangeText={setCustom} keyboardType="number-pad" style={styles.input} placeholder="1-500" />
        <Pressable style={styles.inlineButton} onPress={() => { addWords(Math.round(safeNumber(custom))); setCustom(''); }}>
          <Text style={styles.inlineButtonText}>确认</Text>
        </Pressable>
      </View>
      <Text style={styles.section}>每日目标</Text>
      <View style={styles.field}><Text style={styles.fieldLabel}>目标词数</Text>
        <TextInput value={target} onChangeText={setTarget} keyboardType="number-pad" style={styles.input} />
        <Pressable style={styles.inlineButton} onPress={applyTarget}><Text style={styles.inlineButtonText}>保存</Text></Pressable>
      </View>
      <Text style={styles.section}>近 7 天</Text>
      <TrendChart
        values={Array.from({ length: 7 }, (_, i) => {
          const day = addDays(today, -(6 - i));
          return { label: day.slice(5), value: data.wordsByDay[day] ?? 0 };
        })}
        unit="词"
      />
    </ScrollView>
  );
}

// ---------- 柱状图（无第三方依赖） ----------
function TrendChart({ values, unit }: { values: { label: string; value: number }[]; unit: string }): React.JSX.Element {
  return (
    <LineChart
      values={values.map((v) => v.value)}
      labels={values.map((v) => v.label.slice(3))}
      unit={unit}
    />
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, minHeight: 0 },
  scroll: { padding: 20, paddingBottom: 32 },
  notice: { color: '#1a7a3c', fontSize: 12, minHeight: 16 },
  hero: { fontSize: 28, fontWeight: '700', color: '#222', textAlign: 'center' },
  heroUnit: { fontSize: 14, color: '#999', fontWeight: '400' },
  sub: { fontSize: 12, color: '#888', textAlign: 'center', marginTop: 4 },
  section: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 18, marginBottom: 8 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  statBox: { flex: 1, backgroundColor: '#fafafa', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#c7000b' },
  statLabel: { fontSize: 10, color: '#999', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  rowCell: { flex: 1, fontSize: 12, color: '#666' },
  deleteText: { fontSize: 12, color: '#c7000b' },
  empty: { color: '#bbb', fontSize: 12 },
  doseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#f2f2f2', borderRadius: 10, padding: 10, marginBottom: 7 },
  doseInfo: { flex: 1 },
  doseName: { fontSize: 13, fontWeight: '600', color: '#333' },
  doseNameMuted: { color: '#bbb' },
  doseSlot: { fontSize: 10, color: '#c7000b' },
  doseMeta: { fontSize: 11, color: '#999', marginTop: 2 },
  doseButton: { borderWidth: 1, borderColor: '#c7000b', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  doseButtonText: { color: '#c7000b', fontSize: 11 },
  doseButtonGhost: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  doseButtonGhostText: { color: '#999', fontSize: 11 },
  outlineButton: { borderWidth: 1, borderColor: '#c7000b', borderRadius: 22, paddingVertical: 11, alignItems: 'center', marginTop: 12 },
  outlineButtonText: { color: '#c7000b', fontSize: 14, fontWeight: '600' },
  primaryButton: { backgroundColor: '#c7000b', borderRadius: 22, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  field: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  fieldLabel: { width: 86, fontSize: 13, color: '#666' },
  input: { flex: 1, borderWidth: 1, borderColor: '#e6e6e6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  inlineButton: { marginLeft: 6, borderWidth: 1, borderColor: '#c7000b', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  inlineButtonText: { color: '#c7000b', fontSize: 12, fontWeight: '600' },
  progressTrack: { height: 8, backgroundColor: '#f2f2f2', borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#c7000b', borderRadius: 4 },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  quickButton: { flex: 1, borderWidth: 1, borderColor: '#c7000b', borderRadius: 14, paddingVertical: 8, alignItems: 'center' },
  quickText: { color: '#c7000b', fontSize: 12, fontWeight: '600' },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  typeChip: { flex: 1, borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, paddingVertical: 7, alignItems: 'center' },
  typeChipOn: { borderColor: '#c7000b', backgroundColor: '#fff5f5' },
  typeChipText: { color: '#666', fontSize: 12 },
  typeChipTextOn: { color: '#c7000b', fontWeight: '600' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 120, marginTop: 4 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barValue: { fontSize: 9, color: '#aaa', height: 12 },
  bar: { width: 16, backgroundColor: '#c7000b', borderRadius: 3 },
  barLabel: { fontSize: 9, color: '#aaa', marginTop: 3 },
  barUnit: { position: 'absolute', right: 0, top: 0, fontSize: 9, color: '#ccc' },
  deleteTextRow: { fontSize: 12, color: '#c7000b' },
  achGroup: { borderWidth: 1, borderColor: '#f0f0f0', borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  achHead: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, backgroundColor: '#fafafa' },
  achTitle: { fontSize: 12, fontWeight: '600', color: '#333' },
  achCount: { fontSize: 11, color: '#999' },
  achItem: { paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f6f6f6', opacity: 0.6 },
  achItemOn: { opacity: 1 },
  achRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  achIcon: { fontSize: 12 },
  achName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#333' },
  achPts: { fontSize: 11, color: '#c7000b' },
  achDesc: { fontSize: 11, color: '#999', marginTop: 3, marginLeft: 18 },
  achProgress: { fontSize: 10, color: '#bbb', marginTop: 3, marginLeft: 18 },
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  modalCard: { maxHeight: '82%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 15, fontWeight: '600', color: '#222' },
  modalClose: { fontSize: 16, color: '#999', paddingHorizontal: 6 },
  medGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  medCard: { width: '48%', backgroundColor: '#fafafa', borderRadius: 12, padding: 10 },
  medTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  medName: { fontSize: 13, fontWeight: '600', color: '#333', flexShrink: 1 },
  medStatus: { fontSize: 9, color: '#1a7a3c' },
  medStatusOff: { color: '#999' },
  medDose: { fontSize: 11, color: '#888', marginTop: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 6 },
  chip: { fontSize: 9, color: '#666', borderWidth: 1, borderColor: '#eee', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  medButton: { marginTop: 8, borderWidth: 1, borderColor: '#c7000b', borderRadius: 10, paddingVertical: 4, alignItems: 'center' },
  medButtonOff: { borderColor: '#e5e5e5' },
  medButtonText: { color: '#c7000b', fontSize: 10 },
  slotRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  slotChip: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  slotChipOn: { borderColor: '#c7000b', backgroundColor: '#fff5f5' },
  slotChipText: { fontSize: 11, color: '#666' },
  slotChipTextOn: { color: '#c7000b', fontWeight: '600' }
});