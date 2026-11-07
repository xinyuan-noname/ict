import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineChart } from '../../components/LineChart';
import { formatML } from '../../model/waterGoal';
import { WATER_RANGES, WATER_RANGE_LABEL, type WaterPoint } from '../../model/waterRange';
import type { CheckSnapshot, CheckStore } from '../../check/checkStore';

function chartLabels(points: WaterPoint[]): string[] {
  const stride = points.length <= 8 ? 1 : Math.ceil(points.length / 6);
  return points.map((p, i) => (i % stride === 0 || i === points.length - 1 ? p.label : ''));
}

// 饮水统计子页：只搬移原有口径，不含成就卡（NAV-22）。
export function WaterStatsSubView({
  snapshot,
  store
}: {
  snapshot: CheckSnapshot;
  store: CheckStore;
}): React.JSX.Element {
  const stats = snapshot.rangeStats;
  const label = WATER_RANGE_LABEL[snapshot.range];
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.rangeRow}>
        {WATER_RANGES.map(([key, name]) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            style={[styles.rangeChip, snapshot.range === key && styles.rangeChipOn]}
            onPress={() => void store.setRange(key)}
          >
            <Text style={[styles.rangeChipText, snapshot.range === key && styles.rangeChipTextOn]}>{name}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatML(stats.averageMl)}</Text>
          <Text style={styles.statLabel}>{`${label}平均`}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{`${Math.round(stats.achievementRate * 100)}%`}</Text>
          <Text style={styles.statLabel}>达成率</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{`${snapshot.streak} 天`}</Text>
          <Text style={styles.statLabel}>连续</Text>
        </View>
      </View>

      <Text style={styles.section}>{label}饮水趋势</Text>
      <LineChart
        values={snapshot.rangeSeries.map((p) => p.value)}
        labels={chartLabels(snapshot.rangeSeries)}
        unit="ml"
        target={snapshot.targetMl}
      />
      <Text style={styles.legend}>红线为目标 {snapshot.targetMl} ml · 灰点为无记录</Text>

      <Text style={styles.section}>明细</Text>
      {snapshot.rangeSeries.map((p) => (
        <View key={p.day} style={styles.tableRow}>
          <Text style={styles.tableCell}>{p.label}</Text>
          <Text style={styles.tableCell}>{formatML(p.value)}</Text>
          <Text style={[styles.tableCell, { color: p.achieved ? '#1a7a3c' : '#999' }]}>
            {p.achieved ? '达成' : p.value > 0 ? '未达成' : '无记录'}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 32 },
  rangeRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  rangeChip: { flex: 1, borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12, paddingVertical: 6, alignItems: 'center' },
  rangeChipOn: { borderColor: '#c7000b', backgroundColor: '#fff5f5' },
  rangeChipText: { fontSize: 12, color: '#888' },
  rangeChipTextOn: { color: '#c7000b', fontWeight: '600' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 20, fontWeight: '700', color: '#222' },
  statLabel: { fontSize: 12, color: '#999', marginTop: 2 },
  section: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 22, marginBottom: 8 },
  legend: { fontSize: 11, color: '#aaa', marginTop: 8, textAlign: 'center' },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  tableCell: { fontSize: 13, color: '#555', flex: 1 }
});