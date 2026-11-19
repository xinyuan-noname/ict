import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ListKey } from '../navigation/shellState';

const KEY = 'local.checkSettings.v1';

export type EnabledLists = Partial<Record<ListKey, boolean>>;

export const BUILTIN_LIST_KEYS: readonly ListKey[] = ['water', 'medication', 'sport', 'english'];

export async function loadEnabledLists(): Promise<EnabledLists> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as EnabledLists;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveEnabledLists(enabled: EnabledLists): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(enabled));
}
