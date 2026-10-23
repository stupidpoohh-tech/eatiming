export type FoodStatus = 'easy' | 'depends' | 'heavy';
export type ConditionState = 'light' | 'normal' | 'hearty';
export type ReactionKind = 'good' | 'ok' | 'bad';
export type Level = 1 | 2 | 3;

export type FormCategory = 'rice' | 'soup' | 'noodle' | 'protein' | 'pan' | 'snack' | 'side' | 'healthy' | 'bakery' | 'drink';

export type Cuisine = 'korean' | 'chinese' | 'japanese' | 'western' | 'sea' | 'other';

export interface FoodVariant {
  id: string;
  name: string;
  status: FoodStatus;
  fat: Level;
  note: string;
}

export interface Food {
  id: string;
  name: string;
  form: FormCategory;
  cuisine: Cuisine;
  status: FoodStatus;
  fat: Level;
  spice: Level;
  tags: string[];
  description: string;
  aliases: string[];
  variants: FoodVariant[];
}

export type ScheduleType = 'interval' | 'daily';
export type PerceivedLevel = 'strongest' | 'strong' | 'normal' | 'weak' | 'weakest';

export interface Medication {
  id: string;
  name: string;
  scheduleType: ScheduleType;
  intervalDays: number | null;
  defaultTime: string | null;
  effectHours: number | null;
  doseLabel: string | null;
  sortOrder: number;
  patterns: { dayOffset: number; level: PerceivedLevel }[];
}

export interface MedicationLog {
  id: string;
  medicationId: string;
  takenAt: string;
  doseLabel: string | null;
  note: string | null;
}

export interface MealCondition {
  state: ConditionState;
  symptoms: string[];
  updatedAt: string;
}

export interface MedicationContextEntry {
  medicationId: string;
  name: string;
  label: string;
}

export interface FoodReaction {
  id: string;
  foodId: string;
  variantId: string | null;
  reaction: ReactionKind;
  eatenAt: string;
  createdAt: string;
  updatedAt: string;
  medicationContext: MedicationContextEntry[];
  conditionState: ConditionState | null;
  note: string | null;
}

export interface ReactionSummary {
  foodId: string;
  good: number;
  ok: number;
  bad: number;
  lastReaction: ReactionKind;
  lastEatenAt: string;
}

export interface SharePermissions {
  shareCondition: boolean;
  shareMedProgress: boolean;
  shareMedSchedule: boolean;
  shareReactions: boolean;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
}

/** 동반자에게 전달되는 데이터. 허용되지 않은 항목은 서버에서 아예 채우지 않는다. */
export interface SharedView {
  shareId: string;
  owner: { id: string; displayName: string; timezone: string };
  permissions: SharePermissions;
  condition: MealCondition | null;
  medications: SharedMedication[] | null;
  reactionSummaries: ReactionSummary[] | null;
}

export interface SharedMedication {
  id: string;
  name: string;
  scheduleType: ScheduleType;
  /** 투여 경과 공유가 허용될 때만 채워진다 */
  progress: {
    intervalDays: number | null;
    effectHours: number | null;
    recentTakenAt: string[];
    patterns: { dayOffset: number; level: PerceivedLevel }[];
  } | null;
  /** 등록 약물 및 복용 시간 공유가 허용될 때만 채워진다 */
  schedule: {
    intervalDays: number | null;
    defaultTime: string | null;
    effectHours: number | null;
    doseLabel: string | null;
    recentLogs: { takenAt: string; doseLabel: string | null }[];
  } | null;
}
