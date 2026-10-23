import { expect, test } from '@playwright/test';
import { apiCall, kstNoonDaysAgo, signupViaUi } from './helpers';

test.describe('E. 실시간 공유', () => {
  test('초대 → 수락 → 투여·컨디션 변경이 새로고침 없이 반영 → 무단 수정 차단 → 공유 해제 후 차단', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();

    await signupViaUi(a, '하나');
    await signupViaUi(b, '두리');

    // A: 마운자로 등록 + 2일 전 투여
    const med = await apiCall(a.request, 'POST', '/medications', { name: '마운자로', scheduleType: 'interval', intervalDays: 7 });
    const log = await apiCall(a.request, 'POST', `/medications/${med.json.id}/logs`, { takenAt: kstNoonDaysAgo(2) });

    // A: 초대 (컨디션 + 투여 경과 공유)
    await a.goto('/together');
    await a.getByText('약물 투여 경과').last().click();
    await expect(a.getByRole('checkbox', { name: /약물 투여 경과/ }).last()).toBeChecked();
    await a.getByRole('checkbox', { name: /공유하는 데 동의합니다/ }).check();
    await a.getByRole('button', { name: '초대 링크 만들기' }).click();
    const url = await a.getByTestId('invite-link').inputValue();
    expect(url).toMatch(/\/invite\/[A-Za-z0-9_-]{40,}$/);

    // B: 수락
    await b.goto(new URL(url).pathname);
    await expect(b.getByText('하나님이 잇타이밍에서 다음 정보를 함께 보자고 초대했어요.')).toBeVisible();
    await b.getByRole('button', { name: '초대 수락' }).click();
    await expect(b).toHaveURL(/\/together/);
    const panel = b.getByTestId('shared-view');
    await expect(b.getByText('실시간 연결됨')).toBeVisible();
    await expect(b.getByTestId('shared-condition')).toHaveText('보통');
    await expect(b.getByTestId('shared-meds')).toContainText('투여 후 2일차');
    // 공유하지 않은 항목은 표시되지 않음
    await expect(panel).not.toContainText('음식 반응 요약');

    // A: 컨디션 변경 → B 자동 갱신
    await a.goto('/');
    await a.getByRole('radio', { name: /담백하게/ }).click();
    await expect(b.getByTestId('shared-condition')).toHaveText('담백하게 먹고 싶음');

    // A: 투여 기록 수정 → B 자동 갱신
    await apiCall(a.request, 'PATCH', `/logs/${log.json.id}`, { takenAt: kstNoonDaysAgo(5) });
    await expect(b.getByTestId('shared-meds')).toContainText('투여 후 5일차');

    // A: 공유 설정 변경(경과 끄기) → B 화면에서 사라짐
    await a.goto('/together');
    await a.getByText('약물 투여 경과').first().click();
    await expect(a.getByRole('checkbox', { name: /약물 투여 경과/ }).first()).not.toBeChecked();
    await expect(b.getByTestId('shared-meds')).toHaveCount(0);

    // B: A 기준으로 메뉴 탐색 (동일한 음식 목록)
    await b.getByRole('button', { name: '하나님 기준으로 메뉴 보기' }).click();
    await expect(b.getByText('하나님의 지금 식사 컨디션')).toBeVisible();
    await expect(b.getByRole('radio', { name: /담백하게/ })).toHaveAttribute('aria-checked', 'true');
    await expect(b.getByRole('radio', { name: /담백하게/ })).toBeDisabled();
    await expect(b.locator('[data-food]')).toHaveCount(198);

    // B의 무단 수정 차단 (서버)
    expect((await apiCall(b.request, 'PATCH', `/logs/${log.json.id}`, { note: 'x' })).status).toBe(404);
    expect((await apiCall(b.request, 'DELETE', `/medications/${med.json.id}`)).status).toBe(404);
    // 공유되지 않은 개인 기록 접근 차단: B가 자기 API로 A의 기록을 볼 방법이 없음
    const bMeds = await apiCall(b.request, 'GET', '/medications');
    expect(bMeds.json.medications).toHaveLength(0);

    // A: 공유 해제 → B 접근 즉시 차단, B 화면 기준도 본인으로 복귀
    a.once('dialog', (d) => d.accept());
    await a.getByRole('button', { name: '공유 해제' }).click();
    await expect(b.getByText('하나님의 지금 식사 컨디션')).toHaveCount(0);
    expect((await apiCall(b.request, 'GET', `/shared/${(await apiCall(a.request, 'GET', '/me')).json.user.id}`)).status).toBe(403);

    await ctxA.close();
    await ctxB.close();
  });
});
