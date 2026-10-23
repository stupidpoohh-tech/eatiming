import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import { isValidTimeZone, DEFAULT_TIMEZONE } from '../shared/time';
import type { User } from '../shared/types';
import { b64url, fail, newId, nowIso, parseBody, randomToken, sha256, type AppContext, type AppEnv } from './lib';
import { notifyAccountDeleted } from './realtime';

export const SESSION_COOKIE = 'et_session';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100_000; // Workers 런타임 상한
const LOGIN_WINDOW_MIN = 15;
const LOGIN_MAX_FAILS = 10;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const actual = await pbkdf2(password, fromB64url(salt), Number(iter));
  const expected = fromB64url(hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  timezone: string;
  password_hash: string;
}

export const toUser = (r: UserRow): User => ({ id: r.id, email: r.email, displayName: r.display_name, timezone: r.timezone });

async function createSession(c: AppContext, userId: string) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, nowIso(), expires.toISOString())
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    expires,
  });
}

export async function userFromRequest(c: AppContext): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.timezone, u.password_hash FROM sessions s
     JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), nowIso())
    .first<UserRow>();
  return row ? toUser(row) : null;
}

/** 인증 필수 구간. 세션이 없으면 401 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const user = await userFromRequest(c);
  if (!user) fail(401, '로그인이 필요합니다.');
  c.set('user', user);
  await next();
});

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(8).max(200);

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(30),
  timezone: z.string().max(64).optional(),
  agreePrivacy: z.literal(true),
});

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

export const authRoutes = new Hono<AppEnv>()
  .post('/signup', async (c) => {
    const body = await parseBody(c, signupSchema);
    const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(body.email).first();
    if (exists) fail(409, '이미 가입된 이메일입니다.');
    const tz = body.timezone && isValidTimeZone(body.timezone) ? body.timezone : DEFAULT_TIMEZONE;
    const id = newId();
    const now = nowIso();
    await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO users (id, email, password_hash, display_name, timezone, privacy_agreed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(id, body.email, await hashPassword(body.password), body.displayName, tz, now, now, now),
      c.env.DB.prepare("INSERT INTO meal_conditions (user_id, state, symptoms, updated_at) VALUES (?, 'normal', '[]', ?)").bind(id, now),
    ]);
    await createSession(c, id);
    return c.json({ user: { id, email: body.email, displayName: body.displayName, timezone: tz } satisfies User }, 201);
  })
  .post('/login', async (c) => {
    const body = await parseBody(c, loginSchema);
    const since = new Date(Date.now() - LOGIN_WINDOW_MIN * 60_000).toISOString();
    const attempts = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND attempted_at > ?')
      .bind(body.email, since)
      .first<{ n: number }>();
    if ((attempts?.n ?? 0) >= LOGIN_MAX_FAILS) fail(429, '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');

    const row = await c.env.DB.prepare('SELECT id, email, display_name, timezone, password_hash FROM users WHERE email = ?').bind(body.email).first<UserRow>();
    const ok = row ? await verifyPassword(body.password, row.password_hash) : false;
    if (!row || !ok) {
      await c.env.DB.prepare('INSERT INTO login_attempts (email, attempted_at) VALUES (?, ?)').bind(body.email, nowIso()).run();
      fail(401, '이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM login_attempts WHERE email = ?').bind(body.email),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?').bind(row.id, nowIso()),
    ]);
    await createSession(c, row.id);
    return c.json({ user: toUser(row) });
  })
  .post('/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token)
      await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
        .bind(await sha256(token))
        .run();
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(30).optional(),
  timezone: z.string().max(64).optional(),
});

export const meRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', (c) => c.json({ user: c.get('user') }))
  .patch('/', async (c) => {
    const body = await parseBody(c, profileSchema);
    const user = c.get('user');
    if (body.timezone && !isValidTimeZone(body.timezone)) fail(400, '알 수 없는 시간대입니다.');
    const next = { ...user, displayName: body.displayName ?? user.displayName, timezone: body.timezone ?? user.timezone };
    await c.env.DB.prepare('UPDATE users SET display_name = ?, timezone = ?, updated_at = ? WHERE id = ?')
      .bind(next.displayName, next.timezone, nowIso(), user.id)
      .run();
    return c.json({ user: next });
  })
  .delete('/', async (c) => {
    // 회원 탈퇴: 비밀번호 재확인 후 계정과 모든 개인 데이터를 삭제한다(ON DELETE CASCADE).
    const body = await parseBody(c, z.object({ password: z.string().min(1).max(200) }));
    const user = c.get('user');
    const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>();
    if (!row || !(await verifyPassword(body.password, row.password_hash))) fail(403, '비밀번호가 올바르지 않습니다.');
    const related = await c.env.DB.prepare('SELECT owner_id, viewer_id FROM shares WHERE owner_id = ? OR viewer_id = ?')
      .bind(user.id, user.id)
      .all<{ owner_id: string; viewer_id: string }>();
    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
    c.executionCtx.waitUntil(notifyAccountDeleted(c.env, user.id, related.results));
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });
