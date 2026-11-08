import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { palette, useTheme } from '../ui/theme';

export interface MlSliderProps {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  accent?: string;
}

const THUMB = 28;

// 拖动选择 ml（不落账），确认记录由外部按钮完成
export function MlSlider({ min = 50, max = 1500, step = 50, value, onChange, accent }: MlSliderProps): React.JSX.Element {
  const { palette: themePalette } = useTheme();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const color = accent ?? themePalette.brand;

  const responder = useMemo(() => {
    const snap = (x: number): number => {
      const w = widthRef.current || 1;
      const ratio = Math.max(0, Math.min(1, x / w));
      const raw = min + ratio * (max - min);
      return Math.round(raw / step) * step;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => onChange(snap(event.nativeEvent.locationX)),
      onPanResponderMove: (event) => onChange(snap(event.nativeEvent.locationX))
    });
  }, [min, max, step, onChange]);

  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const travel = Math.max(0, width - THUMB);

  return (
    <View
      style={styles.track}
      onLayout={(event: LayoutChangeEvent) => {
        const w = event.nativeEvent.layout.width;
        widthRef.current = w;
        setWidth(w);
      }}
      {...responder.panHandlers}
    >
      <View style={styles.rail} />
      <View style={[styles.fill, { width: ratio * width, backgroundColor: color }]} />
      <View style={[styles.thumb, { left: ratio * travel, borderColor: color }]}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: THUMB + 16, justifyContent: 'center' },
  rail: { height: 8, borderRadius: 4, backgroundColor: palette.canvasDeep },
  fill: { position: 'absolute', left: 0, height: 8, borderRadius: 4 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: palette.surface,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#101828',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4
  }
});
