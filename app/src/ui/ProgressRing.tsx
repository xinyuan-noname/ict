import React from 'react';
import { Text, View } from 'react-native';
import { palette, useTheme } from './theme';

export interface ProgressRingProps {
  ratio: number;
  size?: number;
  segments?: number;
  color?: string;
  trackColor?: string;
  value?: string;
  unit?: string;
  label?: string;
  thickness?: number;
  children?: React.ReactNode;
}

/**
 * 分段圆环：纯 View 实现，RN 三端 / Web 表现一致，无 SVG 依赖。
 * 通过「旋转 + 径向平移」把短线段排成圆，颜色与粗细由设计令牌控制。
 */
export function ProgressRing({
  ratio,
  size = 176,
  segments = 64,
  color,
  trackColor,
  value,
  unit,
  label,
  thickness = 4,
  children
}: ProgressRingProps): React.JSX.Element {
  const { palette: themePalette } = useTheme();
  const safeRatio = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const active = Math.round(segments * safeRatio);
  const radius = size / 2 - 16;
  const height = Math.max(8, Math.round(size * 0.085));
  const center = size / 2;
  const main = color ?? themePalette.brand;
  const track = trackColor ?? `${main}18`;
  return (
    <View style={{ width: size, height: size }}>
      {Array.from({ length: segments }, (_, index) => {
        const angle = (index / segments) * 360;
        const on = index < active;
        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              left: center - thickness / 2,
              top: center - thickness / 2,
              width: thickness,
              height,
              borderRadius: thickness,
              backgroundColor: on ? main : track,
              transform: [{ rotate: `${angle}deg` }, { translateY: -radius }]
            }}
          />
        );
      })}
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {children ?? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
              <Text style={{ fontSize: size * 0.19, lineHeight: size * 0.22, fontWeight: '800', color: themePalette.ink }}>
                {value ?? `${Math.round(safeRatio * 100)}`}
              </Text>
              <Text style={{ fontSize: size * 0.085, fontWeight: '700', color: main }}>
                {unit ?? '%'}
              </Text>
            </View>
            {label ? (
              <Text style={{ fontSize: 11, color: themePalette.muted, marginTop: 3 }}>{label}</Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

export function RingLegend({
  items
}: {
  items: { label: string; value: string; color?: string }[];
}): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20 }}>
      {items.map((item) => (
        <View key={item.label} style={{ alignItems: 'center', flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {item.color ? (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.color }} />
            ) : null}
            <Text style={{ fontSize: 14, fontWeight: '800', color: palette.ink }}>{item.value}</Text>
          </View>
          <Text style={{ fontSize: 10.5, color: palette.muted, marginTop: 2 }}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
