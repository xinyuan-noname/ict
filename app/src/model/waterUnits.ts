// 饮水单位：记账始终以 ml 为准，单位只影响展示与「按单位记一杯」
import AsyncStorage from '@react-native-async-storage/async-storage';

export const WATER_UNITS_KEY = 'check.water.units.v1';

export interface WaterUnit {
  id: string;
  name: string;
  ml: number;
  builtin: boolean;
}

export const BUILTIN_WATER_UNITS: WaterUnit[] = [
  { id: 'unit_ml', name: '毫升', ml: 1, builtin: true },
  { id: 'unit_cup', name: '杯', ml: 250, builtin: true },
  { id: 'unit_bottle', name: '农夫山泉', ml: 550, builtin: true }
];

export const UNIT_MIN_ML = 50;
export const UNIT_MAX_ML = 2000;
export const UNIT_NAME_MAX = 12;

export function allWaterUnits(custom: WaterUnit[]): WaterUnit[] {
  return [...BUILTIN_WATER_UNITS, ...custom];
}

// 返回 null 表示校验通过，否则返回给用户看的错误文案
export function validateWaterUnit(name: string, ml: number, existing: WaterUnit[]): string | null {
  const trimmed = name.trim();
  if (!trimmed || [...trimmed].length > UNIT_NAME_MAX) {
    return `单位名称需为 1-${UNIT_NAME_MAX} 个字符`;
  }
  if (!Number.isInteger(ml) || ml < UNIT_MIN_ML || ml > UNIT_MAX_ML) {
    return `容量需为 ${UNIT_MIN_ML}-${UNIT_MAX_ML} ml 的整数`;
  }
  if (existing.some((u) => u.name === trimmed)) {
    return '该单位名称已存在';
  }
  return null;
}

export async function loadCustomWaterUnits(): Promise<WaterUnit[]> {
  try {
    const raw = await AsyncStorage.getItem(WATER_UNITS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WaterUnit[];
    return Array.isArray(parsed) ? parsed.filter((u) => u && typeof u.id === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCustomWaterUnits(units: WaterUnit[]): Promise<void> {
  return AsyncStorage.setItem(WATER_UNITS_KEY, JSON.stringify(units));
}