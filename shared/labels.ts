import type { ConditionState, Cuisine, FoodStatus, FormCategory, ReactionKind } from './types';

export const FORM_CATEGORIES: { id: FormCategory; label: string }[] = [
  { id: 'rice', label: '밥·죽' },
  { id: 'soup', label: '국물·탕' },
  { id: 'noodle', label: '면' },
  { id: 'protein', label: '고기·생선' },
  { id: 'pan', label: '전·볶음' },
  { id: 'snack', label: '분식·튀김' },
  { id: 'side', label: '반찬·채소' },
  { id: 'healthy', label: '샐러드·건강식' },
  { id: 'bakery', label: '빵·디저트' },
  { id: 'drink', label: '음료' },
];

export const CUISINES: { id: Cuisine; label: string }[] = [
  { id: 'korean', label: '한식' },
  { id: 'chinese', label: '중식' },
  { id: 'japanese', label: '일식' },
  { id: 'western', label: '양식' },
  { id: 'sea', label: '동남아' },
  { id: 'other', label: '기타' },
];

export const FORM_LABEL = Object.fromEntries(FORM_CATEGORIES.map((c) => [c.id, c.label])) as Record<FormCategory, string>;
export const CUISINE_LABEL = Object.fromEntries(CUISINES.map((c) => [c.id, c.label])) as Record<Cuisine, string>;

export const STATUS_ORDER: FoodStatus[] = ['easy', 'depends', 'heavy'];

export const STATUS_LABEL: Record<FoodStatus, string> = {
  easy: '편하게 먹기 좋은 후보',
  depends: '조리법·컨디션에 따라 다름',
  heavy: '상대적으로 부담될 수 있음',
};

export const STATUS_SHORT: Record<FoodStatus, string> = {
  easy: '편함',
  depends: '조건부',
  heavy: '부담 가능',
};

export const CONDITIONS: { id: ConditionState; label: string; hint: string }[] = [
  { id: 'light', label: '담백하게', hint: '담백하게 먹고 싶음' },
  { id: 'normal', label: '보통', hint: '보통' },
  { id: 'hearty', label: '든든하게', hint: '든든하게 먹을 수 있음' },
];

export const CONDITION_LABEL = Object.fromEntries(CONDITIONS.map((c) => [c.id, c.hint])) as Record<ConditionState, string>;

export const REACTIONS: { id: ReactionKind; label: string }[] = [
  { id: 'good', label: '편했어요' },
  { id: 'ok', label: '보통이에요' },
  { id: 'bad', label: '불편했어요' },
];

export const REACTION_LABEL = Object.fromEntries(REACTIONS.map((r) => [r.id, r.label])) as Record<ReactionKind, string>;

export const LEVEL_LABEL = { 1: '낮은 편', 2: '중간', 3: '높은 편' } as const;
