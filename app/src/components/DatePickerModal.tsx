import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { businessToday } from '../model/waterGoal';

const ITEM_HEIGHT = 34;

export interface DatePickerModalProps {
  visible: boolean;
  value: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

interface Parts {
  year: number;
  month: number;
  day: number;
}

function parse(value: string): Parts | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!matched) return null;
  return { year: Number(matched[1]), month: Number(matched[2]), day: Number(matched[3]) };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

// 自绘日期选择器：年 / 月 / 日三列滚动，零第三方依赖，RN 三端与 Web 一致
export function DatePickerModal({ visible, value, onCancel, onConfirm }: DatePickerModalProps): React.JSX.Element {
  const todayYear = Number(businessToday().slice(0, 4));
  const initial = parse(value) ?? { year: 2000, month: 1, day: 1 };
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);

  const yearRef = useRef<ScrollView>(null);
  const monthRef = useRef<ScrollView>(null);
  const dayRef = useRef<ScrollView>(null);

  const years = Array.from({ length: todayYear - 1930 + 1 }, (_, i) => 1930 + i);
  const maxDay = daysInMonth(year, month);
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  // 每次打开回到当前值，并滚到选中项
  useEffect(() => {
    if (!visible) return;
    const next = parse(value) ?? { year: 2000, month: 1, day: 1 };
    setYear(next.year);
    setMonth(next.month);
    setDay(next.day);
    const timer = setTimeout(() => {
      yearRef.current?.scrollTo({ y: years.indexOf(next.year) * ITEM_HEIGHT, animated: false });
      monthRef.current?.scrollTo({ y: (next.month - 1) * ITEM_HEIGHT, animated: false });
      dayRef.current?.scrollTo({ y: (next.day - 1) * ITEM_HEIGHT, animated: false });
    }, 30);
    return () => clearTimeout(timer);
    // years 由 todayYear 决定，这里只需响应打开与外部值变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, value]);

  const pickYear = (next: number): void => {
    setYear(next);
    setDay((prev) => Math.min(prev, daysInMonth(next, month)));
  };
  const pickMonth = (next: number): void => {
    setMonth(next);
    setDay((prev) => Math.min(prev, daysInMonth(year, next)));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.mask} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <View style={styles.head}>
            <Text style={styles.title}>选择出生日期</Text>
            <Pressable accessibilityRole="button" onPress={onCancel}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <Text testID="date-picker-preview" style={styles.preview}>{`${year}-${pad(month)}-${pad(day)}`}</Text>

          <View style={styles.columns}>
            <Column
              label="年"
              scrollRef={yearRef}
              items={years}
              selected={year}
              onSelect={pickYear}
              scrollIndex={years.indexOf(year)}
            />
            <Column
              label="月"
              scrollRef={monthRef}
              items={Array.from({ length: 12 }, (_, i) => i + 1)}
              selected={month}
              onSelect={pickMonth}
              scrollIndex={month - 1}
            />
            <Column
              label="日"
              scrollRef={dayRef}
              items={days}
              selected={day}
              onSelect={setDay}
              scrollIndex={day - 1}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            style={styles.primary}
            onPress={() => onConfirm(`${year}-${pad(month)}-${pad(day)}`)}
          >
            <Text style={styles.primaryText}>确定</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Column({
  label,
  items,
  selected,
  onSelect,
  scrollRef,
  scrollIndex
}: {
  label: string;
  items: number[];
  selected: number;
  onSelect: (value: number) => void;
  scrollRef: React.RefObject<ScrollView>;
  scrollIndex: number;
}): React.JSX.Element {
  return (
    <View style={styles.column}>
      <Text style={styles.columnLabel}>{label}</Text>
      <ScrollView
        ref={scrollRef}
        style={styles.columnScroll}
        showsVerticalScrollIndicator={false}
        onLayout={() => scrollRef.current?.scrollTo({ y: Math.max(0, scrollIndex) * ITEM_HEIGHT, animated: false })}
      >
        {items.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: item === selected }}
            style={[styles.item, item === selected && styles.itemOn]}
            onPress={() => onSelect(item)}
          >
            <Text style={[styles.itemText, item === selected && styles.itemTextOn]}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '600', color: '#222' },
  close: { fontSize: 16, color: '#999', paddingHorizontal: 6 },
  preview: { fontSize: 20, fontWeight: '700', color: '#c7000b', textAlign: 'center', marginVertical: 10 },
  columns: { flexDirection: 'row', gap: 10 },
  column: { flex: 1 },
  columnLabel: { fontSize: 11, color: '#999', textAlign: 'center', marginBottom: 4 },
  columnScroll: { height: ITEM_HEIGHT * 5, borderRadius: 10, backgroundColor: '#fafafa' },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemOn: { backgroundColor: '#fdecec' },
  itemText: { fontSize: 14, color: '#555' },
  itemTextOn: { color: '#c7000b', fontWeight: '700' },
  primary: { marginTop: 14, backgroundColor: '#c7000b', borderRadius: 22, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '600' }
});