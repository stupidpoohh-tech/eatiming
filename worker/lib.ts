import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { User } from '../shared/types';

export type AppEnv = { Bindings: Env; Variables: { user: User } };
export type AppContext = Context<AppEnv>;

export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

export function fail(status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 429, message: string): never {
  throw new HTTPException(status, { message });
}

export async function parseBody<T extends z.ZodType>(c: AppContext, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    fail(400, '요청 형식이 올바르지 않습니다.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) fail(400, '입력값을 확인해 주세요.');
  return parsed.data;
}

export const toBool = (v: unknown) => v === 1 || v === true;

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(byteLength = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return b64url(new Uint8Array(digest));
}
