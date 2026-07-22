import { expect, test, type Browser, type Page } from '@playwright/test';
import { prisma, readState, type FixtureState } from './support/fixture';

let fixture: FixtureState;
test.beforeAll(async () => { fixture = await readState(); });
test.describe.configure({ mode: 'serial' });

async function login(browser: Browser, username: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.getByLabel(/Mật khẩu/i).fill(fixture.password);
  await page.getByRole('button', { name: /Đăng nhập/i }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Mở menu tài khoản' })).toBeVisible();
  return page;
}

const vnDay = (offset: number) => {
  const value = new Date(Date.now() + (offset * 24 + 7) * 60 * 60 * 1000);
  return value.toISOString().slice(0, 10);
};
const localTime = (offset: number, hour = '12:00') => `${vnDay(offset)}T${hour}`;

test('quản trị kỳ tháng: mở, khóa, mở lại và employee availability', async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = await login(browser, fixture.manager.username);
  await expect(admin.getByRole('link', { name: 'Kỳ BSC' })).toBeVisible();
  await admin.getByRole('link', { name: 'Kỳ BSC' }).click();
  await expect(admin).toHaveURL(/management\/bsc-cycles$/);
  await admin.getByRole('link', { name: 'Tạo kỳ' }).click();
  const code = `${fixture.marker}_UI_CYCLE`.slice(0, 50);
  await admin.getByLabel('Mã kỳ').fill(code);
  await admin.getByLabel('Tên kỳ').fill('Kỳ quản trị Playwright');
  await admin.getByRole('spinbutton', { name: 'Năm', exact: true }).fill(vnDay(0).slice(0, 4));
  await admin.getByRole('spinbutton', { name: 'Tháng', exact: true }).fill(vnDay(0).slice(5, 7));
  await admin.getByLabel('Ngày bắt đầu').fill(vnDay(-1));
  await admin.getByLabel('Ngày kết thúc').fill(vnDay(30));
  await admin.getByLabel('Hạn nộp kết quả đánh giá').fill(localTime(20));
  await admin.getByRole('button', { name: 'Lưu kỳ' }).click();
  await expect(admin).toHaveURL(/management\/bsc-cycles\/[0-9a-f-]+$/);
  await expect(admin.getByText('Mọi mốc', { exact: false })).toHaveCount(0);
  const cycleId = admin.url().split('/').at(-1)!;

  await admin.goto('/management/bsc-cycles');
  await admin.getByLabel('Tìm kỳ').fill(code);
  await admin.getByLabel('Trạng thái').selectOption('DRAFT');
  await expect(admin.getByRole('link', { name: new RegExp(code) })).toBeVisible();
  await admin.getByRole('link', { name: new RegExp(code) }).click();
  await admin.getByRole('button', { name: 'Chỉnh sửa' }).click();
  await admin.getByLabel('Tên kỳ').fill('Kỳ quản trị Playwright đã sửa');
  await admin.getByRole('button', { name: 'Lưu kỳ' }).click();
  await expect(admin.getByRole('heading', { name: new RegExp('đã sửa') })).toBeVisible();

  await admin.getByRole('button', { name: 'Mở kỳ BSC' }).click();
  await admin.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(admin.getByText('Đang mở')).toBeVisible();
  await expect(admin.getByText(/^Hạn nộp kết quả đánh giá:/)).not.toContainText('Chưa cấu hình');
  await admin.getByRole('button', { name: 'Chỉnh sửa' }).click();
  await admin.getByLabel('Tên kỳ').fill('Kỳ quản trị Playwright đang mở');
  await admin.getByRole('button', { name: 'Lưu kỳ' }).click();
  await expect(admin.getByRole('heading', { name: new RegExp('đang mở') })).toBeVisible();
  const employee = await login(browser, fixture.employee.username);
  await employee.goto('/employee-bsc/new');
  await expect(employee.getByLabel('Kỳ BSC').locator(`option[value="${cycleId}"]`)).toHaveCount(1);
  await employee.getByLabel('Kỳ BSC').selectOption(cycleId);
  await employee.getByRole('button', { name: 'Tạo BSC' }).click();
  await expect(employee).toHaveURL(/\/employee-bsc\/[0-9a-f-]+$/);
  const bscId = employee.url().split('/').at(-1)!;

  await admin.goto(`/employee-bsc/${bscId}`);
  await admin.getByPlaceholder('Mã KPI').fill(`${fixture.marker}_CYCLE_KPI`);
  await admin.getByPlaceholder('Tên KPI').fill('KPI quản lý kỳ E2E');
  await admin.getByPlaceholder('Đơn vị đo').fill('%');
  await admin.getByPlaceholder('Chỉ tiêu').fill('100');
  await admin.getByPlaceholder('Trọng số').fill('100');
  await admin.getByRole('button', { name: 'Thêm KPI' }).click();
  await expect(admin.getByText('KPI quản lý kỳ E2E')).toBeVisible();

  await employee.reload();
  employee.on('dialog', (dialog) => void dialog.accept());
  await employee.getByRole('button', { name: 'Gửi duyệt BSC' }).click();
  await expect(employee.getByText('Đang chờ duyệt nội dung BSC.')).toBeVisible();

  await admin.goto(`/management/bsc-cycles/${cycleId}`);
  await admin.getByRole('button', { name: 'Khóa kỳ BSC' }).click();
  await admin.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(admin.getByText('Đang khóa')).toBeVisible();

  await admin.goto(`/employee-bsc/${bscId}`);
  await expect(admin.getByRole('button', { name: 'Trả lại BSC' })).toBeVisible();
  await admin.getByRole('button', { name: 'Trả lại BSC' }).click();
  await admin.getByRole('dialog').getByLabel('Lý do').fill('Cần bổ sung sau khi mở lại kỳ');
  await admin.getByRole('dialog').getByRole('button', { name: 'Xác nhận' }).click();
  await expect(admin.getByText('Cần bổ sung sau khi mở lại kỳ', { exact: true })).toBeVisible();

  await employee.reload();
  await expect(employee.getByRole('alert').filter({ hasText: 'Kỳ BSC đang bị khóa' })).toBeVisible();
  await expect(employee.getByRole('button', { name: 'Gửi duyệt BSC' })).toHaveCount(0);

  await admin.goto(`/management/bsc-cycles/${cycleId}`);
  await admin.getByRole('button', { name: 'Mở kỳ BSC' }).click();
  await admin.getByLabel('Lý do mở lại').fill('Tiếp tục kỳ sau khi kiểm tra dữ liệu');
  await admin.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(admin.getByText('Đang mở')).toBeVisible();
  await employee.reload();
  await expect(employee.getByRole('button', { name: 'Gửi duyệt BSC' })).toBeEnabled();
  await employee.getByRole('button', { name: 'Gửi duyệt BSC' }).click();
  await expect(employee.getByText('Đang chờ duyệt nội dung BSC.')).toBeVisible();

  await admin.goto(`/employee-bsc/${bscId}`);
  admin.on('dialog', (dialog) => void dialog.accept());
  await admin.getByRole('button', { name: 'Duyệt BSC' }).click();
  await expect(admin.getByLabel('Trạng thái Đã duyệt').first()).toBeVisible();
});

test('deadline EVALUATION hiển thị rõ và backend chặn submit sau hạn', async ({ browser }) => {
  const db = prisma();
  try {
    const createEvaluationBsc = async (suffix: string, submissionDeadline: Date) => {
      const cycle = await db.bsc_cycles.create({ data: {
        code: `${fixture.marker}_${suffix}`.slice(0, 50), name: `${suffix} evaluation deadline`, cycle_type: 'MONTH',
        year: 2198, month: suffix === 'EVAL_OK' ? 10 : 11, start_date: new Date('2020-01-01'),
        end_date: new Date('2199-12-31'), submission_deadline: submissionDeadline, status: 'OPEN', created_by: fixture.manager.id,
      } });
      const bsc = await db.employee_bsc.create({ data: {
        bsc_code: `${fixture.marker}_${suffix}_BSC`.slice(0, 50), cycle_id: cycle.id, employee_id: fixture.employee.id,
        department_id: fixture.mainDepartmentId, position_id: fixture.positionId, direct_manager_id: fixture.manager.id,
        created_by: fixture.employee.id, plan_status: 'APPROVED', plan_approved_at: new Date(),
        plan_approved_by: fixture.manager.id, evaluation_status: 'DRAFT',
      } });
      await db.employee_bsc_items.create({ data: {
        employee_bsc_id: bsc.id, kpi_code: `${suffix}_KPI`, kpi_name: `${suffix} KPI`, target_value: 100,
        actual_value: 100, weight: 100, calculation_method: 'ACTUAL_DIV_TARGET', assigned_by: fixture.manager.id,
      } });
      return bsc.id;
    };

    const validId = await createEvaluationBsc('EVAL_OK', new Date(Date.now() + 10 * 60_000));
    const lateId = await createEvaluationBsc('EVAL_LATE', new Date(Date.now() - 60_000));
    const employee = await login(browser, fixture.employee.username);
    const apiLogin = await employee.request.post('/api/auth/login', { data: { username: fixture.employee.username, password: fixture.password } });
    const { accessToken } = await apiLogin.json() as { accessToken: string };
    const headers = { Authorization: `Bearer ${accessToken}` };

    await employee.goto(`/employee-bsc/${validId}`);
    await expect(employee.getByText('Hạn nộp kết quả đánh giá', { exact: true })).toBeVisible();
    const validResponse = await employee.request.post(`/api/employee-bsc/${validId}/evaluation/submit`, { data: {}, headers });
    expect(validResponse.status()).toBe(200);
    await employee.reload();
    await expect(employee.getByText('Đang chờ duyệt kết quả.')).toBeVisible();

    await employee.goto(`/employee-bsc/${lateId}`);
    await expect(employee.getByRole('alert')).toContainText('Đã quá hạn nộp kết quả đánh giá');
    await expect(employee.getByRole('button', { name: 'Gửi duyệt kết quả' })).toHaveCount(0);
    const response = await employee.request.post(`/api/employee-bsc/${lateId}/evaluation/submit`, { data: {}, headers });
    expect(response.status()).toBe(400);
    expect((await response.json()).code).toBe('BSC_EVALUATION_SUBMISSION_DEADLINE_PASSED');
  } finally {
    await db.$disconnect();
  }
});
