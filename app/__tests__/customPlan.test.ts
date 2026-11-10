import { createCustomPlanState, customSkillItems, customSeriesNeeds, type CustomPlan } from '../src/model/customPlan';

const plan: CustomPlan = {
  title: '备考',
  icon: '📚',
  description: '每天推进一点',
  skills: [
    {
      name: '阅读',
      icon: '📖',
      unit: '页',
      series: [
        {
          id: 'reading_main',
          name: '阅读',
          desc: '阅读累计达到 {need} 页',
          icon: '📖',
          start: 10,
          end: 300,
          steps: 5,
          pointsStart: 20,
          pointsEnd: 60
        }
      ]
    }
  ]
};

describe('自定义清单', () => {
  test('由序列生成对数阈值和条目', () => {
    expect(customSeriesNeeds(plan.skills[0].series[0])).toEqual([10, 23, 55, 130, 300]);
    const state = createCustomPlanState(plan);
    const items = customSkillItems(state, '阅读');
    expect(items).toHaveLength(5);
    expect(items[0].need).toBe(10);
    expect(items[4].need).toBe(300);
    expect(items[0].progress).toBe(0);
  });
});

