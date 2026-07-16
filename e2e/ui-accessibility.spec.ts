import { expect, test, type Browser } from '@playwright/test';
import { readState, type FixtureState } from './support/fixture';

let fixture: FixtureState;
test.beforeAll(async () => { fixture = await readState(); });

async function login(browser: Browser, viewport = { width: 1366, height: 768 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(fixture.manager.email);
  await page.getByLabel('Mật khẩu').fill(fixture.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  return { context, page };
}

test('BSC detail và bảng KPI không làm tràn trang ở desktop 1366x768', async ({ browser }) => {
  const session = await login(browser);
  await session.page.goto(`/employee-bsc/${fixture.bscIds.reopenEvaluation}`);
  await expect(session.page.getByRole('heading', { name: new RegExp(fixture.marker) }).first()).toBeVisible();
  const dimensions = await session.page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
  await expect(session.page.getByRole('region', { name: 'Danh sách KPI và điểm' })).toBeVisible();
  await session.context.close();
});

test('hộp thoại trả lại hỗ trợ bàn phím, Escape và phục hồi focus', async ({ browser }) => {
  const session = await login(browser, { width: 1024, height: 768 });
  await session.page.goto('/management/bsc-reviews');
  await session.page.getByRole('tab', { name: 'Chờ duyệt kết quả' }).click();
  const returnButton = session.page.getByRole('button', { name: 'Trả lại' }).first();
  await expect(returnButton).toBeVisible();
  await returnButton.focus();
  await session.page.keyboard.press('Enter');
  const dialog = session.page.getByRole('dialog', { name: /Trả lại kết quả/i });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await session.page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(returnButton).toBeFocused();
  await session.context.close();
});
