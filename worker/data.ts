/** 개인 데이터 조회 헬퍼. 모든 쿼리는 user_id 조건을 포함한다. */
import type {
  ConditionState,
  FoodReaction,
  MealCondition,
  Medication,
  MedicationLog,
  PerceivedLevel,
  ReactionKind,
  ReactionSummary,
  ScheduleType,
} from '../shared/types';

interface MedRow {
  id: string;
  name: string;
  schedule_type: ScheduleType;
  interval_days: number | null;
  default_time: string | null;
  effect_hours: number | null;
  dose_label: string | null;
  sort_order: number;
}

export async function loadMedications(db: D1Database, userId: string): Promise<Medication[]> {
  const [meds, patterns] = await db.batch([
    db.prepare(
      'SELECT id, name, schedule_type, interval_days, default_time, effect_hours, dose_label, sort_order FROM medications WHERE user_id = ? ORDER BY sort_order, created_at',
    ).bind(userId),
    db.prepare('SELECT medication_id, day_offset, level FROM perceived_patterns WHERE user_id = ? ORDER BY day_offset').bind(userId),
  ]);
  const byMed = new Map<string, { dayOffset: number; level: PerceivedLevel }[]>();
  for (const p of patterns.results as { medication_id: string; day_offset: number; level: PerceivedLevel }[]) {
    const list = byMed.get(p.medication_id) ?? [];
    list.push({ dayOffset: p.day_offset, level: p.level });
    byMed.set(p.medication_id, list);
  }
  return (meds.results as unknown as MedRow[]).map((m) => ({
    id: m.id,
    name: m.name,
    scheduleType: m.schedule_type,
    intervalDays: m.interval_days,
    defaultTime: m.default_time,
    effectHours: m.effect_hours,
    doseLabel: m.dose_label,
    sortOrder: m.sort_order,
    patterns: byMed.get(m.id) ?? [],
  }));
}

interface LogRow {
  id: string;
  medication_id: string;
  taken_at: string;
  dose_label: string | null;
  note: string | null;
}

const toLog = (r: LogRow): MedicationLog => ({
  id: r.id,
  medicationId: r.medication_id,
  takenAt: r.taken_at,
  doseLabel: r.dose_label,
  note: r.note,
});

/** 약물별 최근 기록 (기본 약물당 최대 limit건) */
export async function loadRecentLogs(db: D1Database, userId: string, limit = 30, before?: string): Promise<MedicationLog[]> {
  const rows = await db
    .prepare(
      `SELECT id, medication_id, taken_at, dose_label, note FROM (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY medication_id ORDER BY taken_at DESC) AS rn
         FROM medication_logs WHERE user_id = ?1 AND (?2 IS NULL OR taken_at <= ?2)
       ) WHERE rn <= ?3 ORDER BY taken_at DESC`,
    )
    .bind(userId, before ?? null, limit)
    .all<LogRow>();
  return rows.results.map(toLog);
}

export async function loadCondition(db: D1Database, userId: string): Promise<MealCondition> {
  const row = await db
    .prepare('SELECT state, symptoms, updated_at FROM meal_conditions WHERE user_id = ?')
    .bind(userId)
    .first<{ state: ConditionState; symptoms: string; updated_at: string }>();
  if (!row) return { state: 'normal', symptoms: [], updatedAt: new Date(0).toISOString() };
  return { state: row.state, symptoms: JSON.parse(row.symptoms), updatedAt: row.updated_at };
}

interface ReactionRow {
  id: string;
  food_id: string;
  variant_id: string | null;
  reaction: ReactionKind;
  eaten_at: string;
  created_at: string;
  updated_at: string;
  medication_context: string;
  condition_state: ConditionState | null;
  note: string | null;
}

export const toReaction = (r: ReactionRow): FoodReaction => ({
  id: r.id,
  foodId: r.food_id,
  variantId: r.variant_id,
  reaction: r.reaction,
  eatenAt: r.eaten_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  medicationContext: JSON.parse(r.medication_context),
  conditionState: r.condition_state,
  note: r.note,
});

export async function loadReactionSummaries(db: D1Database, userId: string): Promise<ReactionSummary[]> {
  const rows = await db
    .prepare(
      `SELECT food_id,
              SUM(reaction = 'good') AS good, SUM(reaction = 'ok') AS ok, SUM(reaction = 'bad') AS bad,
              MAX(eaten_at) AS last_eaten_at,
              (SELECT r2.reaction FROM food_reactions r2 WHERE r2.user_id = r.user_id AND r2.food_id = r.food_id
               ORDER BY r2.eaten_at DESC, r2.created_at DESC LIMIT 1) AS last_reaction
       FROM food_reactions r WHERE user_id = ? GROUP BY food_id`,
    )
    .bind(userId)
    .all<{ food_id: string; good: number; ok: number; bad: number; last_eaten_at: string; last_reaction: ReactionKind }>();
  return rows.results.map((r) => ({
    foodId: r.food_id,
    good: r.good,
    ok: r.ok,
    bad: r.bad,
    lastReaction: r.last_reaction,
    lastEatenAt: r.last_eaten_at,
  }));
}
