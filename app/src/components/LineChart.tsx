import React, { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

export interface LineChartProps {
  values: number[];
  labels: string[];
  height?: number;
  unit?: string;
  target?: number;
}

// 纯 View 折线图：无第三方依赖，RN 三端与 Web 一致
export function LineChart({ values, labels, height = 130, unit, target }: LineChartProps): React.JSX.Element {
  const [width, setWidth] = useState(0);
  const padX = 10;
  const padY = 12;
  const innerW = Math.max(0, width - padX * 2);
  const innerH = height - padY * 2;
  const max = Math.max(1, target ?? 0, ...values);
  const count = Math.max(1, values.length);
  const points = values.map((value, index) => ({
    x: padX + (count === 1 ? innerW / 2 : (innerW * index) / (count - 1)),
    y: padY + innerH - (value / max) * innerH,
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
    // RN 的旋转以中心为原点，因此把线段居中放在两点中点
    return {
      key: `seg-${index}`,
      left: (point.x + next.x) / 2 - length / 2,
      top: (point.y + next.y) / 2 - 1,
      width: length,
      angle
    };
  });

  const targetY = target !== undefined ? padY + innerH - (target / max) * innerH : null;

  return (
    <View>
      <View style={[styles.canvas, { height }]} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? (
          <>
            {targetY !== null ? <View style={[styles.targetLine, { top: targetY, width: innerW, left: padX }]} /> : null}
            {segments.map((segment) => (
              segment ? (
                <View
                  key={segment.key}
                  style={[
                    styles.segment,
                    {
                      left: segment.left,
                      top: segment.top,
                      width: segment.width,
                      transform: [{ rotate: `${segment.angle}deg` }]
                    }
                  ]}
                />
              ) : null
            ))}
            {points.map((point, index) => (
              <View key={`dot-${index}`} style={[styles.dot, { left: point.x - 3, top: point.y - 3 }]} />
            ))}
          </>
        ) : null}
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
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
  segment: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#c7000b',
    borderRadius: 1
  },
  dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#c7000b' },
  targetLine: { position: 'absolute', height: 1, borderTopWidth: 1, borderTopColor: '#e5a5a7', borderStyle: 'dashed' },
  unit: { position: 'absolute', right: 2, top: 0, fontSize: 9, color: '#ccc' },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  label: { fontSize: 9, color: '#aaa', flex: 1, textAlign: 'center' }
});