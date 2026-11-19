import { logInterpolate } from './englishChecklist';

export type CustomTargetPeriod = 'day' | 'week' | 'month';

export type CustomPlanMode = 'recurring' | 'deadline';

const GENERIC_TITLES = ['我的清单', '自定义', '自定义清单', '我的自定义清单'];

export function customPlanTitle(plan: Pick<CustomPlan, 'title' | 'skills'>): string {
  const title = plan.title?.trim();
  const generic = (value: string): boolean =>
    GENERIC_TITLES.some((item) => value === item || value.includes(item));
  if (title && !generic(title)) {
    return title;
  }
  const skill = plan.skills[0]?.name?.trim();
  const base = skill && !generic(skill) ? skill : '学习';
  return `${base}清单`;
}

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
  id?: string;
  title: string;
  icon: string;
  description: string;
  skills: CustomSkill[];
  mode?: CustomPlanMode;
  deadline?: string;
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
  const planWithId: CustomPlan = {
    ...plan,
    title: customPlanTitle(plan),
    id: plan.id ?? `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  };
  const itemProgress: Record<string, number> = {};
  const itemTargets: Record<string, number> = {};
  const dailyBySkill: Record<string, Record<string, number>> = {};
  const targetsBySkill: Record<string, number> = {};
  const periodsBySkill: Record<string, CustomTargetPeriod> = {};
  for (const skill of planWithId.skills) {
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
  return { plan: planWithId, itemProgress, itemTargets, dailyBySkill, targetsBySkill, periodsBySkill };
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
