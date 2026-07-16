import { expect, test, type Browser } from '@playwright/test';
import { readState, type FixtureState } from './support/fixture';

let fixture: FixtureState;
test.beforeAll(async () => { fixture = await readState(); });
test.describe.configure({ mode: 'serial' });

async function login(browser: Browser, user: { email: string }) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.locator('input[name="password"]').fill(fixture.password);
  await page.locator('#login-submit').click();
  await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
  return { context, page };
}

test('employee opens dashboard and sees only personal BSC history', async ({ browser }) => {
  const session = await login(browser, fixture.employee);
  await expect(session.page).toHaveURL(/\/dashboard$|\/$/);
  await expect(session.page.getByRole('heading', { name: /Lịch sử BSC gần đây/i })).toBeVisible();
  await expect(session.page.getByRole('link', { name: new RegExp(fixture.marker) }).first()).toBeVisible();
  await expect(session.page.getByText(`${fixture.marker} Outside`)).toHaveCount(0);
  await session.context.close();
});

test('manager opens dashboard, filters report and downloads Excel', async ({ browser }) => {
  const session = await login(browser, fixture.manager);
  await expect(session.page.getByText('BSC chờ duyệt')).toBeVisible();
  await session.page.goto('/reports/bsc');
  await session.page.getByLabel('Kỳ BSC').selectOption({ label: `${fixture.marker} Cycle 24` });
  await session.page.getByLabel('Trạng thái EVALUATION').selectOption('APPROVED');
  await expect(session.page.getByRole('link', { name: `${fixture.marker}_REOPEN_EVAL` })).toBeVisible();
  const downloadPromise = session.page.waitForEvent('download');
  await session.page.getByRole('button', { name: 'Xuất Excel' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/bsc-report-.*\.xlsx$/);
  await session.context.close();
});

test('manager outside scope cannot see another department report rows', async ({ browser }) => {
  const session = await login(browser, fixture.outsideManager);
  await session.page.goto('/reports/bsc');
  await expect(session.page.getByText('Không có dữ liệu BSC phù hợp.')).toBeVisible();
  await expect(session.page.getByRole('link', { name: new RegExp(`${fixture.marker}_(?:PERF|REOPEN|DUPLICATE)`) })).toHaveCount(0);
  await session.context.close();
});
