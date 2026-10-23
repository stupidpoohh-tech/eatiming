import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { allOff, Client, signup, waitFor } from './helpers';

async function pair(permissions = { ...allOff, shareCondition: true }) {
  const a = await signup('owner');
  const b = await signup('viewer');
  const inv = await a.post('/invites', { permissions });
  expect(inv.status).toBe(201);
  const acc = await b.post(`/invites/${inv.json.token}/accept`);
  expect(acc.status).toBe(200);
  return { a, b, token: inv.json.token as string, shareId: acc.json.shareId as string };
}

describe('초대', () => {
  it('토큰은 해시로만 저장되고, 1회만 사용 가능하다', async () => {
    const a = await signup('inv');
    const inv = (await a.post('/invites', { permissions: { ...allOff, shareCondition: true } })).json;
    const row = await env.DB.prepare('SELECT token_hash FROM companion_invites WHERE id = ?').bind(inv.id).first<{ token_hash: string }>();
    expect(row!.token_hash).not.toBe(inv.token);
    expect(inv.token.length).toBeGreaterThanOrEqual(40);

    expect((await a.post(`/invites/${inv.token}/accept`)).status).toBe(400); // 본인 초대
    const b = await signup('b');
    const c = await signup('c');
    expect((await b.post(`/invites/${inv.token}/accept`)).status).toBe(200);
    expect((await c.post(`/invites/${inv.token}/accept`)).status).toBe(410);
    expect((await new Client().get(`/invites/${inv.token}`)).json.state).toBe('used');
    expect((await new Client().get('/invites/not-a-token')).json.state).toBe('invalid');
  });

  it('만료되거나 취소된 초대는 수락할 수 없다', async () => {
    const a = await signup('exp');
    const b = await signup('b');
    const inv = (await a.post('/invites', { permissions: allOff })).json;
    await env.DB.prepare('UPDATE companion_invites SET expires_at = ? WHERE id = ?').bind(new Date(Date.now() - 1000).toISOString(), inv.id).run();
    expect((await b.post(`/invites/${inv.token}/accept`)).status).toBe(410);

    const inv2 = (await a.post('/invites', { permissions: allOff })).json;
    expect((await a.del(`/invites/${inv2.id}`)).status).toBe(200);
    expect((await b.post(`/invites/${inv2.token}/accept`)).status).toBe(410);
  });

  it('비로그인 미리보기는 초대자 정보를 노출하지 않는다', async () => {
    const a = await signup('pv');
    const inv = (await a.post('/invites', { permissions: allOff })).json;
    const anon = await new Client().get(`/invites/${inv.token}`);
    expect(anon.json).toEqual({ state: 'valid', requiresLogin: true });
  });
});

describe('공유 권한', () => {
  it('허용된 항목만 동반자에게 제공된다(기본: 약물 비공개)', async () => {
    const { a, b } = await pair();
    const medId = (await a.post('/medications', { name: '마운자로', scheduleType: 'interval', intervalDays: 7, doseLabel: '5mg' })).json.id;
    await a.post(`/medications/${medId}/logs`, { takenAt: new Date().toISOString() });
    await a.put('/condition', { state: 'light' });

    const view = (await b.get(`/shared/${a.user!.id}`)).json.view;
    expect(view.condition.state).toBe('light');
    expect(view.medications).toBeNull();
    expect(view.reactionSummaries).toBeNull();
    expect(JSON.stringify(view)).not.toContain('5mg');
    expect(JSON.stringify(view)).not.toContain(a.user!.email);
  });

  it('경과만 공유하면 복용 일정(용량·기본 시간)은 숨겨진다', async () => {
    const { a, b, shareId } = await pair();
    const medId = (await a.post('/medications', { name: '마운자로', scheduleType: 'interval', intervalDays: 7, doseLabel: '5mg' })).json.id;
    await a.post(`/medications/${medId}/logs`, { takenAt: new Date().toISOString() });
    await a.patch(`/shares/${shareId}`, { permissions: { ...allOff, shareMedProgress: true } });
    const view = (await b.get(`/shared/${a.user!.id}`)).json.view;
    expect(view.condition).toBeNull();
    expect(view.medications[0].progress.recentTakenAt).toHaveLength(1);
    expect(view.medications[0].schedule).toBeNull();
    expect(JSON.stringify(view)).not.toContain('5mg');
  });

  it('동반자는 공유받은 데이터를 수정할 수 없고, 본인 데이터만 바뀐다', async () => {
    const { a, b, shareId } = await pair({ shareCondition: true, shareMedProgress: true, shareMedSchedule: true, shareReactions: true });
    const medId = (await a.post('/medications', { name: '마운자로', scheduleType: 'interval' })).json.id;
    const logId = (await a.post(`/medications/${medId}/logs`, { takenAt: new Date().toISOString() })).json.id;
    await a.put('/condition', { state: 'light' });

    expect((await b.patch(`/logs/${logId}`, { takenAt: new Date(Date.now() - 86_400_000).toISOString() })).status).toBe(404);
    expect((await b.del(`/medications/${medId}`)).status).toBe(404);
    expect((await b.patch(`/shares/${shareId}`, { permissions: allOff })).status).toBe(404);
    // 동반자가 컨디션을 바꾸면 동반자 자신의 값만 바뀐다
    await b.put('/condition', { state: 'hearty' });
    expect((await a.get('/condition')).json.condition.state).toBe('light');
    expect((await b.get(`/shared/${a.user!.id}`)).json.view.condition.state).toBe('light');
  });

  it('공유 해제 후 즉시 접근이 차단된다', async () => {
    const { a, b, shareId } = await pair();
    expect((await b.get(`/shared/${a.user!.id}`)).status).toBe(200);
    expect((await a.del(`/shares/${shareId}`)).status).toBe(200);
    expect((await b.get(`/shared/${a.user!.id}`)).status).toBe(403);
    expect((await b.connect(a.user!.id)).status).toBe(403);
  });

  it('동반자도 스스로 연결을 끊을 수 있다', async () => {
    const { a, b, shareId } = await pair();
    expect((await b.del(`/shares/${shareId}`)).status).toBe(200);
    expect((await a.get('/shares')).json.outgoing).toHaveLength(0);
  });

  it('공유 관계가 없는 사용자는 접근할 수 없다', async () => {
    const { a } = await pair();
    const stranger = await signup('stranger');
    expect((await stranger.get(`/shared/${a.user!.id}`)).status).toBe(403);
    expect((await stranger.connect(a.user!.id)).status).toBe(403);
    expect((await new Client().get(`/shared/${a.user!.id}`)).status).toBe(401);
  });
});

describe('실시간 동기화', () => {
  it('소유자가 컨디션·투여 기록을 바꾸면 동반자 소켓에 알림이 온다', async () => {
    const { a, b, shareId } = await pair({ ...allOff, shareCondition: true, shareMedProgress: true });
    const sock = await b.connect(a.user!.id);
    expect(sock.status).toBe(101);
    await waitFor(() => sock.messages.find((m) => m.type === 'ready'));

    await a.put('/condition', { state: 'hearty' });
    await waitFor(() => sock.messages.find((m) => m.type === 'changed' && m.topics.includes('condition')));

    const medId = (await a.post('/medications', { name: '마운자로', scheduleType: 'interval' })).json.id;
    await a.post(`/medications/${medId}/logs`, { takenAt: new Date().toISOString() });
    await waitFor(() => sock.messages.find((m) => m.type === 'changed' && m.topics.includes('medications')));

    // 공유되지 않은 주제(음식 반응)는 동반자에게 전달되지 않는다
    const food = (await a.get('/foods')).json.foods[0];
    await a.post('/reactions', { foodId: food.id, reaction: 'good' });
    await a.put('/condition', { state: 'light' });
    await waitFor(() => sock.messages.filter((m) => m.topics?.includes('condition')).length >= 2);
    expect(sock.messages.some((m) => m.topics?.includes('reactions'))).toBe(false);

    // 공유 설정 변경 → 반응 주제 허용
    await a.patch(`/shares/${shareId}`, { permissions: { ...allOff, shareCondition: true, shareReactions: true } });
    await waitFor(() => sock.messages.find((m) => m.topics?.includes('shares')));
    await a.post('/reactions', { foodId: food.id, reaction: 'ok' });
    await waitFor(() => sock.messages.find((m) => m.topics?.includes('reactions')));
  });

  it('공유 해제 시 동반자 소켓이 즉시 닫힌다', async () => {
    const { a, b, shareId } = await pair();
    const sock = await b.connect(a.user!.id);
    await waitFor(() => sock.messages.find((m) => m.type === 'ready'));
    await a.del(`/shares/${shareId}`);
    await waitFor(() => sock.messages.find((m) => m.type === 'revoked'));
    await waitFor(() => sock.closed);
    expect(sock.closed!.code).toBe(4403);
  });

  it('본인 채널은 다른 기기·탭 동기화에 사용된다', async () => {
    const a = await signup('self');
    const sock = await a.connect();
    expect(sock.status).toBe(101);
    await a.put('/condition', { state: 'hearty' });
    await waitFor(() => sock.messages.find((m) => m.topics?.includes('condition')));
  });
});
