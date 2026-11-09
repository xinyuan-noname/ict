// 导航状态机：纯内存、纯函数、零 I/O（NAV-13 禁止跨会话持久化）。
// 语义约定：tab 只有 check / data / profile 三项，统计与成就属于 data 的二级。

export type Tab = 'check' | 'data' | 'profile';
export type Category = 'health' | 'learning';
export type ListKey = 'water' | 'medication' | 'sport' | 'english';
export type DataSubTab = 'stats' | 'achievements';

export interface NavState {
  tab: Tab;
  category: Category;
  list: ListKey;
  /** 按清单记忆的数据页二级位置；只读，跨会话不保留。 */
  subTabByList: Readonly<Partial<Record<ListKey, DataSubTab>>>;
}

export const LIST_KEYS: readonly ListKey[] = ['water', 'medication', 'sport', 'english'];

export const CATEGORY_LISTS: Readonly<Record<Category, readonly ListKey[]>> = {
  health: ['water', 'medication', 'sport'],
  learning: ['english']
};

export const CATEGORY_NAMES: Readonly<Record<Category, string>> = {
  health: '健康',
  learning: '英语'
};

export const INITIAL_NAV: NavState = {
  tab: 'check',
  category: 'health',
  list: 'water',
  subTabByList: {}
};

// 无记忆时恒为「统计」；只读取目标清单，不触碰其他清单。
export function subTabFor(state: NavState, list: ListKey): DataSubTab {
  return state.subTabByList[list] ?? 'stats';
}

// 返回新对象，仅改目标清单；其他清单的引用保持不变。
export function withSubTab(state: NavState, list: ListKey, sub: DataSubTab): NavState {
  return {
    ...state,
    subTabByList: { ...state.subTabByList, [list]: sub }
  };
}

// 只改 tab；category / list / subTabByList 一律不动（NAV-03/07）。
export function withTab(state: NavState, tab: Tab): NavState {
  return { ...state, tab };
}

// 切分类：清单回落该分类首项，tab 与全部二级记忆保留。
export function withCategory(state: NavState, category: Category): NavState {
  const first = CATEGORY_LISTS[category][0];
  return {
    ...state,
    category,
    list: first ?? state.list,
    subTabByList: { ...state.subTabByList }
  };
}

// 停用/缺失清单时回落；无可用项返回 null，由调用方渲染「暂不可用」。
export function resolveList(
  category: Category,
  current: ListKey,
  enabled: readonly ListKey[]
): ListKey | null {
  const allowed = CATEGORY_LISTS[category].filter((key) => enabled.includes(key));
  if (allowed.includes(current)) {
    return current;
  }
  return allowed[0] ?? null;
}

export function checklistsOf(category: Category): readonly ListKey[] {
  return CATEGORY_LISTS[category];
}