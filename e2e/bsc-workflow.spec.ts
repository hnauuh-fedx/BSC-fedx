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

test('mở lại EVALUATION giữ version cũ, chỉ mở kết quả và duyệt lại điểm mới', async ({ browser }) => {
  const employeeSession = await login(browser, fixture.employee), managerSession = await login(browser, fixture.manager);
  const employee = employeeSession.page, manager = managerSession.page, bscId = fixture.bscIds.reopenEvaluation;
  await employee.goto(`/employee-bsc/${bscId}`);
  await expect(employee.getByText('Điểm chính thức')).toBeVisible();
  await employee.getByRole('button', { name: 'Yêu cầu sửa kết quả đánh giá' }).click();
  const requestDialog = employee.getByRole('dialog');
  await expect(requestDialog.getByRole('button', { name: 'Gửi yêu cầu' })).toBeDisabled();
  await requestDialog.getByLabel('Lý do mở lại').fill('Sửa kết quả E2E');
  await requestDialog.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(employee.getByText(/đang chờ xử lý/i)).toBeVisible();
  await expect(employee.getByRole('button', { name: 'Yêu cầu sửa kết quả đánh giá' })).toHaveCount(0);
  await expect(employee.getByLabel(new RegExp(`Kết quả ${fixture.marker}_REOPEN_EVAL_KPI`))).toHaveCount(0);

  let listCalls = 0, detailCalls = 0, approveCalls = 0;
  manager.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname === '/api/employee-bsc/reopen-requests/pending') listCalls += 1;
    if (/\/api\/employee-bsc\/reopen-requests\/[0-9a-f-]+$/.test(url.pathname)) detailCalls += 1;
    if (url.pathname.endsWith('/approve')) approveCalls += 1;
  });
  await manager.goto('/management/bsc-reopen-requests');
  await manager.getByRole('tab', { name: 'Yêu cầu sửa kết quả' }).click();
  await expect(manager.getByText('Sửa kết quả E2E')).toBeVisible();
  expect(detailCalls).toBe(0);
  await manager.getByRole('button', { name: 'Chi tiết' }).click();
  await expect(manager.getByText('Chi tiết yêu cầu EVALUATION')).toBeVisible();
  expect(detailCalls).toBe(1); expect(listCalls).toBeGreaterThanOrEqual(1);
  await manager.getByRole('dialog').getByRole('button', { name: 'Xem phiên bản nguồn' }).click();
  await expect(manager.getByRole('heading', { name: /Phiên bản nguồn/ })).toBeVisible();
  await manager.getByRole('dialog').last().getByRole('button', { name: 'Đóng' }).click();
  await manager.getByRole('dialog').getByRole('button', { name: 'Từ chối' }).click();
  const rejectDialog = manager.getByRole('dialog').last();
  await expect(rejectDialog.getByRole('button', { name: 'Xác nhận từ chối' })).toBeDisabled();
  await rejectDialog.getByLabel('Lý do từ chối').fill('Cần giữ kết quả hiện tại');
  await rejectDialog.getByRole('button', { name: 'Xác nhận từ chối' }).click();
  await employee.reload();
  await expect(employee.getByText('Cần giữ kết quả hiện tại')).toBeVisible();
  await employee.getByRole('button', { name: 'Yêu cầu sửa kết quả đánh giá' }).click();
  await employee.getByLabel('Lý do mở lại').fill('Sửa kết quả E2E lần hai');
  await employee.getByRole('dialog').getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await manager.reload();
  await manager.getByRole('tab', { name: 'Yêu cầu sửa kết quả' }).click();
  await manager.getByRole('button', { name: 'Chi tiết' }).click();
  manager.on('dialog', dialog => void dialog.accept());
  await manager.getByRole('dialog').getByRole('button', { name: 'Duyệt mở lại' }).dblclick();
  await expect(manager.getByText('Không có yêu cầu mở lại đang chờ xử lý.')).toBeVisible();
  expect(approveCalls).toBe(1);

  await employee.reload();
  await expect(employee.getByLabel('Trạng thái REOPENED').first()).toBeVisible();
  await expect(employee.getByText('Điểm chính thức')).toHaveCount(0);
  await expect(employee.getByRole('heading', { name: 'Điểm dự kiến' })).toBeVisible();
  await expect(employee.getByLabel(new RegExp(`Chỉ tiêu ${fixture.marker}_REOPEN_EVAL_KPI`))).toHaveCount(0);
  const actual = employee.getByLabel(new RegExp(`Kết quả ${fixture.marker}_REOPEN_EVAL_KPI`));
  await expect(actual).toHaveValue('90');
  await employee.getByRole('listitem').filter({ hasText: 'EVALUATION_APPROVED' }).getByRole('button', { name: 'Xem chi tiết' }).click();
  await expect(employee.getByRole('dialog').getByText(/EVALUATION_APPROVED/)).toBeVisible();
  await employee.getByRole('dialog').getByRole('button', { name: 'Đóng' }).click();
  await actual.fill('100');
  await employee.getByLabel(new RegExp(`TM KQTH ${fixture.marker}_REOPEN_EVAL_KPI`)).fill('Kết quả mới');
  await employee.getByRole('button', { name: 'Lưu kết quả' }).click();
  employee.on('dialog', dialog => void dialog.accept());
  await employee.getByRole('button', { name: 'Gửi duyệt kết quả' }).click();
  await expect(employee.getByText('Đang chờ duyệt kết quả.')).toBeVisible();
  await manager.goto(`/employee-bsc/${bscId}`);
  await manager.getByRole('button', { name: 'Duyệt kết quả' }).click();
  await employee.reload();
  await expect(employee.getByText('Điểm chính thức').locator('xpath=following-sibling::dd[1]')).toHaveText('100');
  await expect(employee.getByText('Phiên bản 4')).toBeVisible();
  await employeeSession.context.close(); await managerSession.context.close();
});

test('mở lại PLAN reset evaluation, mở definition và yêu cầu duyệt kế hoạch lại', async ({ browser }) => {
  const employeeSession = await login(browser, fixture.employee), managerSession = await login(browser, fixture.manager);
  const employee = employeeSession.page, manager = managerSession.page, bscId = fixture.bscIds.reopenPlan;
  await employee.goto(`/employee-bsc/${bscId}`);
  await employee.getByRole('button', { name: 'Yêu cầu sửa kế hoạch' }).click();
  await employee.getByLabel('Lý do mở lại').fill('Đổi target E2E');
  await employee.getByRole('dialog').getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await manager.goto('/management/bsc-reopen-requests');
  await expect(manager.getByText('Đổi target E2E')).toBeVisible();
  manager.on('dialog', dialog => void dialog.accept());
  await manager.getByRole('button', { name: 'Duyệt mở lại' }).dblclick();
  await expect(manager.getByText('Không có yêu cầu mở lại đang chờ xử lý.')).toBeVisible();
  await employee.reload();
  await expect(employee.getByLabel('Trạng thái REOPENED').first()).toBeVisible();
  await expect(employee.getByLabel('Trạng thái NOT_STARTED')).toBeVisible();
  await expect(employee.getByText('E2E actual')).toHaveCount(0);
  const target = employee.getByLabel(new RegExp(`Chỉ tiêu ${fixture.marker}_REOPEN_PLAN_KPI`));
  await expect(target).toBeVisible(); await target.fill('120');
  await employee.getByRole('button', { name: 'Lưu KPI' }).click();
  await expect(employee.getByLabel(new RegExp(`Kết quả ${fixture.marker}_REOPEN_PLAN_KPI`))).toHaveCount(0);
  employee.on('dialog', dialog => void dialog.accept());
  await employee.getByRole('button', { name: 'Gửi duyệt BSC' }).click();
  await manager.goto(`/employee-bsc/${bscId}`);
  await manager.getByRole('button', { name: 'Duyệt BSC' }).click();
  await employee.reload();
  await expect(employee.getByLabel('Trạng thái DRAFT').first()).toBeVisible();
  await expect(employee.getByLabel(new RegExp(`Kết quả ${fixture.marker}_REOPEN_PLAN_KPI`))).toHaveValue('');
  await employeeSession.context.close(); await managerSession.context.close();
});

test('duplicate dùng approved PLAN, gợi ý kỳ OPEN và chống double-click', async ({ browser }) => {
  const session = await login(browser, fixture.employee), page = session.page;
  await page.goto(`/employee-bsc/${fixture.bscIds.duplicateSource}`);
  await page.getByRole('button', { name: 'Sao chép BSC' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Chỉ nội dung kế hoạch/)).toBeVisible();
  await expect(dialog.getByLabel('Kỳ đích')).toHaveValue(fixture.cycleIds.duplicateTargets[0]);
  let duplicateCalls = 0;
  page.on('request', req => { if (req.method() === 'POST' && req.url().endsWith(`/employee-bsc/${fixture.bscIds.duplicateSource}/duplicate`)) duplicateCalls += 1; });
  await dialog.getByRole('button', { name: 'Xác nhận sao chép' }).dblclick();
  await expect(page).toHaveURL(/\/employee-bsc\/[0-9a-f-]+$/);
  expect(duplicateCalls).toBe(1);
  await expect(page.getByLabel('Trạng thái DRAFT')).toBeVisible();
  await expect(page.getByLabel('Trạng thái NOT_STARTED')).toBeVisible();
  await expect(page.getByText('DUPLICATE_SOURCE KPI')).toBeVisible();
  await expect(page.getByText('Nguồn sao chép')).toBeVisible();
  await expect(page.getByText('E2E actual')).toHaveCount(0);
  await expect(page.getByText('Điểm chính thức')).toHaveCount(0);
  await session.context.close();
});

test('duplicate vào kỳ đã có BSC hiển thị lỗi và không tạo thêm record', async ({ browser }) => {
  const session = await login(browser, fixture.employee), page = session.page;
  await page.route(`**/employee-bsc/${fixture.bscIds.duplicateSource}/duplicate-options`, async route => {
    const response = await route.fetch();
    const body = await response.json() as { cycles: unknown[] };
    await route.fulfill({ response, json: {
      ...body,
      suggestedCycleId: fixture.cycleIds.duplicateTargets[0],
      cycles: [{
        id: fixture.cycleIds.duplicateTargets[0], code: 'EXISTING', name: 'Kỳ đã có BSC',
        year: 2099, month: 1, status: 'OPEN', start_date: '2099-01-01T00:00:00.000Z',
      }, ...body.cycles],
    } });
  });
  await page.goto(`/employee-bsc/${fixture.bscIds.duplicateSource}`);
  await page.getByRole('button', { name: 'Sao chép BSC' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận sao chép' }).click();
  await expect(page.getByText(/Đã có BSC trong kỳ đích/)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/employee-bsc/${fixture.bscIds.duplicateSource}$`));
  await session.context.close();
});

test('quản lý ngoài phạm vi không thấy reopen request', async ({ browser }) => {
  const session = await login(browser, fixture.outsideManager);
  await session.page.goto('/management/bsc-reopen-requests');
  await expect(session.page.getByText('Không có yêu cầu mở lại đang chờ xử lý.')).toBeVisible();
  await session.context.close();
});
