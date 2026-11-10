import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CustomPlanState } from '../model/customPlan';

const KEY = 'local.customPlan.v1';

export async function loadCustomPlanState(): Promise<CustomPlanState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CustomPlanState;
    if (!parsed?.plan?.skills?.length) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveCustomPlanState(state: CustomPlanState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}
