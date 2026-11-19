import AsyncStorage from '@react-native-async-storage/async-storage';
import { customPlanTitle, type CustomPlanState } from '../model/customPlan';

const KEY = 'local.customPlans.v2';
const LEGACY_KEY = 'local.customPlan.v1';

function withId(state: CustomPlanState): CustomPlanState {
  const nextTitle = customPlanTitle(state.plan);
  if (state.plan.id && nextTitle === state.plan.title) {
    return state;
  }
  return {
    ...state,
    plan: {
      ...state.plan,
      id: state.plan.id ?? `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      title: nextTitle
    }
  };
}

function valid(state: unknown): state is CustomPlanState {
  return Boolean(
    state &&
      typeof state === 'object' &&
      (state as CustomPlanState).plan?.skills?.length
  );
}

export async function loadCustomPlanStates(): Promise<CustomPlanState[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(valid).map(withId);
      }
    }

    // 兼容旧版单清单数据，并迁移到数组。
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as unknown;
      if (valid(parsed)) {
        const migrated = [withId(parsed)];
        await AsyncStorage.setItem(KEY, JSON.stringify(migrated));
        await AsyncStorage.removeItem(LEGACY_KEY);
        return migrated;
      }
    }
    return [];
  } catch {
    return [];
  }
}

export async function saveCustomPlanStates(states: CustomPlanState[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(states));
}

export async function clearCustomPlanStates(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
  await AsyncStorage.removeItem(LEGACY_KEY);
}
