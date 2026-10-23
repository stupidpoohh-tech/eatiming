import { SELF } from 'cloudflare:test';

const BASE = 'https://eatiming.test';

export class Client {
  cookie = '';
  user: { id: string; email: string; displayName: string; timezone: string } | null = null;

  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await SELF.fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        Origin: BASE,
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('Set-Cookie');
    if (setCookie) {
      const pair = setCookie.split(';')[0];
      this.cookie = pair.endsWith('=') ? '' : pair;
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, json };
  }

  get = (p: string) => this.req('GET', p);
  post = (p: string, b?: unknown) => this.req('POST', p, b ?? {});
  put = (p: string, b: unknown) => this.req('PUT', p, b);
  patch = (p: string, b: unknown) => this.req('PATCH', p, b);
  del = (p: string, b?: unknown) => this.req('DELETE', p, b);

  async connect(owner?: string) {
    const res = await SELF.fetch(`${BASE}/api/realtime${owner ? `?owner=${owner}` : ''}`, {
      headers: { Upgrade: 'websocket', Cookie: this.cookie },
    });
    if (res.status !== 101) return { status: res.status, ws: null, messages: [] as any[], closed: null as null | { code: number } };
    const ws = res.webSocket!;
    const state = { status: 101, ws, messages: [] as any[], closed: null as null | { code: number } };
    ws.addEventListener('message', (e) => {
      state.messages.push(JSON.parse(e.data as string));
    });
    ws.addEventListener('close', (e) => {
      state.closed = { code: e.code };
    });
    ws.accept();
    return state;
  }
}

let seq = 0;
export async function signup(name = 'user'): Promise<Client> {
  const c = new Client();
  seq++;
  const email = `u${seq}-${crypto.randomUUID().slice(0, 6)}@example.com`;
  const res = await c.post('/auth/signup', {
    email,
    password: 'password-1234',
    displayName: name,
    timezone: 'Asia/Seoul',
    agreePrivacy: true,
  });
  if (res.status !== 201) throw new Error(`signup failed ${res.status} ${JSON.stringify(res.json)}`);
  c.user = res.json.user;
  return c;
}

export async function waitFor<T>(fn: () => T | undefined | null | false, timeout = 3000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('waitFor timeout');
}

export const allOff = { shareCondition: false, shareMedProgress: false, shareMedSchedule: false, shareReactions: false };
