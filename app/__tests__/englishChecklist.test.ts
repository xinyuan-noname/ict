import { ENGLISH_CHECKLIST_GROUPS, logInterpolate } from '../src/model/englishChecklist';

describe('英语成就对数插值', () => {
  test('首尾固定，阶数正确，严格递增', () => {
    const values = logInterpolate(500, 6000, 8);
    expect(values).toHaveLength(8);
    expect(values[0]).toBe(500);
    expect(values[7]).toBe(6000);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThan(values[index - 1]);
    }
  });

  test('小数值不会出现重复档位', () => {
    const values = logInterpolate(1, 5, 3);
    expect(values).toEqual([1, 2, 5]);
  });

  test('英语各分组由起点终点生成，数量与阈值都递增', () => {
    const allItems = ENGLISH_CHECKLIST_GROUPS.flatMap((group) => group.items);
    expect(allItems).toHaveLength(56);
    for (const group of ENGLISH_CHECKLIST_GROUPS) {
      const bySeries = new Map<string, number[]>();
      for (const item of group.items) {
        const seriesId = item.id.replace(/_\d+$/, '');
        const values = bySeries.get(seriesId) ?? [];
        values.push(item.need);
        bySeries.set(seriesId, values);
      }
      for (const values of bySeries.values()) {
        for (let index = 1; index < values.length; index += 1) {
          expect(values[index]).toBeGreaterThan(values[index - 1]);
        }
      }
    }
  });

  test('英语清单的端点覆盖设定范围', () => {
    const words = ENGLISH_CHECKLIST_GROUPS.find((group) => group.name === '百词斩');
    expect(words?.items[0].need).toBe(500);
    expect(words?.items[words.items.length - 1].need).toBe(6000);

    const voa = ENGLISH_CHECKLIST_GROUPS.find((group) => group.name === '听力');
    expect(voa?.items.find((item) => item.id === 'voa_1')?.need).toBe(1);
    expect(voa?.items.find((item) => item.id === 'voa_4')?.need).toBe(15);
  });
});
