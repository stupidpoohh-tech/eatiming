/**
 * 동반자 공유.
 * - 초대 링크 토큰은 무작위 32바이트이며 DB에는 해시만 저장한다. 72시간 후 만료, 1회만 사용 가능.
 * - 동반자 조회는 매 요청마다 shares 행을 확인한다. 공유 해제(행 삭제) 즉시 접근이 차단된다.
 * - 동반자에게는 허용된 항목만 서버에서 채워 보낸다. 쓰기 경로는 존재하지 않는다.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { SharedMedication, SharedView, SharePermissions } from '../../shared/types';
import { requireUser, userFromRequest } from '../auth';
import { loadCondition, loadMedications, loadReactionSummaries, loadRecentLogs } from '../data';
import { fail, newId, nowIso, parseBody, randomToken, sha256, toBool, type AppEnv } from '../lib';
import { hub, notify } from '../realtime';

export const INVITE_TTL_HOURS = 72;

const permissionsSchema = z.object({
  shareCondition: z.boolean(),
  shareMedProgress: z.boolean(),
  shareMedSchedule: z.boolean(),
  shareReactions: z.boolean(),
});

interface PermRow {
  share_condition: number;
  share_med_progress: number;
  share_med_schedule: number;
  share_reactions: number;
}

export const toPermissions = (r: PermRow): SharePermissions => ({
  shareCondition: toBool(r.share_condition),
  shareMedProgress: toBool(r.share_med_progress),
  shareMedSchedule: toBool(r.share_med_schedule),
  shareReactions: toBool(r.share_reactions),
});

interface ShareRow extends PermRow {
  id: string;
  owner_id: string;
  viewer_id: string;
}

export async function findShare(db: D1Database, ownerId: string, viewerId: string): Promise<ShareRow | null> {
  return db.prepare('SELECT * FROM shares WHERE owner_id = ? AND viewer_id = ?').bind(ownerId, viewerId).first<ShareRow>();
}

/** 권한에 맞춰 동반자용 데이터를 구성한다. 허용되지 않은 항목은 조회조차 하지 않는다. */
export async function buildSharedView(db: D1Database, share: ShareRow): Promise<SharedView> {
  const owner = await db
    .prepare('SELECT id, display_name, timezone FROM users WHERE id = ?')
    .bind(share.owner_id)
    .first<{ id: string; display_name: string; timezone: string }>();
  if (!owner) fail(404, '공유 정보를 찾을 수 없습니다.');
  const p = toPermissions(share);
  const wantMeds = p.shareMedProgress || p.shareMedSchedule;

  const [condition, meds, logs, summaries] = await Promise.all([
    p.shareCondition ? loadCondition(db, owner.id) : null,
    wantMeds ? loadMedications(db, owner.id) : null,
    wantMeds ? loadRecentLogs(db, owner.id, 10) : null,
    p.shareReactions ? loadReactionSummaries(db, owner.id) : null,
  ]);

  const medications: SharedMedication[] | null = meds
    ? meds.map((m) => {
        const mLogs = (logs ?? []).filter((l) => l.medicationId === m.id);
        return {
          id: m.id,
          name: m.name,
          scheduleType: m.scheduleType,
          progress: p.shareMedProgress
            ? { intervalDays: m.intervalDays, effectHours: m.effectHours, recentTakenAt: mLogs.map((l) => l.takenAt), patterns: m.patterns }
            : null,
          schedule: p.shareMedSchedule
            ? {
                intervalDays: m.intervalDays,
                defaultTime: m.defaultTime,
                effectHours: m.effectHours,
                doseLabel: m.doseLabel,
                recentLogs: mLogs.slice(0, 5).map((l) => ({ takenAt: l.takenAt, doseLabel: l.doseLabel })),
              }
            : null,
        };
      })
    : null;

  return {
    shareId: share.id,
    owner: { id: owner.id, displayName: owner.display_name, timezone: owner.timezone },
    permissions: p,
    condition,
    medications,
    reactionSummaries: summaries,
  };
}

async function inviteByToken(db: D1Database, token: string) {
  return db
    .prepare(`SELECT i.*, u.display_name AS owner_name FROM companion_invites i JOIN users u ON u.id = i.owner_id WHERE i.token_hash = ?`)
    .bind(await sha256(token))
    .first<PermRow & { id: string; owner_id: string; owner_name: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }>();
}

function inviteState(inv: { expires_at: string; accepted_at: string | null; revoked_at: string | null }) {
  if (inv.revoked_at) return 'revoked';
  if (inv.accepted_at) return 'used';
  if (inv.expires_at <= nowIso()) return 'expired';
  return 'valid';
}

export const shareRoutes = new Hono<AppEnv>()
  // 초대 링크 미리보기: 비로그인 상태에서는 유효 여부만 알려준다.
  .get('/invites/:token', async (c) => {
    const inv = await inviteByToken(c.env.DB, c.req.param('token'));
    if (!inv) return c.json({ state: 'invalid' as const });
    const state = inviteState(inv);
    const user = await userFromRequest(c);
    if (!user || state !== 'valid') return c.json({ state, requiresLogin: !user });
    return c.json({
      state,
      ownerName: inv.owner_name,
      isOwner: inv.owner_id === user.id,
      permissions: toPermissions(inv),
      expiresAt: inv.expires_at,
    });
  })
  .use(requireUser)
  .get('/shares', async (c) => {
    const user = c.get('user');
    const db = c.env.DB;
    const [outgoing, incoming, invites] = await db.batch([
      db
        .prepare(
          `SELECT s.*, u.display_name AS other_name, u.email AS other_email FROM shares s JOIN users u ON u.id = s.viewer_id
         WHERE s.owner_id = ? ORDER BY s.created_at`,
        )
        .bind(user.id),
      db
        .prepare(
          `SELECT s.*, u.display_name AS other_name FROM shares s JOIN users u ON u.id = s.owner_id
         WHERE s.viewer_id = ? ORDER BY s.created_at`,
        )
        .bind(user.id),
      db
        .prepare(
          `SELECT * FROM companion_invites WHERE owner_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC`,
        )
        .bind(user.id, nowIso()),
    ]);
    type Row = ShareRow & { other_name: string; other_email?: string; created_at: string };
    return c.json({
      outgoing: (outgoing.results as Row[]).map((r) => ({
        id: r.id,
        viewer: { id: r.viewer_id, displayName: r.other_name, email: r.other_email },
        permissions: toPermissions(r),
        createdAt: r.created_at,
      })),
      incoming: (incoming.results as Row[]).map((r) => ({
        id: r.id,
        owner: { id: r.owner_id, displayName: r.other_name },
        permissions: toPermissions(r),
        createdAt: r.created_at,
      })),
      invites: (invites.results as (PermRow & { id: string; created_at: string; expires_at: string })[]).map((r) => ({
        id: r.id,
        permissions: toPermissions(r),
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      })),
    });
  })
  .post('/invites', async (c) => {
    const body = await parseBody(c, z.object({ permissions: permissionsSchema }));
    const user = c.get('user');
    const pending = await c.env.DB.prepare(
      'SELECT COUNT(*) AS n FROM companion_invites WHERE owner_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?',
    )
      .bind(user.id, nowIso())
      .first<{ n: number }>();
    if ((pending?.n ?? 0) >= 5) fail(429, '대기 중인 초대가 너무 많습니다. 기존 초대를 취소해 주세요.');
    const token = randomToken();
    const id = newId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_HOURS * 3_600_000).toISOString();
    const p = body.permissions;
    await c.env.DB.prepare(
      `INSERT INTO companion_invites (id, owner_id, token_hash, share_condition, share_med_progress, share_med_schedule, share_reactions, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, user.id, await sha256(token), +p.shareCondition, +p.shareMedProgress, +p.shareMedSchedule, +p.shareReactions, now.toISOString(), expiresAt)
      .run();
    c.executionCtx.waitUntil(notify(c.env, user.id, ['shares']));
    return c.json({ id, token, expiresAt }, 201);
  })
  .delete('/invites/:id', async (c) => {
    const user = c.get('user');
    const res = await c.env.DB.prepare('UPDATE companion_invites SET revoked_at = ? WHERE id = ? AND owner_id = ? AND accepted_at IS NULL')
      .bind(nowIso(), c.req.param('id'), user.id)
      .run();
    if (!res.meta.changes) fail(404, '초대를 찾을 수 없습니다.');
    c.executionCtx.waitUntil(notify(c.env, user.id, ['shares']));
    return c.json({ ok: true });
  })
  .post('/invites/:token/accept', async (c) => {
    const user = c.get('user');
    const inv = await inviteByToken(c.env.DB, c.req.param('token'));
    if (!inv) fail(404, '유효하지 않은 초대 링크입니다.');
    const state = inviteState(inv);
    if (state !== 'valid') fail(410, state === 'expired' ? '만료된 초대 링크입니다.' : '이미 사용되었거나 취소된 초대 링크입니다.');
    if (inv.owner_id === user.id) fail(400, '본인이 만든 초대는 수락할 수 없습니다.');
    const now = nowIso();
    // 1회용 보장: 아직 수락되지 않은 경우에만 갱신
    const claim = await c.env.DB.prepare(
      'UPDATE companion_invites SET accepted_by = ?, accepted_at = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL',
    )
      .bind(user.id, now, inv.id)
      .run();
    if (!claim.meta.changes) fail(410, '이미 사용된 초대 링크입니다.');
    const id = newId();
    await c.env.DB.prepare(
      `INSERT INTO shares (id, owner_id, viewer_id, share_condition, share_med_progress, share_med_schedule, share_reactions, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
       ON CONFLICT(owner_id, viewer_id) DO UPDATE SET share_condition = ?4, share_med_progress = ?5, share_med_schedule = ?6, share_reactions = ?7, updated_at = ?8`,
    )
      .bind(id, inv.owner_id, user.id, inv.share_condition, inv.share_med_progress, inv.share_med_schedule, inv.share_reactions, now)
      .run();
    const share = await findShare(c.env.DB, inv.owner_id, user.id);
    c.executionCtx.waitUntil(Promise.all([notify(c.env, inv.owner_id, ['shares']), notify(c.env, user.id, ['shares'])]));
    return c.json({ shareId: share!.id, ownerId: inv.owner_id });
  })
  .patch('/shares/:id', async (c) => {
    const body = await parseBody(c, z.object({ permissions: permissionsSchema }));
    const user = c.get('user');
    const share = await c.env.DB.prepare('SELECT * FROM shares WHERE id = ? AND owner_id = ?').bind(c.req.param('id'), user.id).first<ShareRow>();
    if (!share) fail(404, '공유 정보를 찾을 수 없습니다.');
    const p = body.permissions;
    await c.env.DB.prepare(
      'UPDATE shares SET share_condition = ?, share_med_progress = ?, share_med_schedule = ?, share_reactions = ?, updated_at = ? WHERE id = ? AND owner_id = ?',
    )
      .bind(+p.shareCondition, +p.shareMedProgress, +p.shareMedSchedule, +p.shareReactions, nowIso(), share.id, user.id)
      .run();
    c.executionCtx.waitUntil(
      (async () => {
        await hub(c.env, user.id).updatePermissions(share.viewer_id, p);
        await notify(c.env, user.id, ['shares']);
        await notify(c.env, share.viewer_id, ['shares']);
      })(),
    );
    return c.json({ ok: true });
  })
  .delete('/shares/:id', async (c) => {
    // 공유 해제: 소유자 또는 동반자 모두 가능. 행 삭제와 동시에 실시간 연결도 끊는다.
    const user = c.get('user');
    const share = await c.env.DB.prepare('SELECT * FROM shares WHERE id = ?1 AND (owner_id = ?2 OR viewer_id = ?2)')
      .bind(c.req.param('id'), user.id)
      .first<ShareRow>();
    if (!share) fail(404, '공유 정보를 찾을 수 없습니다.');
    await c.env.DB.prepare('DELETE FROM shares WHERE id = ?').bind(share.id).run();
    await hub(c.env, share.owner_id).disconnectViewer(share.viewer_id);
    c.executionCtx.waitUntil(Promise.all([notify(c.env, share.owner_id, ['shares']), notify(c.env, share.viewer_id, ['shares'])]));
    return c.json({ ok: true });
  })
  // 동반자 화면 데이터
  .get('/shared/:ownerId', async (c) => {
    const user = c.get('user');
    const share = await findShare(c.env.DB, c.req.param('ownerId'), user.id);
    if (!share) fail(403, '공유 권한이 없습니다.');
    return c.json({ view: await buildSharedView(c.env.DB, share) });
  })
  // 소유자용: 동반자에게 실제로 보이는 화면 미리보기
  .get('/shares/:id/preview', async (c) => {
    const user = c.get('user');
    const share = await c.env.DB.prepare('SELECT * FROM shares WHERE id = ? AND owner_id = ?').bind(c.req.param('id'), user.id).first<ShareRow>();
    if (!share) fail(404, '공유 정보를 찾을 수 없습니다.');
    return c.json({ view: await buildSharedView(c.env.DB, share) });
  })
  .post('/shares/preview', async (c) => {
    // 초대 전 미리보기: 선택한 권한으로 동반자에게 보일 화면
    const body = await parseBody(c, z.object({ permissions: permissionsSchema }));
    const user = c.get('user');
    const p = body.permissions;
    const fake: ShareRow = {
      id: 'preview',
      owner_id: user.id,
      viewer_id: user.id,
      share_condition: +p.shareCondition,
      share_med_progress: +p.shareMedProgress,
      share_med_schedule: +p.shareMedSchedule,
      share_reactions: +p.shareReactions,
    };
    return c.json({ view: await buildSharedView(c.env.DB, fake) });
  });
