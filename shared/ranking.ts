/**
 * 음식 적합도 정렬.
 * - 상태는 '먹어도 됨/안 됨'의 판정이 아니라 탐색 순서를 정하기 위한 참고 분류다.
 * - 우선순위: 개인 반응 기록(충분할 때) > 현재 식사 컨디션 > 공통 분류.
 * - 투여 경과만으로 상태를 바꾸지 않는다.
 */
import type { ConditionState, Food, FoodStatus, FormCategory, ReactionSummary } from './types';
import { STATUS_ORDER } from './labels';

export const MIN_PERSONAL_RECORDS = 2;

export type StatusSource = 'personal' | 'condition' | 'base';

export interface EffectiveStatus {
  status: FoodStatus;
  source: StatusSource;
}

export function personalStatus(summary: ReactionSummary | undefined): FoodStatus | null {
  if (!summary) return null;
  const total = summary.good + summary.ok + summary.bad;
  if (total < MIN_PERSONAL_RECORDS) return null;
  if (summary.bad / total >= 0.5) return 'heavy';
  if (summary.good / total >= 0.6) return 'easy';
  return 'depends';
}

export function conditionStatus(food: Pick<Food, 'status' | 'fat' | 'spice'>, condition: ConditionState): FoodStatus {
  if (condition === 'light') {
    if (food.status === 'easy' && food.spice >= 3) return 'depends';
    return food.status;
  }
  if (condition === 'hearty') {
    if (food.status === 'heavy' && food.fat <= 2 && food.spice <= 2) return 'depends';
    return food.status;
  }
  return food.status;
}

export function effectiveStatus(food: Food, condition: ConditionState, summary?: ReactionSummary): EffectiveStatus {
  const personal = personalStatus(summary);
  if (personal) return { status: personal, source: 'personal' };
  const byCondition = conditionStatus(food, condition);
  return { status: byCondition, source: byCondition === food.status ? 'base' : 'condition' };
}

const HEARTY_FORM_WEIGHT: Record<FormCategory, number> = {
  rice: 0,
  protein: 0,
  soup: 0,
  noodle: 0.5,
  pan: 1,
  snack: 1,
  side: 1.5,
  healthy: 1.5,
  bakery: 2,
  drink: 2.5,
};

/** 같은 상태 안에서의 정렬 점수(낮을수록 앞) */
export function conditionScore(food: Food, condition: ConditionState): number {
  switch (condition) {
    case 'light':
      return food.fat * 3 + food.spice * 2;
    case 'hearty':
      return HEARTY_FORM_WEIGHT[food.form] * 2 + food.spice * 0.5;
    default:
      return food.fat + food.spice;
  }
}

export const statusRank = (s: FoodStatus) => STATUS_ORDER.indexOf(s);

export type SortMode = 'fit' | 'name';

export interface RankedFood {
  food: Food;
  status: FoodStatus;
  source: StatusSource;
  score: number;
  match: number;
}

const collator = new Intl.Collator('ko');

export function compareRanked(mode: SortMode) {
  return (a: RankedFood, b: RankedFood): number => {
    if (mode === 'name') return collator.compare(a.food.name, b.food.name);
    return statusRank(a.status) - statusRank(b.status) || b.match - a.match || a.score - b.score || collator.compare(a.food.name, b.food.name);
  };
}
