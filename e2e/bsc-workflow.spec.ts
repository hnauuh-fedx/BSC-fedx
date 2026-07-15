import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readState, type FixtureState } from './support/fixture';

let fixture: FixtureState;

test.beforeAll(async () => { fixture = await readState(); });
test.describe.configure({ mode: 'serial' });

async function login(browser: Browser, user: { email: string }, password = fixture.password): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel(/Mật khẩu/i).fill(password);
  await page.getByRole('button', { name: /Đăng nhập/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: new RegExp(user === fixture.employee ? 'Employee' : user === fixture.manager ? 'Manager' : 'Outside') })).toBeVisible();
  return { context, page };
}

async function createBsc(page: Page, cycleId: string): Promise<string> {
  await page.goto('/employee-bsc/new');
  await page.getByLabel('Kỳ BSC').selectOption(cycleId);
  await page.getByRole('button', { name: 'Tạo BSC' }).click();
  await expect(page).toHaveURL(/\/employee-bsc\/[0-9a-f-]+$/);
  return page.url().split('/').at(-1)!;
}

async function addKpi(page: Page, bscId: string, weight: string) {
  await page.goto(`/employee-bsc/${bscId}`);
  await page.getByPlaceholder('Mã KPI').fill(`${fixture.marker}_FLOW_KPI`);
  await page.getByPlaceholder('Tên KPI').fill('KPI Browser E2E');
  await page.getByPlaceholder('Đơn vị đo').fill('%');
  await page.getByPlaceholder('Chỉ tiêu').fill('100');
  await page.getByPlaceholder('Trọng số').fill(weight);
  await page.getByRole('button', { name: 'Thêm KPI' }).click();
  await expect(page.getByText('KPI Browser E2E')).toBeVisible();
}

test('luồng PLAN/EVALUATION thật giữ khóa trường, return/resubmit, refresh và chống double-click', async ({ browser }) => {
  test.setTimeout(120_000);
  const employeeSession = await login(browser, fixture.employee);
  const bscId = await createBsc(employeeSession.page, fixture.cycleIds.flow);
  const bscCode = (await employeeSession.page.getByRole('heading').first().textContent())!.trim();
  const managerSession = await login(browser, fixture.manager);
  await addKpi(managerSession.page, bscId, '100');
  await expect(managerSession.page.getByLabel(new RegExp(`Trọng số ${fixture.marker}_FLOW_KPI`))).toBeVisible();

  const employee = employeeSession.page;
  await employee.goto(`/employee-bsc/${bscId}`);
  await expect(employee.getByRole('button', { name: 'Gửi duyệt BSC' })).toBeEnabled();
  let submitPlanPosts = 0;
  let failNextDetail = false;
  employee.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/employee-bsc/${bscId}/plan/submit`)) submitPlanPosts += 1;
  });
  employee.on('response', (response) => {
    if (response.request().method() === 'POST' && response.url().endsWith(`/employee-bsc/${bscId}/plan/submit`)) failNextDetail = true;
  });
  await employee.route(`**/api/employee-bsc/${bscId}`, async (route) => {
    if (failNextDetail && route.request().method() === 'GET') { failNextDetail = false; await route.abort(); }
    else await route.continue();
  });
  employee.on('dialog', (dialog) => void dialog.accept());
  await employee.getByRole('button', { name: 'Gửi duyệt BSC' }).dblclick();
  await expect(employee.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  await expect(employee.getByRole('button', { name: 'Gửi duyệt BSC' })).toHaveCount(0);
  expect(submitPlanPosts).toBe(1);
  await employee.getByRole('button', { name: 'Thử lại' }).click();
  await expect(employee.getByText('Đang chờ duyệt nội dung BSC.')).toBeVisible();
  await employee.reload();
  await expect(employee.getByText('Đang chờ duyệt nội dung BSC.')).toBeVisible();
  await expect(employee.getByPlaceholder('Mã KPI')).toHaveCount(0);

  const manager = managerSession.page;
  await manager.goto('/management/bsc-reviews');
  await expect(manager.getByRole('link', { name: new RegExp(fixture.marker) }).first()).toBeVisible();
  await manager.goto(`/employee-bsc/${bscId}`);
  await expect(manager.getByLabel(new RegExp(`Chỉ tiêu ${fixture.marker}_FLOW_KPI`))).toHaveCount(0);
  await expect(manager.getByLabel(new RegExp(`Trọng số ${fixture.marker}_FLOW_KPI`))).toHaveCount(0);
  await expect(manager.getByRole('button', { name: 'Xóa' })).toHaveCount(0);
  let approvePlanPosts = 0;
  manager.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith(`/employee-bsc/${bscId}/plan/approve`)) approvePlanPosts += 1; });
  manager.on('dialog', (dialog) => void dialog.accept());
  await manager.getByRole('button', { name: 'Duyệt BSC' }).dblclick();
  await expect(manager.getByLabel('Trạng thái APPROVED').first()).toBeVisible();
  expect(approvePlanPosts).toBe(1);
  await manager.goto('/management/bsc-reviews');
  await expect(manager.getByRole('link', { name: bscCode })).toHaveCount(0);
  await manager.goto(`/employee-bsc/${bscId}`);
  await manager.reload();
  await expect(manager.getByRole('button', { name: 'Duyệt BSC' })).toHaveCount(0);

  await employee.reload();
  await expect(employee.getByLabel(new RegExp(`Kết quả ${fixture.marker}_FLOW_KPI`))).toBeVisible();
  await expect(employee.getByLabel(new RegExp(`Chỉ tiêu ${fixture.marker}_FLOW_KPI`))).toHaveCount(0);
  await employee.getByLabel(new RegExp(`Kết quả ${fixture.marker}_FLOW_KPI`)).fill('95');
  await employee.getByLabel(new RegExp(`TM KQTH ${fixture.marker}_FLOW_KPI`)).fill('Kết quả lần một');
  await employee.getByRole('button', { name: 'Lưu kết quả' }).click();
  const scoreRow = employee.getByRole('row').filter({ hasText: `${fixture.marker}_FLOW_KPI` });
  const scoreCells = scoreRow.getByRole('cell');
  await expect(scoreCells.nth(5)).toContainText('95%');
  await expect(scoreCells.nth(6)).toHaveText('100');
  await expect(scoreCells.nth(7)).toHaveText('100%');
  await expect(scoreCells.nth(8)).toHaveText('100.0000');
  await expect(employee.getByText('Tổng trọng số').locator('xpath=following-sibling::dd[1]')).toHaveText('100.00%');
  await expect(employee.getByText('Tổng điểm tạm tính').locator('xpath=following-sibling::dd[1]')).toHaveText('100.0000');
  let submitEvaluationPosts = 0;
  employee.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith(`/employee-bsc/${bscId}/evaluation/submit`)) submitEvaluationPosts += 1; });
  await employee.getByRole('button', { name: 'Gửi duyệt kết quả' }).dblclick();
  await expect(employee.getByText('Đang chờ duyệt kết quả.')).toBeVisible();
  expect(submitEvaluationPosts).toBe(1);
  await employee.reload();
  await expect(employee.getByLabel(new RegExp(`Kết quả ${fixture.marker}_FLOW_KPI`))).toHaveCount(0);
  await expect(employee.getByLabel(new RegExp(`TM KQTH ${fixture.marker}_FLOW_KPI`))).toHaveCount(0);

  await manager.goto('/management/bsc-reviews');
  await manager.getByRole('tab', { name: 'Chờ duyệt kết quả' }).click();
  await manager.getByLabel('Tìm kiếm').fill(bscCode);
  await manager.getByRole('link', { name: bscCode }).click();
  await expect(manager.getByText('Kết quả lần một')).toBeVisible();
  await expect(manager.getByText('100.0000').first()).toBeVisible();
  await manager.getByRole('button', { name: 'Trả lại kết quả' }).click();
  const returnDialog = manager.getByRole('dialog');
  await expect(returnDialog.getByRole('button', { name: 'Xác nhận' })).toBeDisabled();
  await returnDialog.getByLabel('Lý do').fill('   ');
  await expect(returnDialog.getByRole('button', { name: 'Xác nhận' })).toBeDisabled();
  await returnDialog.getByLabel('Lý do').fill('Cần bổ sung thuyết minh E2E');
  await returnDialog.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(manager.getByLabel('Trạng thái RETURNED').first()).toBeVisible();

  await employee.reload();
  await expect(employee.getByText('Cần bổ sung thuyết minh E2E', { exact: true })).toBeVisible();
  await expect(employee.getByLabel(new RegExp(`Chỉ tiêu ${fixture.marker}_FLOW_KPI`))).toHaveCount(0);
  await expect(employee.getByLabel(new RegExp(`Trọng số ${fixture.marker}_FLOW_KPI`))).toHaveCount(0);
  await expect(employee.locator('select[name="calculationMethod"]')).toHaveCount(0);
  await expect(employee.getByRole('button', { name: 'Xóa' })).toHaveCount(0);
  await employee.getByLabel(new RegExp(`Kết quả ${fixture.marker}_FLOW_KPI`)).fill('100');
  await employee.getByLabel(new RegExp(`TM KQTH ${fixture.marker}_FLOW_KPI`)).fill('Đã bổ sung thuyết minh');
  await employee.getByRole('button', { name: 'Lưu kết quả' }).click();
  await employee.getByRole('button', { name: 'Gửi duyệt kết quả' }).dblclick();
  await expect(employee.getByText('Đang chờ duyệt kết quả.')).toBeVisible();
  expect(submitEvaluationPosts).toBe(2);

  await manager.goto('/management/bsc-reviews');
  await manager.getByRole('tab', { name: 'Chờ duyệt kết quả' }).click();
  await manager.getByLabel('Tìm kiếm').fill(bscCode);
  await manager.getByRole('link', { name: bscCode }).click();
  let approveEvaluationPosts = 0;
  manager.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith(`/employee-bsc/${bscId}/evaluation/approve`)) approveEvaluationPosts += 1; });
  await manager.getByRole('button', { name: 'Duyệt kết quả' }).dblclick();
  await expect(manager.getByText('Điểm chính thức')).toBeVisible();
  expect(approveEvaluationPosts).toBe(1);

  await employee.reload();
  await expect(employee.getByText('Điểm chính thức')).toBeVisible();
  await expect(employee.getByText('Điểm chính thức').locator('xpath=following-sibling::dd[1]')).toHaveText('100');
  await expect(employee.getByText('Xếp loại', { exact: true }).locator('xpath=following-sibling::dd[1]')).toHaveText('A');
  await expect(employee.getByRole('button', { name: /Gửi duyệt|Duyệt|Trả lại/ })).toHaveCount(0);
  await employee.reload();
  await expect(employee.getByText('Điểm chính thức')).toBeVisible();
  await employeeSession.context.close();
  await managerSession.context.close();
});

test('không cho nộp PLAN khi tổng trọng số khác 100%', async ({ browser }) => {
  const employeeSession = await login(browser, fixture.employee);
  const bscId = await createBsc(employeeSession.page, fixture.cycleIds.underweight);
  const managerSession = await login(browser, fixture.manager);
  await addKpi(managerSession.page, bscId, '80');
  await employeeSession.page.goto(`/employee-bsc/${bscId}`);
  const submit = employeeSession.page.getByRole('button', { name: 'Gửi duyệt BSC' });
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAttribute('title', /100%/);
  await expect(employeeSession.page.getByLabel('Trạng thái DRAFT').first()).toBeVisible();
  await employeeSession.context.close(); await managerSession.context.close();
});

test('pending review tải summary-only và chỉ lazy-load detail/scoring của một BSC', async ({ browser }) => {
  const session = await login(browser, fixture.manager);
  const page = session.page;
  const calls = { pending: 0, detail: 0, scoring: 0 };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/employee-bsc/pending-review') calls.pending += 1;
    else if (/\/api\/employee-bsc\/[0-9a-f-]+\/scoring-preview$/.test(url.pathname)) calls.scoring += 1;
    else if (/\/api\/employee-bsc\/[0-9a-f-]+$/.test(url.pathname)) calls.detail += 1;
  });
  await page.goto('/management/bsc-reviews');
  await expect(page.getByText('Không có BSC chờ duyệt nội dung.')).toBeVisible();
  calls.pending = 0; calls.detail = 0; calls.scoring = 0;
  await page.getByRole('tab', { name: 'Chờ duyệt kết quả' }).click();
  await expect(page.getByRole('link', { name: new RegExp(`${fixture.marker}_PERF`) })).toHaveCount(10);
  expect(calls).toEqual({ pending: 1, detail: 0, scoring: 0 });
  await page.getByLabel('Tìm kiếm').fill(`${fixture.marker}_PERF9`);
  await expect(page.getByRole('link', { name: new RegExp(`${fixture.marker}_PERF9`) })).toHaveCount(1);
  expect({ detail: calls.detail, scoring: calls.scoring }).toEqual({ detail: 0, scoring: 0 });
  await page.getByLabel('Tìm kiếm').fill('');
  await page.getByLabel('Kỳ BSC').selectOption({ label: `${fixture.marker} Cycle 3` });
  await expect(page.getByRole('link', { name: new RegExp(`${fixture.marker}_PERF`) })).toHaveCount(1);
  expect({ detail: calls.detail, scoring: calls.scoring }).toEqual({ detail: 0, scoring: 0 });
  await page.getByLabel('Kỳ BSC').selectOption('');
  await page.getByLabel('Đơn vị').selectOption(fixture.mainDepartmentId);
  await expect(page.getByText('Trang 1 / 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Trước' })).toBeDisabled();
  await page.getByRole('button', { name: 'Sau' }).click();
  await expect(page.getByText('Trang 2 / 3')).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(`${fixture.marker}_PERF`) })).toHaveCount(10);
  expect({ detail: calls.detail, scoring: calls.scoring }).toEqual({ detail: 0, scoring: 0 });
  await page.getByRole('link', { name: new RegExp(`${fixture.marker}_PERF`) }).first().click();
  await expect(page).toHaveURL(/\/employee-bsc\/[0-9a-f-]+$/);
  await expect.poll(() => calls.detail).toBe(1);
  await expect.poll(() => calls.scoring).toBe(1);
  await session.context.close();
});

test('quản lý ngoài phạm vi không thấy danh sách và không mở được detail', async ({ browser }) => {
  const session = await login(browser, fixture.outsideManager);
  await session.page.goto('/management/bsc-reviews');
  await session.page.getByRole('tab', { name: 'Chờ duyệt kết quả' }).click();
  await expect(session.page.getByText('Không có BSC chờ duyệt kết quả.')).toBeVisible();
  await session.page.goto(`/employee-bsc/${fixture.cycleIds.performance[0]}`);
  await expect(session.page.getByRole('alert')).toBeVisible();
  await expect(session.page.getByRole('button', { name: /Duyệt|Trả lại/ })).toHaveCount(0);
  await session.context.close();
});

test('chuyển tab nhanh không để response PLAN cũ ghi đè EVALUATION mới', async ({ browser }) => {
  const session = await login(browser, fixture.manager);
  await session.page.route(/\/api\/employee-bsc\/pending-review\?/, async (route) => {
    const stage = new URL(route.request().url()).searchParams.get('stage');
    if (stage === 'PLAN') await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await session.page.goto('/management/bsc-reviews');
  await session.page.getByRole('tab', { name: 'Chờ duyệt kết quả' }).click();
  await expect(session.page.getByRole('link', { name: new RegExp(`${fixture.marker}_PERF`) })).toHaveCount(10);
  await session.page.waitForTimeout(700);
  await expect(session.page.getByRole('tab', { name: 'Chờ duyệt kết quả' })).toHaveAttribute('aria-selected', 'true');
  await expect(session.page.getByRole('link', { name: new RegExp(`${fixture.marker}_PERF`) })).toHaveCount(10);
  await session.context.close();
});
