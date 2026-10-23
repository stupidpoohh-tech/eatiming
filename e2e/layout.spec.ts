import { expect, test } from '@playwright/test';

test.describe('F. 화면 크기별 레이아웃', () => {
  test('가로 스크롤 없음, 2열 이상 그리드, 터치 영역, 필터 고정', async ({ page }, info) => {
    await page.goto('/');
    await expect(page.locator('[data-food]').first()).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // 그리드 열 수
    const cols = await page
      .getByTestId('food-grid')
      .first()
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(cols).toBeGreaterThanOrEqual(2);

    // 터치 영역: 칩·필터 버튼 높이 36px 이상
    const heights = await page.locator('[data-food], [role=radio]').evaluateAll((els) => els.slice(0, 40).map((e) => e.getBoundingClientRect().height));
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(36);

    // 스크롤 후에도 검색창이 화면 안에 고정
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(200);
    const box = await page.getByLabel('음식 검색').boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeLessThan(40);

    // 상세 열기·닫기
    await page.locator('[data-food]').nth(30).click();
    await expect(page.getByTestId('food-detail')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // 한국어 UI
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await page.screenshot({ path: `test-results/layout-${info.project.name}.png` });
  });
});
