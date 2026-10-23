import { expect, test, type Page } from '@playwright/test';
import { signupViaUi } from './helpers';

const grid = (page: Page) => page.getByTestId('food-grid');
const chip = (page: Page, name: string) => page.locator(`[data-food="${name}"]`);

test.describe('D. 음식 탐색 (비로그인 포함)', () => {
  test('검색·별칭·띄어쓰기, 카테고리·국가 복합 필터, 상태 필터 개수', async ({ page }) => {
    await page.goto('/');
    await expect(grid(page).first()).toBeVisible();
    await expect(page.locator('[data-food]')).toHaveCount(262);
    await expect(page.getByTestId('count-all')).toHaveText('262');

    const search = page.getByLabel('음식 검색');
    for (const term of ['모밀', '소바', '메밀 소바']) {
      await search.fill(term);
      await expect(chip(page, '메밀소바')).toBeVisible();
    }
    // 검색 결과에도 상태 표시
    await expect(chip(page, '메밀소바')).toHaveAttribute('aria-label', /편하게 먹기 좋은 후보/);

    // 검색 + 카테고리 동시 적용
    await search.fill('튀김');
    await page.getByRole('radio', { name: '분식·튀김' }).click();
    const names = await page.locator('[data-food]').evaluateAll((els) => els.map((e) => e.getAttribute('data-food')));
    expect(names.length).toBeGreaterThan(3);
    expect(names).toContain('오징어튀김');
    expect(names).not.toContain('삼겹살');

    // 상세 필터 패널에서 국가 분류 지정
    await page.getByText('필터 및 정렬').click();
    await page.getByLabel('국가별 분류').selectOption('japanese');
    await expect(chip(page, '덴푸라')).toBeVisible();
    await expect(chip(page, '오징어튀김')).toHaveCount(0);

    // 검색어 삭제 시 기존 탐색 상태 유지
    await page.getByRole('button', { name: '검색어 지우기' }).click();
    await expect(page.getByRole('radio', { name: '분식·튀김' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByLabel('국가별 분류')).toHaveValue('japanese');
    await expect(chip(page, '돈카츠')).toBeVisible();

    // 상태 필터와 개수
    await page.getByRole('button', { name: '조건 초기화' }).click();
    await page.getByRole('radio', { name: '면', exact: true }).click();
    const counts = {
      all: Number(await page.getByTestId('count-all').textContent()),
      easy: Number(await page.getByTestId('count-easy').textContent()),
      depends: Number(await page.getByTestId('count-depends').textContent()),
      heavy: Number(await page.getByTestId('count-heavy').textContent()),
    };
    expect(counts.all).toBe(counts.easy + counts.depends + counts.heavy);
    await page.getByRole('radio', { name: /^편하게 먹기 좋은 후보/ }).click();
    await expect(page.locator('[data-food]')).toHaveCount(counts.easy);
    // 필터를 바꿔도 개수 표시는 검색 범위 기준 그대로
    await expect(page.getByTestId('count-heavy')).toHaveText(String(counts.heavy));

    // 검색 결과 없음 안내
    await page.getByLabel('음식 검색').fill('존재하지않는음식');
    await expect(page.getByText('‘존재하지않는음식’에 맞는 음식이 없어요')).toBeVisible();
  });

  test('추천 카드 클릭과 적합도 정렬·이름순 정렬', async ({ page }) => {
    await page.goto('/');
    await expect(grid(page).first()).toBeVisible();
    await expect(page.getByTestId('featured-food').first()).toBeVisible();
    await page.getByTestId('featured-food').first().click();
    await expect(page.getByTestId('food-detail')).toBeVisible();
    await page.getByRole('button', { name: '닫기' }).click();

    const headings = await page.locator('section[aria-label] > h3').allTextContents();
    expect(headings[0]).toContain('편하게 먹기 좋은 후보');
    expect(headings[1]).toContain('조리법·컨디션에 따라 다름');
    expect(headings[2]).toContain('상대적으로 부담될 수 있음');

    await page.getByText('필터 및 정렬').click();
    const order = () => page.locator('[data-food]').evaluateAll((els) => els.map((e) => e.getAttribute('data-food')));
    await page.getByRole('button', { name: /정렬: 적합도순/ }).click();
    const byName = await order();
    expect(byName).toEqual([...byName].sort((a, b) => a!.localeCompare(b!, 'ko')));
  });

  test('조건부 메뉴 상세: 조리법 구분, 닫아도 스크롤 위치 유지', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('음식 검색').fill('');
    await chip(page, '만두').scrollIntoViewIfNeeded();
    await chip(page, '만두').click();
    const detail = page.getByTestId('food-detail');
    await expect(detail).toBeVisible();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(300);
    await expect(detail).toContainText('조리법별 차이');
    for (const v of ['찐만두', '물만두', '군만두', '튀김만두']) await expect(detail).toContainText(v);
    await expect(detail).toContainText('기름 사용');
    await page.getByRole('button', { name: '닫기' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThan(5);
  });

  test('수백 개 음식 표시·검색 성능', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-food]')).toHaveCount(262);
    const ms = await page.evaluate(async () => {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="음식 검색"]')!;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      const t0 = performance.now();
      for (const q of ['국', '국수', '', '튀김', '']) {
        setter.call(input, q);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      }
      return (performance.now() - t0) / 5;
    });
    expect(ms).toBeLessThan(200);
  });
});

test.describe('D-2. 개인 반응 기록', () => {
  test('반응 저장 → 수정 → 삭제, 같은 음식 여러 번 기록', async ({ page }) => {
    await signupViaUi(page, '반응');
    await page.goto('/');
    await page.getByLabel('음식 검색').fill('만두');
    await chip(page, '만두').click();
    const detail = page.getByTestId('food-detail');
    await detail.getByRole('button', { name: '편했어요', exact: true }).click();
    await expect(detail.getByLabel('반응 기록 목록').locator('li')).toHaveCount(1);
    await expect(detail).toContainText('현재 데이터 부족');

    // 자세히 기록: 조리법 + 메모
    await detail.getByRole('button', { name: '자세히 기록하기' }).click();
    await detail.getByRole('button', { name: '불편했어요' }).click();
    await detail.getByLabel('조리법').selectOption({ label: '군만두' });
    await detail.getByLabel('메모 (선택)').fill('기름져서 속이 더부룩');
    await detail.getByRole('button', { name: '기록 저장' }).click();
    await expect(detail.getByLabel('반응 기록 목록').locator('li')).toHaveCount(2);
    await expect(detail).toContainText('기름져서 속이 더부룩');
    await expect(detail).toContainText('군만두');

    // 수정
    await detail.getByRole('button', { name: '기록 수정' }).first().click();
    await detail.getByLabel('메모 (선택)').fill('수정한 메모');
    await detail.getByRole('button', { name: '수정 저장' }).click();
    await expect(detail).toContainText('수정한 메모');

    // 2건 이상이면 개인 기록 기준으로 정렬 반영
    await page.getByRole('button', { name: '닫기' }).click();
    await expect(chip(page, '만두')).toHaveAttribute('aria-label', /내 기록 있음/);

    // 삭제
    await chip(page, '만두').click();
    page.once('dialog', (d) => d.accept());
    await detail.getByRole('button', { name: '기록 삭제' }).first().click();
    await expect(detail.getByLabel('반응 기록 목록').locator('li')).toHaveCount(1);
  });
});
