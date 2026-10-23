/**
 * 본인 전용 데이터: 식사 컨디션, 약물·복용 기록, 체감 패턴, 음식 반응.
 * 모든 조회·수정은 세션 사용자 ID로 한정되며, 다른 사용자의 행 ID를 넣어도 404가 된다.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { contextLabel } from '../../shared/timeline';
import type { MedicationContextEntry } from '../../shared/types';
import { requireUser } from '../auth';
import { loadCondition, loadMedications, loadReactionSummaries, loadRecentLogs, toReaction } from '../data';
import { fail, newId, nowIso, parseBody, type AppEnv } from '../lib';
import { notify } from '../realtime';

const FUTURE_TOLERANCE_MS = 5 * 60_000;
const isoDate = z.string().datetime({ offset: true });
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const conditionState = z.enum(['light', 'normal', 'hearty']);

function notFuture(iso: string) {
  if (new Date(iso).getTime() > Date.now() + FUTURE_TOLERANCE_MS) fail(400, '아직 지나지 않은 시각은 기록할 수 없습니다.');
  return new Date(iso).toISOString();
}

// ───────── 식사 컨디션 ─────────
export const conditionRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => c.json({ condition: await loadCondition(c.env.DB, c.get('user').id) }))
  .put('/', async (c) => {
    const body = await parseBody(
      c,
      z.object({ state: conditionState, symptoms: z.array(z.string().max(30)).max(20).optional() }),
    );
    const user = c.get('user');
    const now = nowIso();
    await c.env.DB.prepare(
      `INSERT INTO meal_conditions (user_id, state, symptoms, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(user_id) DO UPDATE SET state = ?2, symptoms = ?3, updated_at = ?4`,
    )
      .bind(user.id, body.state, JSON.stringify(body.symptoms ?? []), now)
      .run();
    c.executionCtx.waitUntil(notify(c.env, user.id, ['condition']));
    return c.json({ condition: { state: body.state, symptoms: body.symptoms ?? [], updatedAt: now } });
  });

// ───────── 약물 ─────────
const medBase = z.object({
  name: z.string().trim().min(1).max(40),
  scheduleType: z.enum(['interval', 'daily']),
  intervalDays: z.number().int().min(1).max(60).nullable().optional(),
  defaultTime: timeStr.nullable().optional(),
  effectHours: z.number().positive().max(48).nullable().optional(),
  doseLabel: z.string().trim().max(40).nullable().optional(),
});

const patternSchema = z.object({
  patterns: z
    .array(z.object({ dayOffset: z.number().int().min(0).max(60), level: z.enum(['strongest', 'strong', 'normal', 'weak', 'weakest']) }))
    .max(61),
});

const logSchema = z.object({
  takenAt: isoDate,
  doseLabel: z.string().trim().max(40).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

async function ownMedication(db: D1Database, userId: string, medId: string) {
  const row = await db.prepare('SELECT id FROM medications WHERE id = ? AND user_id = ?').bind(medId, userId).first();
  if (!row) fail(404, '약물을 찾을 수 없습니다.');
}

export const medicationRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => {
    const user = c.get('user');
    const [medications, logs] = await Promise.all([loadMedications(c.env.DB, user.id), loadRecentLogs(c.env.DB, user.id, 30)]);
    return c.json({ medications, logs });
  })
  .post('/', async (c) => {
    const body = await parseBody(c, medBase);
    const user = c.get('user');
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM medications WHERE user_id = ?').bind(user.id).first<{ n: number }>();
    if ((count?.n ?? 0) >= 20) fail(400, '약물은 최대 20개까지 등록할 수 있습니다.');
    const id = newId();
    const now = nowIso();
    const interval = body.scheduleType === 'interval';
    await c.env.DB.prepare(
      `INSERT INTO medications (id, user_id, name, schedule_type, interval_days, default_time, effect_hours, dose_label, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        user.id,
        body.name,
        body.scheduleType,
        interval ? (body.intervalDays ?? 7) : null,
        interval ? null : (body.defaultTime ?? null),
        interval ? null : (body.effectHours ?? null),
        body.doseLabel ?? null,
        count?.n ?? 0,
        now,
        now,
      )
      .run();
    c.executionCtx.waitUntil(notify(c.env, user.id, ['medications']));
    return c.json({ id }, 201);
  })
  .patch('/:id', async (c) => {
    const body = await parseBody(c, medBase.partial().omit({ scheduleType: true }));
    const user = c.get('user');
    const id = c.req.param('id');
    await ownMedication(c.env.DB, user.id, id);
    const sets: string[] = [];
    const values: unknown[] = [];
    const map = { name: 'name', intervalDays: 'interval_days', defaultTime: 'default_time', effectHours: 'effect_hours', doseLabel: 'dose_label' } as const;
    for (const [k, col] of Object.entries(map)) {
      const v = body[k as keyof typeof body];
      if (v !== undefined) {
        sets.push(`${col} = ?`);
        values.push(v);
      }
    }
    if (sets.length) {
      await c.env.DB.prepare(`UPDATE medications SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`)
        .bind(...values, nowIso(), id, user.id)
        .run();
      c.executionCtx.waitUntil(notify(c.env, user.id, ['medications']));
    }
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    await ownMedication(c.env.DB, user.id, id);
    await c.env.DB.prepare('DELETE FROM medications WHERE id = ? AND user_id = ?').bind(id, user.id).run();
    c.executionCtx.waitUntil(notify(c.env, user.id, ['medications']));
    return c.json({ ok: true });
  })
  .put('/:id/patterns', async (c) => {
    const body = await parseBody(c, patternSchema);
    const user = c.get('user');
    const id = c.req.param('id');
    await ownMedication(c.env.DB, user.id, id);
    const now = nowIso();
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM perceived_patterns WHERE medication_id = ? AND user_id = ?').bind(id, user.id),
      ...body.patterns.map((p) =>
        c.env.DB.prepare('INSERT INTO perceived_patterns (medication_id, user_id, day_offset, level, updated_at) VALUES (?, ?, ?, ?, ?)').bind(
          id,
          user.id,
          p.dayOffset,
          p.level,
          now,
        ),
      ),
    ]);
    c.executionCtx.waitUntil(notify(c.env, user.id, ['medications']));
    return c.json({ ok: true });
  })
  .get('/:id/logs', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    await ownMedication(c.env.DB, user.id, id);
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 60)));
    const rows = await c.env.DB.prepare(
      'SELECT id, medication_id, taken_at, dose_label, note FROM medication_logs WHERE medication_id = ? AND user_id = ? ORDER BY taken_at DESC LIMIT ?',
    )
      .bind(id, user.id, limit)
      .all<{ id: string; medication_id: string; taken_at: string; dose_label: string | null; note: string | null }>();
    return c.json({
      logs: rows.results.map((r) => ({ id: r.id, medicationId: r.medication_id, takenAt: r.taken_at, doseLabel: r.dose_label, note: r.note })),
    });
  })
  .post('/:id/logs', async (c) => {
    // 복용·투여 기록은 사용자가 명시적으로 확인했을 때만 생성된다.
    const body = await parseBody(c, logSchema);
    const user = c.get('user');
    const id = c.req.param('id');
    await ownMedication(c.env.DB, user.id, id);
    const takenAt = notFuture(body.takenAt);
    const logId = newId();
    const now = nowIso();
    await c.env.DB.prepare(
      'INSERT INTO medication_logs (id, user_id, medication_id, taken_at, dose_label, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(logId, user.id, id, takenAt, body.doseLabel ?? null, body.note ?? null, now, now)
      .run();
    c.executionCtx.waitUntil(notify(c.env, user.id, ['medications']));
    return c.json({ id: logId }, 201);
  });

export const logRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .patch('/:id', async (c) => {
    const body = await parseBody(c, logSchema.partial());
    const user = c.get('user');
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM medication_logs WHERE id = ? AND user_id = ?').bind(id, user.id).first();
    if (!existing) fail(404, '기록을 찾을 수 없습니다.');
    const takenAt = body.takenAt ? notFuture(body.takenAt) : undefined;
    await c.env.DB.prepare(
      `UPDATE medication_logs SET taken_at = COALESCE(?, taken_at),
         dose_label = CASE WHEN ? THEN ? ELSE dose_label END,
         note = CASE WHEN ? THEN ? ELSE note END, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
      .bind(
        takenAt ?? null,
        body.doseLabel !== undefined ? 1 : 0,
        body.doseLabel ?? null,
        body.note !== undefined ? 1 : 0,
        body.note ?? null,
        nowIso(),
        id,
        user.id,
      )
      .run();
    c.executionCtx.waitUntil(notify(c.env, user.id, ['medications']));
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    const user = c.get('user');
    const res = await c.env.DB.prepare('DELETE FROM medication_logs WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
    if (!res.meta.changes) fail(404, '기록을 찾을 수 없습니다.');
    c.executionCtx.waitUntil(notify(c.env, user.id, ['medications']));
    return c.json({ ok: true });
  });

// ───────── 음식 반응 ─────────
const reactionSchema = z.object({
  foodId: z.string().max(40),
  variantId: z.string().max(40).nullable().optional(),
  reaction: z.enum(['good', 'ok', 'bad']),
  eatenAt: isoDate.optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

async function medicationContext(db: D1Database, userId: string, timeZone: string, at: Date): Promise<MedicationContextEntry[]> {
  const [meds, logs] = await Promise.all([loadMedications(db, userId), loadRecentLogs(db, userId, 10, at.toISOString())]);
  return meds.map((m) => ({
    medicationId: m.id,
    name: m.name,
    label: contextLabel(
      m,
      logs.filter((l) => l.medicationId === m.id).map((l) => new Date(l.takenAt)),
      at,
      timeZone,
    ),
  }));
}

async function checkVariant(db: D1Database, foodId: string, variantId: string | null | undefined) {
  const food = await db.prepare('SELECT id FROM foods WHERE id = ?').bind(foodId).first();
  if (!food) fail(404, '음식을 찾을 수 없습니다.');
  if (variantId) {
    const v = await db.prepare('SELECT id FROM food_variants WHERE id = ? AND food_id = ?').bind(variantId, foodId).first();
    if (!v) fail(400, '조리법 옵션이 올바르지 않습니다.');
  }
}

export const reactionRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => {
    const user = c.get('user');
    const foodId = c.req.query('foodId');
    const rows = await c.env.DB.prepare(
      `SELECT * FROM food_reactions WHERE user_id = ?1 AND (?2 IS NULL OR food_id = ?2) ORDER BY eaten_at DESC, created_at DESC LIMIT 200`,
    )
      .bind(user.id, foodId ?? null)
      .all();
    return c.json({ reactions: rows.results.map((r) => toReaction(r as never)) });
  })
  .get('/summary', async (c) => c.json({ summaries: await loadReactionSummaries(c.env.DB, c.get('user').id) }))
  .post('/', async (c) => {
    const body = await parseBody(c, reactionSchema);
    const user = c.get('user');
    await checkVariant(c.env.DB, body.foodId, body.variantId);
    const eatenAt = body.eatenAt ? notFuture(body.eatenAt) : nowIso();
    const [ctx, condition] = await Promise.all([
      medicationContext(c.env.DB, user.id, user.timezone, new Date(eatenAt)),
      loadCondition(c.env.DB, user.id),
    ]);
    const id = newId();
    const now = nowIso();
    await c.env.DB.prepare(
      `INSERT INTO food_reactions (id, user_id, food_id, variant_id, reaction, eaten_at, medication_context, condition_state, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, user.id, body.foodId, body.variantId ?? null, body.reaction, eatenAt, JSON.stringify(ctx), condition.state, body.note ?? null, now, now)
      .run();
    c.executionCtx.waitUntil(notify(c.env, user.id, ['reactions']));
    return c.json({ id }, 201);
  })
  .patch('/:id', async (c) => {
    const body = await parseBody(c, reactionSchema.omit({ foodId: true }).partial());
    const user = c.get('user');
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT food_id FROM food_reactions WHERE id = ? AND user_id = ?')
      .bind(id, user.id)
      .first<{ food_id: string }>();
    if (!existing) fail(404, '기록을 찾을 수 없습니다.');
    if (body.variantId) await checkVariant(c.env.DB, existing.food_id, body.variantId);
    const eatenAt = body.eatenAt ? notFuture(body.eatenAt) : null;
    const ctx = eatenAt ? JSON.stringify(await medicationContext(c.env.DB, user.id, user.timezone, new Date(eatenAt))) : null;
    await c.env.DB.prepare(
      `UPDATE food_reactions SET
         reaction = COALESCE(?, reaction),
         eaten_at = COALESCE(?, eaten_at),
         medication_context = COALESCE(?, medication_context),
         variant_id = CASE WHEN ? THEN ? ELSE variant_id END,
         note = CASE WHEN ? THEN ? ELSE note END,
         updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
      .bind(
        body.reaction ?? null,
        eatenAt,
        ctx,
        body.variantId !== undefined ? 1 : 0,
        body.variantId ?? null,
        body.note !== undefined ? 1 : 0,
        body.note ?? null,
        nowIso(),
        id,
        user.id,
      )
      .run();
    c.executionCtx.waitUntil(notify(c.env, user.id, ['reactions']));
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    const user = c.get('user');
    const res = await c.env.DB.prepare('DELETE FROM food_reactions WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
    if (!res.meta.changes) fail(404, '기록을 찾을 수 없습니다.');
    c.executionCtx.waitUntil(notify(c.env, user.id, ['reactions']));
    return c.json({ ok: true });
  });
