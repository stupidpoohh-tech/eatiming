import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { authRoutes, meRoutes, requireUser } from './auth';
import { fail, type AppEnv } from './lib';
import { hub } from './realtime';
import { foodRoutes } from './routes/foods';
import { conditionRoutes, logRoutes, medicationRoutes, reactionRoutes } from './routes/personal';
import { findShare, shareRoutes, toPermissions } from './routes/sharing';

export { ShareHub } from './realtime';

const app = new Hono<AppEnv>().basePath('/api');

const security = secureHeaders();
// WebSocket 업그레이드 응답(101)의 헤더는 변경할 수 없으므로 제외한다.
app.use((c, next) => (c.req.header('Upgrade') === 'websocket' ? next() : security(c, next)));

// CSRF 방어: 상태 변경 요청은 같은 출처에서 온 JSON 요청만 허용한다(쿠키는 SameSite=Lax).
app.use(async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    if (origin && origin !== new URL(c.req.url).origin) fail(403, '허용되지 않은 출처입니다.');
    const type = c.req.header('Content-Type') ?? '';
    const hasBody = c.req.header('Content-Length') !== '0' && c.req.header('Content-Length') !== undefined;
    if (hasBody && !type.includes('application/json')) fail(400, 'JSON 요청만 허용됩니다.');
  }
  await next();
});

app.use(async (c, next) => {
  await next();
  if (c.res.status !== 101 && !c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
});

app.get('/health', (c) => c.json({ ok: true }));
app.route('/auth', authRoutes);
app.route('/me', meRoutes);
app.route('/foods', foodRoutes);
app.route('/condition', conditionRoutes);
app.route('/medications', medicationRoutes);
app.route('/logs', logRoutes);
app.route('/reactions', reactionRoutes);

/**
 * 실시간 연결: /api/realtime?owner=<userId>
 * - owner가 본인이면 본인 채널(다른 기기·탭 동기화)
 * - 아니면 해당 사용자가 공유를 허용한 동반자만 연결 가능
 */
app.get('/realtime', requireUser, async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') fail(400, 'WebSocket 연결이 필요합니다.');
  const user = c.get('user');
  const ownerId = c.req.query('owner') ?? user.id;
  let permissions: string | null = null;
  if (ownerId !== user.id) {
    const share = await findShare(c.env.DB, ownerId, user.id);
    if (!share) fail(403, '공유 권한이 없습니다.');
    permissions = JSON.stringify(toPermissions(share));
  }
  const headers = new Headers(c.req.raw.headers);
  headers.set('X-Viewer-Id', user.id);
  if (permissions) headers.set('X-Permissions', permissions);
  else headers.delete('X-Permissions');
  return hub(c.env, ownerId).fetch(new Request(c.req.url, { headers }));
});

app.route('/', shareRoutes);

app.notFound((c) => c.json({ error: '요청한 API를 찾을 수 없습니다.' }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  // 민감정보 노출 최소화: 요청 본문이나 사용자 데이터는 로그에 남기지 않는다.
  console.error('unhandled error', err.name, err.message);
  return c.json({ error: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }, 500);
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;

export type App = typeof app;
