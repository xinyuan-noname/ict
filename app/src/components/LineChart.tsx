import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { palette, useTheme } from '../ui/theme';

export interface LineChartProps {
  values: number[];
  labels: string[];
  pointLabels?: string[];
  height?: number;
  unit?: string;
  target?: number;
  accent?: string;
}

// 纯 View 折线 + 面积图：无第三方依赖，RN 三端与 Web 一致。
export function LineChart({
  values,
  labels,
  pointLabels,
  height = 148,
  unit,
  target,
  accent
}: LineChartProps): React.JSX.Element {
  const { palette: themePalette } = useTheme();
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const color = accent ?? themePalette.brand;
  const padX = 8;
  const padTop = 20;
  const padBottom = 12;
  const innerW = Math.max(0, width - padX * 2);
  const innerH = Math.max(10, height - padTop - padBottom);
  const max = Math.max(1, target ?? 0, ...values);
  const count = Math.max(1, values.length);
  const stepW = count > 1 ? innerW / (count - 1) : innerW;
  const points = values.map((value, index) => ({
    x: padX + (count === 1 ? innerW / 2 : (innerW * index) / (count - 1)),
    y: padTop + innerH - (Math.max(0, value) / max) * innerH,
    value
  }));

  const segments = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    if (!next) {
      return null;
    }
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return {
      key: `seg-${index}`,
      left: (point.x + next.x) / 2 - length / 2,
      top: (point.y + next.y) / 2 - 1,
      width: length,
      angle
    };
  });

  const targetY = target !== undefined ? padTop + innerH - (target / max) * innerH : null;
  const active = hovered ?? selected;
  const activePoint = active !== null ? points[active] : undefined;
  const activeLabel = active !== null ? pointLabels?.[active] ?? labels[active] ?? '' : '';
  const tipW = 104;
  const tipLeft = activePoint ? Math.max(0, Math.min(width - tipW, activePoint.x - tipW / 2)) : 0;
  const tipTop = activePoint ? (activePoint.y - 34 < 0 ? activePoint.y + 10 : activePoint.y - 34) : 0;
  const hitSpots = points.map((point, index) => {
    if (count === 1) {
      return { left: 0, width: innerW };
    }
    if (index === 0) {
      return { left: 0, width: stepW / 2 };
    }
    if (index === count - 1) {
      return { left: width - stepW / 2, width: stepW / 2 };
    }
    return { left: Math.max(0, point.x - stepW / 2), width: stepW };
  });

  const barWidth = Math.max(2, Math.min(9, stepW * 0.26));

  return (
    <View>
      <View
        style={[styles.canvas, { height }]}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      >
        {width > 0 ? (
          <>
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
              <View
                key={tick}
                style={[
                  styles.gridLine,
                  { top: padTop + innerH - tick * innerH, width: innerW, left: padX }
                ]}
              />
            ))}
            {points.map((point, index) => {
              const barHeight = Math.max(0, padTop + innerH - point.y);
              return (
                <View
                  key={`area-${index}`}
                  style={{
                    position: 'absolute',
                    left: point.x - barWidth / 2,
                    top: point.y,
                    width: barWidth,
                    height: barHeight,
                    borderRadius: barWidth / 2,
                    backgroundColor: color,
                    opacity: 0.1
                  }}
                />
              );
            })}
            {targetY !== null ? (
              <View style={[styles.targetLine, { top: targetY, width: innerW, left: padX }]} />
            ) : null}
            {segments.map((segment) =>
              segment ? (
                <View
                  key={segment.key}
                  style={[
                    styles.segment,
                    {
                      left: segment.left,
                      top: segment.top,
                      width: segment.width,
                      backgroundColor: color,
                      transform: [{ rotate: `${segment.angle}deg` }]
                    }
                  ]}
                />
              ) : null
            )}
            {points.map((point, index) => {
              const isActive = active === index;
              const showDot = count <= 14 || isActive || index === count - 1;
              if (!showDot) {
                return null;
              }
              const size = isActive ? 10 : 6;
              return (
                <View
                  key={`dot-${index}`}
                  style={[
                    styles.dot,
                    {
                      left: point.x - size / 2,
                      top: point.y - size / 2,
                      width: size,
                      height: size,
                      borderRadius: size / 2,
                      backgroundColor: color,
                      borderWidth: isActive ? 2 : 1.5,
                      borderColor: palette.surface
                    }
                  ]}
                />
              );
            })}
            {activePoint ? (
              <View style={[styles.tipWrap, { left: tipLeft, top: tipTop }]}>
                <View style={styles.tip}>
                  <Text style={styles.tipText} numberOfLines={1}>
                    {[activeLabel, `${activePoint.value}${unit ?? ''}`].filter(Boolean).join('  ')}
                  </Text>
                </View>
              </View>
            ) : null}
            {hitSpots.map((spot, index) => (
              <Pressable
                key={`hit-${index}`}
                accessibilityRole="button"
                accessibilityLabel={[pointLabels?.[index] ?? labels[index] ?? '', `${values[index]}${unit ?? ''}`]
                  .filter(Boolean)
                  .join(' ')}
                style={[styles.hitSpot, { left: spot.left, width: spot.width, height }]}
                onHoverIn={() => setHovered(index)}
                onHoverOut={() => setHovered((current) => (current === index ? null : current))}
                onPress={() => setSelected((current) => (current === index ? null : index))}
              />
            ))}
          </>
        ) : null}
        {unit ? (
          <Text style={{ position: 'absolute', right: 2, top: 0, fontSize: 9, color: themePalette.faint }}>{unit}</Text>
        ) : null}
      </View>
      <View style={styles.labels}>
        {labels.map((label, index) => (
          <Text key={`${label}-${index}`} style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { position: 'relative', marginTop: 4 },
  gridLine: { position: 'absolute', height: 1, backgroundColor: '#F1F3F7' },
  segment: { position: 'absolute', height: 2.5, borderRadius: 2 },
  dot: { position: 'absolute' },
  targetLine: { position: 'absolute', height: 1, borderTopWidth: 1, borderTopColor: '#D9A7AA', borderStyle: 'dashed' },
  tipWrap: { position: 'absolute', width: 104, alignItems: 'center', zIndex: 10 },
  tip: { backgroundColor: palette.night, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, maxWidth: 104 },
  tipText: { color: palette.white, fontSize: 11, fontWeight: '600' },
  hitSpot: { position: 'absolute', top: 0 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  label: { fontSize: 9, color: palette.faint, flex: 1, textAlign: 'center' }
});
