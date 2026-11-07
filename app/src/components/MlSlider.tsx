import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

export interface MlSliderProps {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}

const THUMB = 26;

// 拖动选择 ml（不落账），确认记录由外部按钮完成
export function MlSlider({ min = 50, max = 1500, step = 50, value, onChange }: MlSliderProps): React.JSX.Element {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

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
      <View style={[styles.fill, { width: ratio * width }]} />
      <View style={[styles.thumb, { left: ratio * travel }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: THUMB + 14, justifyContent: 'center' },
  rail: { height: 6, borderRadius: 3, backgroundColor: '#f0dcdd' },
  fill: { position: 'absolute', left: 0, height: 6, borderRadius: 3, backgroundColor: '#c7000b' },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#c7000b'
  }
});