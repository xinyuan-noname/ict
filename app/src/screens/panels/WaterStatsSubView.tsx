import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LineChart } from '../../components/LineChart';
import { formatML } from '../../model/waterGoal';
import { WATER_RANGES, WATER_RANGE_LABEL, type WaterPoint } from '../../model/waterRange';
import type { CheckSnapshot, CheckStore } from '../../check/checkStore';
import { PageScroll, Pill, Segmented, StatTile, Surface, UIText } from '../../ui/primitives';
import { palette, useTheme } from '../../ui/theme';

function chartLabels(points: WaterPoint[]): string[] {
  const stride = points.length <= 8 ? 1 : Math.ceil(points.length / 6);
  return points.map((point, index) => (index % stride === 0 || index === points.length - 1 ? point.label : ''));
}

// 饮水统计子页：只搬移原有口径，不含成就卡（NAV-22）。
export function WaterStatsSubView({
  snapshot,
  store
}: {
  snapshot: CheckSnapshot;
  store: CheckStore;
}): React.JSX.Element {
  const { feature } = useTheme();
  const water = feature.water;
  const stats = snapshot.rangeStats;
  const label = WATER_RANGE_LABEL[snapshot.range];
  const options = WATER_RANGES.map(([key, name]) => ({ key, label: name }));
  const achieved = snapshot.week.filter((day) => day.achieved).length;
  const hasRecords = snapshot.rangeSeries.some((point) => point.value > 0);

  return (
    <PageScroll>
      <Segmented
        options={options}
        value={snapshot.range}
        onChange={(key) => void store.setRange(key)}
        accent={water.main}
        compact
      />

      <Surface style={{ marginTop: 14, backgroundColor: water.wash, borderColor: `${water.main}22` }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View>
            <UIText variant="label" color={water.main}>
              {label}平均
            </UIText>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
              {stats.averageMl !== null ? (
                <UIText variant="display" color={water.deep}>
                  {formatML(stats.averageMl)}
                </UIText>
              ) : (
                <UIText variant="h2" tone="muted">
                  暂无记录
                </UIText>
              )}
            </View>
            <UIText variant="caption" tone="muted" style={{ marginTop: 3 }}>
              仅统计有记录的日子 · 目标 {snapshot.targetMl > 0 ? formatML(snapshot.targetMl) : '待设置'}
            </UIText>
          </View>
          <Pill label={`${Math.round(stats.achievementRate * 100)}% 达成`} accent={water.main} tone="solid" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <StatTile value={stats.recordedDays} unit="天" label="有记录" accent={water.deep} />
          <StatTile value={stats.achievedDays} unit="天" label="已达标" accent={water.deep} />
          <StatTile value={snapshot.streak} unit="天" label="连续达标" accent={water.deep} />
        </View>
      </Surface>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 }}>
        <UIText variant="h2">{label}饮水趋势</UIText>
        <Pill label={`本周 ${achieved}/7 天达标`} accent={water.main} />
      </View>
      <Surface>
        {hasRecords ? (
          <>
            <LineChart
              values={snapshot.rangeSeries.map((point) => point.value)}
              labels={chartLabels(snapshot.rangeSeries)}
              pointLabels={snapshot.rangeSeries.map((point) => point.label)}
              unit="ml"
              target={snapshot.targetMl}
              accent={water.main}
            />
            <View style={styles.legend}>
              <View style={[styles.legendDot, { backgroundColor: water.main }]} />
              <UIText variant="caption" tone="faint">
                实线为实际饮水 · 顶部虚线为目标 {snapshot.targetMl} ml
              </UIText>
            </View>
          </>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 26 }}>
            <UIText style={{ fontSize: 26 }}>💧</UIText>
            <UIText variant="bodyStrong" style={{ marginTop: 8 }}>
              本区间还没有饮水记录
            </UIText>
            <UIText variant="caption" tone="muted" align="center" style={{ marginTop: 4, lineHeight: 17 }}>
              从「清单」记录第一杯水，趋势会在这里出现。
            </UIText>
          </View>
        )}
      </Surface>

      <Surface tone="soft" style={{ marginTop: 14 }}>
        <UIText variant="bodyStrong">口径说明</UIText>
        <InfoRow label="平均饮水" value="仅统计有记录的天" />
        <InfoRow label="达成率" value="按区间内已过天数计算" />
        <InfoRow label="目标来源" value="身体档案自动计算，变更次日生效" last />
      </Surface>
    </PageScroll>
  );
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }): React.JSX.Element {
  return (
    <View style={[styles.infoRow, !last && styles.infoBorder]}>
      <UIText variant="small" tone="muted">
        {label}
      </UIText>
      <UIText variant="caption" tone="ink" style={{ flex: 1, textAlign: 'right' }}>
        {value}
      </UIText>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 10 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  infoBorder: { borderBottomWidth: 1, borderBottomColor: palette.line }
});
