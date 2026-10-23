import { expect, test } from '@playwright/test';
import { apiCall, kstNoonDaysAgo, PASSWORD, signupViaUi } from './helpers';

test.describe('A. 가입과 초기 설정', () => {
  test('가입 → 약물 등록 → 마지막 투여일 입력 → 수정 → 재로그인 후 유지', async ({ page }) => {
    const email = await signupViaUi(page, '지수');
    await expect(page.getByText('가입을 환영해요, 지수님.')).toBeVisible();

    // 마운자로 프리셋 등록 → 바로 투여 기록 시트가 열린다
    await page.getByRole('button', { name: /마운자로/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('마운자로 투여 기록');
    const twoDaysAgo = await page.evaluate(() => {
      const d = new Date(Date.now() - 2 * 86_400_000);
      const p = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(d);
      return p.replace(' ', 'T');
    });
    await dialog.getByLabel('투여 날짜와 시간').fill(twoDaysAgo);
    await dialog.getByRole('button', { name: '저장' }).click();
    await expect(page.getByTestId('timeline-마운자로')).toContainText('투여 후 2일차');

    // 메뉴 탐색 화면 요약에도 표시
    await page.getByRole('link', { name: '메뉴 탐색' }).click();
    await expect(page.getByLabel('투여 경과 요약')).toContainText('투여 후 2일차');

    // 초기 설정 수정: 투여 주기 변경
    await page.getByRole('link', { name: '약물 기록' }).click();
    await page.getByRole('button', { name: '마운자로 설정' }).click();
    await page.getByLabel('투여 주기 (일)').fill('10');
    await page.getByRole('button', { name: '저장' }).click();
    await expect(page.getByText('10일 주기 투여')).toBeVisible();

    // 컨디션 변경
    await page.getByRole('link', { name: '메뉴 탐색' }).click();
    await page.getByRole('radio', { name: /담백하게/ }).click();
    await expect(page.getByRole('radio', { name: /담백하게/ })).toHaveAttribute('aria-checked', 'true');

    // 로그아웃 → 재로그인
    await page.getByRole('link', { name: '지수' }).click();
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page.getByRole('link', { name: '로그인' }).first()).toBeVisible();
    await page.goto('/login');
    await page.getByRole('textbox', { name: '이메일' }).fill(email);
    await page.getByLabel('비밀번호', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.getByLabel('투여 경과 요약')).toContainText('투여 후 2일차');
    await expect(page.getByRole('radio', { name: /담백하게/ })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('link', { name: '약물 기록' }).click();
    await expect(page.getByText('10일 주기 투여')).toBeVisible();
  });
});

test.describe('B. 콘서타', () => {
  test('05:00 기본값, 실제 복용 확인과 기본값 구분, 시간 변경, 자동 기록 없음', async ({ page }) => {
    await signupViaUi(page, '콘서타');
    await page.getByRole('button', { name: /콘서타/ }).click();
    const timeline = page.getByTestId('timeline-콘서타');
    await expect(page.getByText('매일 · 기본 05:00 · 예상 작용 12시간')).toBeVisible();
    await expect(timeline).toContainText('오늘 복용 확인 전');
    await expect(timeline).toContainText('기본값 05:00 복용 시 예상 작용 구간 05:00–17:00');
    // 기록 목록은 비어 있음(자동 생성 없음)
    await expect(page.getByText('아직 기록이 없어요.')).toBeVisible();

    // 기본 시간 변경
    await page.getByRole('button', { name: '콘서타 설정' }).click();
    await page.getByLabel('기본 복용 시간').fill('06:30');
    await page.getByRole('button', { name: '저장' }).click();
    await expect(page.getByText('매일 · 기본 06:30 · 예상 작용 12시간')).toBeVisible();
    await page.getByRole('button', { name: '콘서타 설정' }).click();
    await page.getByLabel('기본 복용 시간').fill('05:00');
    await page.getByRole('button', { name: '저장' }).click();

    // 특정 날짜만 다른 시간으로 기록: 오늘 07:30 대신 '지금 복용' 확인
    await page.getByRole('button', { name: '지금 복용' }).click();
    await expect(timeline).toContainText('복용 확인');
    await expect(timeline).toContainText('예상 작용 구간');
    await expect(page.getByRole('button', { name: '지금 복용' })).toHaveCount(0);

    // 서버에도 실제로 한 건만 기록
    const meds = await apiCall(page.request, 'GET', '/medications');
    expect(meds.json.logs).toHaveLength(1);
  });

  test('어제만 복용한 경우 오늘은 미확인 상태(미복용일 자동 기록 방지)', async ({ page }) => {
    await signupViaUi(page, '경계');
    const { json } = await apiCall(page.request, 'POST', '/medications', { name: '콘서타', scheduleType: 'daily', defaultTime: '05:00', effectHours: 12 });
    await apiCall(page.request, 'POST', `/medications/${json.id}/logs`, { takenAt: kstNoonDaysAgo(1) });
    await page.goto('/meds');
    const timeline = page.getByTestId('timeline-콘서타');
    await expect(timeline).toContainText('오늘 복용 확인 전');
    const meds = await apiCall(page.request, 'GET', '/medications');
    expect(meds.json.logs).toHaveLength(1);
  });
});

test.describe('C. 마운자로', () => {
  test('D0~D6 표시, D7 이후 처리, 투여일 수정 즉시 반영, 체감 패턴', async ({ page }) => {
    await signupViaUi(page, '마운자로');
    // 약물 미등록 상태 안내
    await page.goto('/');
    await expect(page.getByText('복용 중인 약물을 등록해 보세요')).toBeVisible();

    const { json } = await apiCall(page.request, 'POST', '/medications', { name: '마운자로', scheduleType: 'interval', intervalDays: 7 });
    const log = await apiCall(page.request, 'POST', `/medications/${json.id}/logs`, { takenAt: kstNoonDaysAgo(0) });
    await page.goto('/meds');
    const timeline = page.getByTestId('timeline-마운자로');
    await expect(timeline).toContainText('투여 후 당일');

    // 투여일 수정 → D9 (예정일 경과)
    await apiCall(page.request, 'PATCH', `/logs/${log.json.id}`, { takenAt: kstNoonDaysAgo(9) });
    await page.reload();
    await expect(timeline).toContainText('예정일 경과 · 마지막 투여 후 9일');

    // UI에서 투여일 수정
    await page.getByRole('button', { name: '기록 수정' }).first().click();
    const fourDaysAgo = await page.evaluate(() => {
      const d = new Date(Date.now() - 4 * 86_400_000);
      return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .format(d)
        .replace(' ', 'T');
    });
    await page.getByRole('dialog').getByLabel('투여 날짜와 시간').fill(fourDaysAgo);
    await page.getByRole('dialog').getByRole('button', { name: '저장' }).click();
    await expect(timeline).toContainText('투여 후 4일차');

    // 개인 체감 패턴: D4 가장 강함
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByLabel('D4 체감').selectOption('strongest');
    await page.getByRole('dialog').getByRole('button', { name: '저장' }).click();
    await expect(timeline).toContainText('내 체감: 식욕 억제 가장 강함');
  });
});
