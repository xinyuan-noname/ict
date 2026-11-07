import {
  CATEGORY_LISTS,
  checklistsOf,
  INITIAL_NAV,
  LIST_KEYS,
  resolveList,
  subTabFor,
  withCategory,
  withSubTab,
  withTab,
  type NavState
} from '../src/navigation/shellState';

function frozen(state: NavState): NavState {
  return Object.freeze({
    ...state,
    subTabByList: Object.freeze({ ...state.subTabByList })
  }) as NavState;
}

describe('导航状态机', () => {
  test('初值与常量完备', () => {
    expect(INITIAL_NAV).toEqual({
      tab: 'check',
      category: 'health',
      list: 'water',
      subTabByList: {}
    });
    expect(LIST_KEYS).toEqual(['water', 'medication', 'sport', 'english']);
    expect(checklistsOf('health')).toEqual(['water', 'medication', 'sport']);
    expect(checklistsOf('learning')).toEqual(['english']);
  });

  test('二级位置默认统计且按清单记忆', () => {
    expect(subTabFor(INITIAL_NAV, 'water')).toBe('stats');

    const withSport = withSubTab(INITIAL_NAV, 'sport', 'achievements');
    expect(subTabFor(withSport, 'sport')).toBe('achievements');
    expect(subTabFor(withSport, 'water')).toBe('stats');

    const twice = withSubTab(withSport, 'sport', 'stats');
    expect(subTabFor(twice, 'sport')).toBe('stats');
  });

  test('withSubTab 不影响其他清单且不修改入参', () => {
    const base = frozen(INITIAL_NAV);
    const next = withSubTab(base, 'english', 'achievements');
    expect(subTabFor(next, 'english')).toBe('achievements');
    expect(subTabFor(next, 'water')).toBe('stats');
    expect(base.subTabByList).toEqual({});
    expect(() => withSubTab(base, 'water', 'stats')).not.toThrow();
  });

  test('切 tab 保留分类、清单与二级位置', () => {
    const state = withSubTab({ ...INITIAL_NAV, list: 'sport' }, 'sport', 'achievements');

    const toData = withTab(state, 'data');
    expect(toData.tab).toBe('data');
    expect(toData.list).toBe('sport');
    expect(subTabFor(toData, 'sport')).toBe('achievements');

    const toProfile = withTab(withTab(state, 'data'), 'profile');
    expect(toProfile.tab).toBe('profile');
    expect(toProfile.list).toBe('sport');
  });

  test('切分类只回落清单，不劫持 tab 与记忆', () => {
    const state = frozen({
      tab: 'data',
      category: 'health',
      list: 'water',
      subTabByList: { sport: 'achievements' }
    });

    const learning = withCategory(state, 'learning');
    expect(learning.category).toBe('learning');
    expect(learning.list).toBe('english');
    expect(learning.tab).toBe('data');
    expect(subTabFor(learning, 'sport')).toBe('achievements');

    const health = withCategory(learning, 'health');
    expect(health.list).toBe('water');
    expect(health.tab).toBe('data');
    expect(() => withCategory(state, 'learning')).not.toThrow();
  });

  test('停用清单回落首项，空集合返回 null', () => {
    expect(resolveList('health', 'water', ['water', 'medication'])).toBe('water');
    expect(resolveList('health', 'sport', ['water', 'medication'])).toBe('water');
    expect(resolveList('health', 'sport', ['medication'])).toBe('medication');
    expect(resolveList('health', 'water', [])).toBeNull();
    expect(resolveList('learning', 'english', ['english'])).toBe('english');
    expect(resolveList('learning', 'english', ['water'])).toBeNull();
  });

  test('模块不持久化、不发起请求', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../src/navigation/shellState.ts'),
      'utf8'
    ) as string;
    expect(source).not.toContain('AsyncStorage');
    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('sessionStorage');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('any');
  });

  test('分类集合与清单键一致', () => {
    const all = [...CATEGORY_LISTS.health, ...CATEGORY_LISTS.learning];
    expect(new Set(all)).toEqual(new Set(LIST_KEYS));
    expect(all.length).toBe(LIST_KEYS.length);
  });
});