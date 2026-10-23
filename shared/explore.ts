import type { ConditionState, Cuisine, Food, FoodStatus, FormCategory, ReactionSummary } from './types';
import { buildSearchEntry, matchScore, type SearchIndexEntry } from './search';
import { compareRanked, conditionScore, effectiveStatus, type RankedFood, type SortMode } from './ranking';

export type StatusFilter = 'all' | FoodStatus;

export interface ExploreQuery {
  q: string;
  form: FormCategory | null;
  cuisine: Cuisine | null;
  status: StatusFilter;
  sort: SortMode;
}

export interface ExploreResult {
  items: RankedFood[];
  counts: Record<StatusFilter, number>;
}

export function buildIndex(foods: Food[]): Map<string, SearchIndexEntry> {
  return new Map(foods.map((f) => [f.id, buildSearchEntry(f)]));
}

/**
 * 검색·형태·국가 조건으로 탐색 범위를 정하고, 그 범위 안에서 상태별 개수를 센 뒤
 * 상태 필터와 정렬을 적용한다. (정렬과 필터는 서로 독립적)
 */
export function explore(
  foods: Food[],
  index: Map<string, SearchIndexEntry>,
  query: ExploreQuery,
  condition: ConditionState,
  summaries?: Map<string, ReactionSummary>,
): ExploreResult {
  const counts: Record<StatusFilter, number> = { all: 0, easy: 0, depends: 0, heavy: 0 };
  const items: RankedFood[] = [];
  for (const food of foods) {
    if (query.form && food.form !== query.form) continue;
    if (query.cuisine && food.cuisine !== query.cuisine) continue;
    const match = matchScore(index.get(food.id)!, query.q);
    if (match === 0) continue;
    const eff = effectiveStatus(food, condition, summaries?.get(food.id));
    counts.all++;
    counts[eff.status]++;
    if (query.status !== 'all' && eff.status !== query.status) continue;
    items.push({ food, status: eff.status, source: eff.source, score: conditionScore(food, condition), match });
  }
  items.sort(compareRanked(query.sort));
  return { items, counts };
}
