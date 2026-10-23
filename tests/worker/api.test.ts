import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { Client, signup } from './helpers';

describe('공통 음식 DB', () => {
  it('비로그인 상태에서도 전체 음식 목록을 조회할 수 있다', async () => {
    const res = await new Client().get('/foods');
    expect(res.status).toBe(200);
    expect(res.json.foods.length).toBe(198);
    const mandu = res.json.foods.find((f: any) => f.name === '만두');
    expect(mandu.status).toBe('depends');
    expect(mandu.variants.map((v: any) => v.name)).toEqual(['찐만두', '물만두', '군만두', '튀김만두']);
    const soba = res.json.foods.find((f: any) => f.name === '메밀소바');
    expect(soba.aliases).toEqual(expect.arrayContaining(['모밀', '소바']));
  });
});

describe('가입·로그인', () => {
  it('가입 → 로그아웃 → 재로그인 후에도 설정이 유지된다', async () => {
    const c = await signup('지민');
    expect((await c.get('/me')).json.user.displayName).toBe('지민');
    await c.patch('/me', { timezone: 'America/New_York' });
    await c.put('/condition', { state: 'light' });
    const med = await c.post('/medications', { name: '마운자로', scheduleType: 'interval', intervalDays: 7 });
    expect(med.status).toBe(201);

    const email = c.user!.email;
    expect((await c.post('/auth/logout')).status).toBe(200);
    expect((await c.get('/me')).status).toBe(401);

    const again = new Client();
    expect((await again.post('/auth/login', { email, password: 'wrong-password' })).status).toBe(401);
    const login = await again.post('/auth/login', { email, password: 'password-1234' });
    expect(login.status).toBe(200);
    expect(login.json.user.timezone).toBe('America/New_York');
    expect((await again.get('/condition')).json.condition.state).toBe('light');
    expect((await again.get('/medications')).json.medications[0].name).toBe('마운자로');
  });

  it('중복 이메일·동의 누락·짧은 비밀번호를 거부한다', async () => {
    const c = await signup('dup');
    const x = new Client();
    expect((await x.post('/auth/signup', { email: c.user!.email, password: 'password-1234', displayName: 'x', agreePrivacy: true })).status).toBe(409);
    expect((await x.post('/auth/signup', { email: 'a@b.com', password: 'password-1234', displayName: 'x', agreePrivacy: false })).status).toBe(400);
    expect((await x.post('/auth/signup', { email: 'b@b.com', password: 'short', displayName: 'x', agreePrivacy: true })).status).toBe(400);
  });

  it('비밀번호는 평문으로 저장되지 않는다', async () => {
    const c = await signup('hash');
    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(c.user!.id).first<{ password_hash: string }>();
    expect(row!.password_hash.startsWith('pbkdf2$')).toBe(true);
    expect(row!.password_hash).not.toContain('password-1234');
  });

  it('반복된 로그인 실패를 제한한다', async () => {
    const c = await signup('rate');
    const x = new Client();
    for (let i = 0; i < 10; i++) await x.post('/auth/login', { email: c.user!.email, password: 'nope-nope' });
    expect((await x.post('/auth/login', { email: c.user!.email, password: 'password-1234' })).status).toBe(429);
  });

  it('인증 없이 개인 데이터에 접근할 수 없다', async () => {
    const anon = new Client();
    for (const p of ['/me', '/condition', '/medications', '/reactions', '/reactions/summary', '/shares']) {
      expect((await anon.get(p)).status, p).toBe(401);
    }
    expect((await anon.post('/medications', { name: 'x', scheduleType: 'daily' })).status).toBe(401);
  });

  it('다른 출처의 상태 변경 요청을 차단한다(CSRF)', async () => {
    const c = await signup('csrf');
    const res = await c.req('PUT', '/condition', { state: 'hearty' }, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });
});

describe('약물 기록', () => {
  it('콘서타: 기본값 05:00, 복용 기록은 명시적으로 입력할 때만 생긴다', async () => {
    const c = await signup('con');
    const created = await c.post('/medications', { name: '콘서타', scheduleType: 'daily', defaultTime: '05:00', effectHours: 12 });
    const id = created.json.id;
    let data = (await c.get('/medications')).json;
    expect(data.medications[0]).toMatchObject({ defaultTime: '05:00', effectHours: 12, scheduleType: 'daily' });
    expect(data.logs).toHaveLength(0);

    const takenAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
    expect((await c.post(`/medications/${id}/logs`, { takenAt })).status).toBe(201);
    // 미래 시각은 거부
    expect((await c.post(`/medications/${id}/logs`, { takenAt: new Date(Date.now() + 3_600_000).toISOString() })).status).toBe(400);
    await c.patch(`/medications/${id}`, { defaultTime: '06:30' });
    data = (await c.get('/medications')).json;
    expect(data.medications[0].defaultTime).toBe('06:30');
    expect(data.logs).toHaveLength(1);
  });

  it('투여 기록 수정·삭제, 체감 패턴 저장', async () => {
    const c = await signup('mj');
    const id = (await c.post('/medications', { name: '마운자로', scheduleType: 'interval', intervalDays: 7, doseLabel: '2.5mg' })).json.id;
    const logId = (await c.post(`/medications/${id}/logs`, { takenAt: new Date(Date.now() - 86_400_000).toISOString() })).json.id;
    const newTime = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect((await c.patch(`/logs/${logId}`, { takenAt: newTime })).status).toBe(200);
    expect((await c.get('/medications')).json.logs[0].takenAt).toBe(newTime);

    await c.put(`/medications/${id}/patterns`, {
      patterns: [
        { dayOffset: 1, level: 'strongest' },
        { dayOffset: 6, level: 'weakest' },
      ],
    });
    const med = (await c.get('/medications')).json.medications[0];
    expect(med.patterns).toEqual([
      { dayOffset: 1, level: 'strongest' },
      { dayOffset: 6, level: 'weakest' },
    ]);

    expect((await c.del(`/logs/${logId}`)).status).toBe(200);
    expect((await c.get('/medications')).json.logs).toHaveLength(0);
  });

  it('다른 사용자의 약물·기록은 수정하거나 삭제할 수 없다', async () => {
    const a = await signup('a');
    const b = await signup('b');
    const medId = (await a.post('/medications', { name: '마운자로', scheduleType: 'interval' })).json.id;
    const logId = (await a.post(`/medications/${medId}/logs`, { takenAt: new Date().toISOString() })).json.id;
    expect((await b.patch(`/medications/${medId}`, { name: 'hack' })).status).toBe(404);
    expect((await b.post(`/medications/${medId}/logs`, { takenAt: new Date().toISOString() })).status).toBe(404);
    expect((await b.patch(`/logs/${logId}`, { note: 'hack' })).status).toBe(404);
    expect((await b.del(`/logs/${logId}`)).status).toBe(404);
    expect((await b.del(`/medications/${medId}`)).status).toBe(404);
    expect((await b.get(`/medications/${medId}/logs`)).status).toBe(404);
    expect((await a.get('/medications')).json.medications[0].name).toBe('마운자로');
  });
});

describe('음식 반응', () => {
  it('반응 기록 시 당시 투여 경과와 컨디션을 함께 저장하고, 수정·삭제할 수 있다', async () => {
    const c = await signup('react');
    const foods = (await c.get('/foods')).json.foods;
    const mandu = foods.find((f: any) => f.name === '만두');
    const medId = (await c.post('/medications', { name: '마운자로', scheduleType: 'interval', intervalDays: 7 })).json.id;
    await c.post(`/medications/${medId}/logs`, { takenAt: new Date(Date.now() - 2 * 86_400_000 - 60_000).toISOString() });
    await c.put('/condition', { state: 'light' });

    const r1 = await c.post('/reactions', { foodId: mandu.id, variantId: mandu.variants[0].id, reaction: 'good', note: '편했음' });
    expect(r1.status).toBe(201);
    await c.post('/reactions', { foodId: mandu.id, reaction: 'good' });
    const list = (await c.get(`/reactions?foodId=${mandu.id}`)).json.reactions;
    expect(list).toHaveLength(2);
    const saved = list.find((r: any) => r.id === r1.json.id);
    expect(saved.conditionState).toBe('light');
    expect(saved.medicationContext[0].label).toMatch(/^D2/);

    expect((await c.patch(`/reactions/${r1.json.id}`, { reaction: 'bad', note: null })).status).toBe(200);
    const summary = (await c.get('/reactions/summary')).json.summaries.find((s: any) => s.foodId === mandu.id);
    expect(summary).toMatchObject({ good: 1, bad: 1, ok: 0 });

    expect((await c.del(`/reactions/${r1.json.id}`)).status).toBe(200);
    expect((await c.get(`/reactions?foodId=${mandu.id}`)).json.reactions).toHaveLength(1);
  });

  it('잘못된 조리 옵션·없는 음식을 거부하고, 다른 사용자의 반응은 수정할 수 없다', async () => {
    const a = await signup('ra');
    const b = await signup('rb');
    const foods = (await a.get('/foods')).json.foods;
    const soba = foods.find((f: any) => f.name === '메밀소바');
    const mandu = foods.find((f: any) => f.name === '만두');
    expect((await a.post('/reactions', { foodId: 'nope', reaction: 'good' })).status).toBe(404);
    expect((await a.post('/reactions', { foodId: soba.id, variantId: mandu.variants[0].id, reaction: 'good' })).status).toBe(400);
    const id = (await a.post('/reactions', { foodId: soba.id, reaction: 'good' })).json.id;
    expect((await b.patch(`/reactions/${id}`, { reaction: 'bad' })).status).toBe(404);
    expect((await b.del(`/reactions/${id}`)).status).toBe(404);
    expect((await b.get('/reactions')).json.reactions).toHaveLength(0);
  });
});

describe('회원 탈퇴', () => {
  it('비밀번호 확인 후 모든 개인 데이터를 삭제한다', async () => {
    const c = await signup('bye');
    const medId = (await c.post('/medications', { name: '마운자로', scheduleType: 'interval' })).json.id;
    await c.post(`/medications/${medId}/logs`, { takenAt: new Date().toISOString() });
    expect((await c.del('/me', { password: 'wrong' })).status).toBe(403);
    expect((await c.del('/me', { password: 'password-1234' })).status).toBe(200);
    for (const table of ['users', 'medications', 'medication_logs', 'meal_conditions', 'sessions']) {
      const col = table === 'users' ? 'id' : 'user_id';
      const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ?`).bind(c.user!.id).first<{ n: number }>();
      expect(n!.n, table).toBe(0);
    }
  });
});
