import { logInterpolate } from './englishChecklist';

export type CustomTargetPeriod = 'day' | 'week' | 'month';

export interface CustomSeries {
  id: string;
  name: string;
  desc: string;
  icon: string;
  start: number;
  end: number;
  steps: number;
  pointsStart: number;
  pointsEnd: number;
}

export interface CustomSkill {
  name: string;
  icon: string;
  unit: string;
  series: CustomSeries[];
}

export interface CustomPlan {
  title: string;
  icon: string;
  description: string;
  skills: CustomSkill[];
}

export interface CustomPlanState {
  plan: CustomPlan;
  itemProgress: Record<string, number>;
  itemTargets: Record<string, number>;
  dailyBySkill: Record<string, Record<string, number>>;
  targetsBySkill: Record<string, number>;
  periodsBySkill: Record<string, CustomTargetPeriod>;
}

export interface CustomAchievementItem {
  key: string;
  name: string;
  desc: string;
  icon: string;
  points: number;
  progress: number;
  need: number;
  unit: string;
}

const STAGE_NAMES = ['入门', '熟练', '进阶', '高手', '大师', '宗师', '传奇', '巅峰'];

export function customSeriesNeeds(series: CustomSeries): number[] {
  return logInterpolate(series.start, series.end, series.steps);
}

export function createCustomPlanState(plan: CustomPlan): CustomPlanState {
  const itemProgress: Record<string, number> = {};
  const itemTargets: Record<string, number> = {};
  const dailyBySkill: Record<string, Record<string, number>> = {};
  const targetsBySkill: Record<string, number> = {};
  const periodsBySkill: Record<string, CustomTargetPeriod> = {};
  for (const skill of plan.skills) {
    dailyBySkill[skill.name] = {};
    targetsBySkill[skill.name] = 1;
    periodsBySkill[skill.name] = 'day';
    for (const series of skill.series) {
      const needs = customSeriesNeeds(series);
      needs.forEach((need, index) => {
        const key = `${series.id}_${index + 1}`;
        itemProgress[key] = 0;
        itemTargets[key] = need;
      });
    }
  }
  return { plan, itemProgress, itemTargets, dailyBySkill, targetsBySkill, periodsBySkill };
}

export function customSkillItems(state: CustomPlanState, skillName: string): CustomAchievementItem[] {
  const skill = state.plan.skills.find((item) => item.name === skillName) ?? state.plan.skills[0];
  if (!skill) {
    return [];
  }
  return skill.series.flatMap((series) => {
    const needs = customSeriesNeeds(series);
    return needs.map((need, index) => {
      const key = `${series.id}_${index + 1}`;
      const stage = STAGE_NAMES[index] ?? `${index + 1} 阶`;
      return {
        key,
        name: `${stage} · ${series.name}`,
        desc: series.desc.replace('{need}', String(need)),
        icon: series.icon || skill.icon,
        points: series.pointsStart + Math.round(((series.pointsEnd - series.pointsStart) * index) / Math.max(1, series.steps - 1)),
        progress: state.itemProgress[key] ?? 0,
        need: state.itemTargets[key] ?? need,
        unit: skill.unit
      };
    });
  });
}
