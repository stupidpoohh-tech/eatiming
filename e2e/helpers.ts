import { expect, type APIRequestContext, type Page } from '@playwright/test';

let n = 0;
export function uniqueEmail(prefix: string) {
  n++;
  return `${prefix}${Date.now().toString(36)}${n}@example.com`;
}

export const PASSWORD = 'eatiming-pass-1';

export async function signupViaUi(page: Page, name: string, email = uniqueEmail('u')) {
  await page.goto('/signup');
  await page.getByLabel('표시 이름').fill(name);
  await page.getByRole('textbox', { name: '이메일' }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();
  await expect(page).toHaveURL(/\/meds\?welcome=1/);
  return email;
}

/** 페이지와 같은 쿠키를 쓰는 API 호출 */
export async function apiCall(request: APIRequestContext, method: string, path: string, body?: unknown) {
  const res = await request.fetch(`/api${path}`, {
    method,
    data: body,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
  });
  return { status: res.status(), json: await res.json().catch(() => null) };
}

export const daysAgo = (d: number, hoursOffset = 0) => new Date(Date.now() - d * 86_400_000 - hoursOffset * 3_600_000).toISOString();

/** KST 기준 n일 전 정오 */
export function kstNoonDaysAgo(d: number) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const day = kst.getUTCDate() - d;
  return new Date(Date.UTC(y, m, day, 3, 0, 0)).toISOString(); // 12:00 KST
}
