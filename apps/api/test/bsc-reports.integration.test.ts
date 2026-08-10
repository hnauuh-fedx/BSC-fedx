import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createApp } from '../src/main';
import { PrismaService } from '../src/database/prisma.service';

const prisma = new PrismaClient();
const marker = `BSCREPORT_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`.toUpperCase();
const password = 'BscReport!Test#1';
const created = { users: [] as string[], roles: [] as string[], permissions: [] as string[] };

const REPORT_PERMISSIONS = {
  PERSONAL: 'bsc.statistics.personal',
  UNIT: 'bsc.statistics.unit',
  ORGANIZATION: 'bsc.statistics.organization',
  EXPORT: 'bsc.report.export',
} as const;

function safeDatabase(): boolean {
  try { return decodeURIComponent(new URL(process.env.TEST_DATABASE_URL ?? '').pathname.slice(1)).toLowerCase() === 'bsc_organization_test'; }
  catch { return false; }
}

async function cleanup() {
  if (created.users.length) await prisma.audit_logs.deleteMany({ where: { user_id: { in: created.users } } });
  await prisma.employee_bsc.deleteMany({ where: { bsc_code: { startsWith: marker } } });
  await prisma.bsc_cycles.deleteMany({ where: { code: { startsWith: marker } } });
  if (created.users.length) {
    await prisma.auth_refresh_tokens.deleteMany({ where: { user_id: { in: created.users } } });
    await prisma.user_roles.deleteMany({ where: { user_id: { in: created.users } } });
    await prisma.manager_relationships.deleteMany({
      where: { OR: [{ employee_id: { in: created.users } }, { manager_id: { in: created.users } }] },
    });
    await prisma.users.deleteMany({ where: { id: { in: created.users } } });
  }
  if (created.roles.length) {
    await prisma.role_permissions.deleteMany({ where: { role_id: { in: created.roles } } });
    await prisma.roles.deleteMany({ where: { id: { in: created.roles } } });
  }
  for (const id of created.permissions) {
    if (await prisma.role_permissions.count({ where: { permission_id: id } }) === 0) await prisma.permissions.delete({ where: { id } });
  }
  await prisma.departments.deleteMany({ where: { code: { startsWith: marker } } });
  await prisma.positions.deleteMany({ where: { code: { startsWith: marker } } });
}

test('Phase 3C.2 BSC dashboard, report and export integration', { skip: safeDatabase() ? false : 'TEST_DATABASE_URL must target bsc_organization_test' }, async (t) => {
  const database = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  assert.equal(database[0].current_database.toLowerCase(), 'bsc_organization_test');
  let app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
  try {
    await cleanup();
    const department = await prisma.departments.create({ data: { code: `${marker}_DEPT`, name: `${marker} Department` } });
    const outsideDepartment = await prisma.departments.create({ data: { code: `${marker}_OUT`, name: `${marker} Outside` } });
    const unrelatedDepartment = await prisma.departments.create({ data: { code: `${marker}_NONE`, name: `${marker} Unrelated` } });
    const position = await prisma.positions.create({ data: { code: `${marker}_POS`, name: `${marker} Position`, level: 1 } });

    for (const code of Object.values(REPORT_PERMISSIONS)) {
      const existing = await prisma.permissions.findUnique({ where: { code } });
      const permission = await prisma.permissions.upsert({ where: { code }, create: { code, name: code, module: 'bsc' }, update: {} });
      if (!existing) created.permissions.push(permission.id);
    }
    const makeRole = async (name: string, codes: string[]) => {
      const role = await prisma.roles.create({ data: { code: `${marker}_${name}`, name, hierarchy_level: 1, is_system: false } });
      created.roles.push(role.id);
      const permissions = await prisma.permissions.findMany({ where: { code: { in: codes } }, select: { id: true } });
      await prisma.role_permissions.createMany({ data: permissions.map(({ id }) => ({ role_id: role.id, permission_id: id })) });
      return role;
    };
    const employeeRole = await makeRole('EMPLOYEE', [REPORT_PERMISSIONS.PERSONAL, REPORT_PERMISSIONS.EXPORT]);
    const managerRole = await makeRole('MANAGER', [REPORT_PERMISSIONS.PERSONAL, REPORT_PERMISSIONS.UNIT, REPORT_PERMISSIONS.EXPORT]);
    const unrelatedGlobalRole = await makeRole('GLOBAL_TECH', []);
    const globalViewRole = await makeRole('GLOBAL_VIEW', [REPORT_PERMISSIONS.ORGANIZATION]);
    const departmentExportRole = await makeRole('DEPT_EXPORT', [REPORT_PERMISSIONS.EXPORT]);
    const adminRole = await makeRole('ADMIN', []);
    const hash = await argon2.hash(password);
    const makeUser = async (name: string, roleId: string, departmentId: string, scope: 'SELF' | 'DEPARTMENT' | 'GLOBAL', managerId?: string) => {
      const user = await prisma.users.create({ data: { employee_code: `${marker}_${name}`, username: String(`${marker}_${name}`).toLowerCase(), full_name: `${marker} ${name}`, email: `${marker.toLowerCase()}_${name.toLowerCase()}@example.test`, password_hash: hash, department_id: departmentId, position_id: position.id, direct_manager_id: managerId } });
      created.users.push(user.id);
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: roleId, scope_type: scope, scope_id: scope === 'DEPARTMENT' ? departmentId : null } });
      return user;
    };
    const admin = await makeUser('ADMIN', adminRole.id, department.id, 'GLOBAL');
    const manager = await makeUser('MANAGER', managerRole.id, department.id, 'DEPARTMENT', admin.id);
    await prisma.user_roles.create({ data: { user_id: manager.id, role_id: unrelatedGlobalRole.id, scope_type: 'GLOBAL' } });
    const outsideManager = await makeUser('OUT_MANAGER', managerRole.id, outsideDepartment.id, 'DEPARTMENT', admin.id);
    const mixedExportUser = await makeUser('MIXED_EXPORT', globalViewRole.id, department.id, 'GLOBAL', admin.id);
    await prisma.user_roles.create({ data: { user_id: mixedExportUser.id, role_id: departmentExportRole.id, scope_type: 'DEPARTMENT', scope_id: department.id } });
    const employee = await makeUser('EMPLOYEE', employeeRole.id, department.id, 'SELF', manager.id);
    const employee2 = await makeUser('EMPLOYEE2', employeeRole.id, department.id, 'SELF', manager.id);
    const employee3 = await makeUser('EMPLOYEE3', employeeRole.id, department.id, 'SELF', manager.id);
    const employeeWithoutBsc = await makeUser('NO_BSC', employeeRole.id, department.id, 'SELF', manager.id);
    const canonicalEmployeeRole = await prisma.roles.findUniqueOrThrow({ where: { code: 'EMPLOYEE' } });
    await prisma.user_roles.create({ data: { user_id: employeeWithoutBsc.id, role_id: canonicalEmployeeRole.id, scope_type: 'SELF' } });
    const crossDepartmentEmployee = await makeUser('CROSS_EMPLOYEE', employeeRole.id, outsideDepartment.id, 'SELF', manager.id);
    const outsideEmployee = await makeUser('OUT_EMPLOYEE', employeeRole.id, outsideDepartment.id, 'SELF', outsideManager.id);
    await prisma.manager_relationships.createMany({ data: [
      ...[employee, employee2, employee3, employeeWithoutBsc].map((owner) => ({ employee_id: owner.id, manager_id: manager.id, is_primary: true, start_date: new Date('2020-01-01') })),
      { employee_id: crossDepartmentEmployee.id, manager_id: manager.id, is_primary: true, start_date: new Date('2020-01-01') },
      { employee_id: outsideEmployee.id, manager_id: outsideManager.id, is_primary: true, start_date: new Date('2020-01-01') },
    ] });
    const cycle = await prisma.bsc_cycles.create({ data: { code: `${marker}_C1`, name: `${marker} Cycle 1`, cycle_type: 'MONTH', year: 2099, month: 1, start_date: new Date('2099-01-01'), end_date: new Date('2099-01-31'), submission_deadline: new Date('2099-01-31T23:59:59Z'), status: 'OPEN', created_by: admin.id } });
    const otherCycle = await prisma.bsc_cycles.create({ data: { code: `${marker}_C2`, name: `${marker} Cycle 2`, cycle_type: 'MONTH', year: 2099, month: 2, start_date: new Date('2099-02-01'), end_date: new Date('2099-02-28'), submission_deadline: new Date('2099-02-28T23:59:59Z'), status: 'OPEN', created_by: admin.id } });
    const makeBsc = async (name: string, owner: typeof employee, ownerManager: typeof manager, data: { plan: string; evaluation: string; score?: number; grade?: string; cycleId?: string }) => {
      const bsc = await prisma.employee_bsc.create({ data: { bsc_code: `${marker}_${name}`, cycle_id: data.cycleId ?? cycle.id, employee_id: owner.id, department_id: owner.department_id, position_id: position.id, direct_manager_id: ownerManager.id, created_by: owner.id, plan_status: data.plan, evaluation_status: data.evaluation, final_score: data.score, final_grade: data.grade, plan_approved_at: data.plan === 'APPROVED' ? new Date('2099-01-10') : null, evaluation_approved_at: data.evaluation === 'APPROVED' ? new Date('2099-01-20') : null, evaluation_approved_by: data.evaluation === 'APPROVED' ? ownerManager.id : null } });
      await prisma.employee_bsc_items.create({ data: { employee_bsc_id: bsc.id, kpi_code: `${marker.slice(0, 35)}_${name}`, kpi_name: name, target_value: 100, actual_value: data.evaluation === 'NOT_STARTED' ? null : 100, weight: 100, assigned_by: ownerManager.id } });
      if (data.plan === 'SUBMITTED') await prisma.bsc_approval_steps.create({ data: { employee_bsc_id: bsc.id, stage: 'PLAN', step_order: 1, approver_id: ownerManager.id, approver_role: 'MANAGER', status: 'PENDING' } });
      if (data.evaluation === 'SUBMITTED') await prisma.bsc_approval_steps.create({ data: { employee_bsc_id: bsc.id, stage: 'EVALUATION', step_order: 1, approver_id: ownerManager.id, approver_role: 'MANAGER', status: 'PENDING' } });
      return bsc;
    };
    const approved = await makeBsc('APPROVED', employee, manager, { plan: 'APPROVED', evaluation: 'APPROVED', score: 100, grade: 'A' });
    await makeBsc('DRAFT_PREVIEW', employee2, manager, { plan: 'APPROVED', evaluation: 'DRAFT', score: 130, grade: 'A+' });
    await makeBsc('OUTSIDE', outsideEmployee, outsideManager, { plan: 'APPROVED', evaluation: 'APPROVED', score: 111, grade: 'A++' });
    await makeBsc('CROSS_DEPARTMENT', crossDepartmentEmployee, manager, { plan: 'APPROVED', evaluation: 'APPROVED', score: 90, grade: 'A', cycleId: otherCycle.id });
    await makeBsc('PERSONAL_TREND', employee, manager, { plan: 'APPROVED', evaluation: 'APPROVED', score: 90, grade: 'A', cycleId: otherCycle.id });
    await makeBsc('PENDING', employee3, manager, { plan: 'SUBMITTED', evaluation: 'NOT_STARTED' });
    await makeBsc('MGR_PENDING', manager, admin, { plan: 'SUBMITTED', evaluation: 'NOT_STARTED' });
    await makeBsc('OTHER_CYCLE', employee2, manager, { plan: 'SUBMITTED', evaluation: 'NOT_STARTED', cycleId: otherCycle.id });

    const started = await createApp(); app = started.app; await app.init(); const server = app.getHttpServer();
    const login = async (username: string) => (await request(server).post('/auth/login').send({ username, password }).expect(200)).body.accessToken as string;
    const tokens = { employee: await login(employee.username), employeeWithoutBsc: await login(employeeWithoutBsc.username), manager: await login(manager.username), outsideManager: await login(outsideManager.username), mixedExportUser: await login(mixedExportUser.username), admin: await login(admin.username) };
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    await t.test('canonical EMPLOYEE role receives personal BSC export permission', async () => {
      const canonicalEmployee = await prisma.roles.findUniqueOrThrow({
        where: { code: 'EMPLOYEE' },
        select: {
          role_permissions: {
            where: { permissions: { code: REPORT_PERMISSIONS.EXPORT } },
            select: { permissions: { select: { code: true } } },
          },
        },
      });
      assert.deepEqual(canonicalEmployee.role_permissions.map(row => row.permissions.code), [REPORT_PERMISSIONS.EXPORT]);
    });

    await t.test('employee dashboard and report contain only the owner BSC', async () => {
      const dashboard = await request(server).get(`/bsc-reports/dashboard?cycleId=${cycle.id}`).set(auth(tokens.employee)).expect(200);
      assert.equal(dashboard.body.kind, 'EMPLOYEE');
      assert.equal(dashboard.body.currentBsc.id, approved.id);
      assert.equal(dashboard.body.currentBsc.officialScore, '100');
      const report = await request(server).get('/bsc-reports?limit=100').set(auth(tokens.employee)).expect(200);
      assert.equal(report.body.items.length, 2);
      assert.ok(report.body.items.every((row: { employeeId: string }) => row.employeeId === employee.id));
      const emptyDashboard = await request(server).get(`/bsc-reports/dashboard?cycleId=${cycle.id}`).set(auth(tokens.employeeWithoutBsc)).expect(200);
      assert.equal(emptyDashboard.body.currentBsc, null);
      assert.deepEqual(emptyDashboard.body.actions.map((action: { code: string }) => action.code), ['CREATE_BSC']);
    });

    await t.test('report options expose capabilities and explicit scopes stay isolated', async () => {
      const employeeOptions = await request(server).get('/bsc-reports/options?viewScope=PERSONAL').set(auth(tokens.employee)).expect(200);
      assert.deepEqual(employeeOptions.body.capabilities, {
        canViewPersonal: true,
        canViewManagement: false,
        canExportPersonal: true,
        canExportManagement: false,
        defaultScope: 'PERSONAL',
      });
      assert.deepEqual(employeeOptions.body.employees.map((row: { id: string }) => row.id), [employee.id]);
      await request(server).get('/bsc-reports?viewScope=MANAGEMENT').set(auth(tokens.employee)).expect(403);

      const managerOptions = await request(server).get('/bsc-reports/options?viewScope=MANAGEMENT').set(auth(tokens.manager)).expect(200);
      assert.deepEqual(managerOptions.body.grades, [
        { value: 'D', label: 'D', assignable: true },
        { value: 'C', label: 'C', assignable: true },
        { value: 'B', label: 'B', assignable: true },
        { value: 'A', label: 'A', assignable: true },
        { value: 'A+', label: 'A+', assignable: true },
        { value: 'A++', label: 'A++ (dữ liệu cũ)', assignable: false },
      ]);
      assert.deepEqual(managerOptions.body.capabilities, {
        canViewPersonal: true,
        canViewManagement: true,
        canExportPersonal: true,
        canExportManagement: true,
        defaultScope: 'MANAGEMENT',
      });
      assert.ok(managerOptions.body.departments.some((row: { id: string }) => row.id === department.id));
      assert.ok(managerOptions.body.employees.some((row: { id: string }) => row.id === employeeWithoutBsc.id));
      const personalReport = await request(server).get('/bsc-reports?viewScope=PERSONAL&limit=100').set(auth(tokens.manager)).expect(200);
      assert.deepEqual(personalReport.body.items.map((row: { employeeId: string }) => row.employeeId), [manager.id]);
    });

    await t.test('manager report enforces scope and backend filters', async () => {
      const report = await request(server).get(`/bsc-reports?cycleId=${cycle.id}&departmentId=${department.id}&planStatus=APPROVED&evaluationStatus=APPROVED&finalGrade=A&search=${marker}_EMPLOYEE&sortBy=final_score&sortOrder=desc`).set(auth(tokens.manager)).expect(200);
      assert.equal(report.body.total, 1);
      assert.equal(report.body.items[0].id, approved.id);
      const crossDepartment = await request(server).get(`/bsc-reports?departmentId=${outsideDepartment.id}`).set(auth(tokens.manager)).expect(403);
      assert.equal(crossDepartment.body.code, 'AUTH_SCOPE_DENIED');
      const unrelated = await request(server).get(`/bsc-reports?departmentId=${unrelatedDepartment.id}`).set(auth(tokens.manager)).expect(403);
      assert.equal(unrelated.body.code, 'AUTH_SCOPE_DENIED');
      const outsideView = await request(server).get('/bsc-reports').set(auth(tokens.outsideManager)).expect(200);
      assert.deepEqual(outsideView.body.items.map((row: { employeeId: string }) => row.employeeId).sort(), [outsideEmployee.id, crossDepartmentEmployee.id].sort());
      const legacyView = await request(server).get(`/bsc-reports?cycleId=${cycle.id}&finalGrade=A%2B%2B`).set(auth(tokens.outsideManager)).expect(200);
      assert.equal(legacyView.body.total, 1);
      assert.equal(legacyView.body.items[0].officialGrade, 'A++');
      assert.equal(legacyView.body.items[0].employeeId, outsideEmployee.id);
    });

    await t.test('management dashboard applies the same report filters', async () => {
      const filteredDashboard = await request(server)
        .get(`/bsc-reports/dashboard?cycleId=${cycle.id}&departmentId=${department.id}&employeeId=${employee.id}&planStatus=APPROVED&evaluationStatus=APPROVED&finalGrade=A&search=${marker}_EMPLOYEE`)
        .set(auth(tokens.manager))
        .expect(200);
      assert.equal(filteredDashboard.body.kind, 'MANAGEMENT');
      assert.equal(filteredDashboard.body.totalBsc, 1);
      assert.equal(filteredDashboard.body.planStatusCounts.APPROVED, 1);
      assert.equal(filteredDashboard.body.evaluationStatusCounts.APPROVED, 1);
      assert.equal(filteredDashboard.body.approvedAverageScore, '100');

      const missingDashboard = await request(server)
        .get(`/bsc-reports/dashboard?cycleId=${cycle.id}&departmentId=${department.id}&employeeId=${employeeWithoutBsc.id}&search=${marker}_NO_BSC&planStatus=APPROVED&evaluationStatus=APPROVED&finalGrade=A`)
        .set(auth(tokens.manager))
        .expect(200);
      assert.equal(missingDashboard.body.totalBsc, 0);
      assert.equal(missingDashboard.body.notCreated, 1);

      await request(server)
        .get(`/bsc-reports/dashboard?departmentId=${outsideDepartment.id}`)
        .set(auth(tokens.manager))
        .expect(403);
      await request(server)
        .get('/bsc-reports/dashboard?planStatus=INVALID')
        .set(auth(tokens.manager))
        .expect(400);

      await request(server)
        .get(`/bsc-reports/dashboard?cycleId=${randomUUID()}`)
        .set(auth(tokens.manager))
        .expect(400);
    });

    await t.test('summary uses only persisted approved final score and grade', async () => {
      const summary = await request(server).get(`/bsc-reports/summary?cycleId=${cycle.id}`).set(auth(tokens.manager)).expect(200);
      assert.equal(summary.body.totalBsc, 4);
      assert.equal(summary.body.approvedAverageScore, '100');
      assert.deepEqual(summary.body.gradeDistribution, { D: 0, C: 0, B: 0, A: 1, 'A+': 0 });
      assert.equal(summary.body.evaluationStatusCounts.DRAFT, 1);
      assert.equal(summary.body.evaluationStatusCounts.APPROVED, 1);
      assert.equal(summary.body.pendingPlanReviews, 1);
      assert.deepEqual(summary.body.scoreTrend, [
        { cycleId: cycle.id, cycleName: cycle.name, year: 2099, month: 1, approvedAverageScore: '100', approvedCount: 1 },
        { cycleId: otherCycle.id, cycleName: otherCycle.name, year: 2099, month: 2, approvedAverageScore: '90', approvedCount: 1 },
      ]);

      const personalSummary = await request(server).get(`/bsc-reports/summary?viewScope=PERSONAL&cycleId=${cycle.id}`).set(auth(tokens.employee)).expect(200);
      assert.deepEqual(personalSummary.body.scoreTrend.map((point: { approvedAverageScore: string }) => point.approvedAverageScore), ['100', '90']);
      const legacySummary = await request(server).get(`/bsc-reports/summary?cycleId=${cycle.id}`).set(auth(tokens.outsideManager)).expect(200);
      assert.equal(legacySummary.body.gradeDistribution['A++'], 1);
      const legacyDashboard = await request(server).get(`/bsc-reports/dashboard?cycleId=${cycle.id}`).set(auth(tokens.outsideManager)).expect(200);
      assert.deepEqual(legacyDashboard.body.grades.at(-1), {
        value: 'A++',
        label: 'A++ (dữ liệu cũ)',
        assignable: false,
      });
    });

    await t.test('export applies the same scope/filter and writes a safe audit record', async () => {
      const response = await request(server).get(`/bsc-reports/export?cycleId=${cycle.id}&evaluationStatus=APPROVED&finalGrade=A`).set(auth(tokens.manager)).buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      }).expect(200);
      assert.match(response.headers['content-type'], /spreadsheetml/);
      assert.equal(Buffer.from(response.body).subarray(0, 2).toString(), 'PK');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(response.body);
      const sheet = workbook.getWorksheet('BSC Report');
      assert.ok(sheet);
      assert.equal(sheet.getRow(5).getCell(1).value, 'Mã nhân viên');
      assert.equal(sheet.getRow(6).getCell(1).value, employee.employee_code);
      assert.equal(sheet.getRow(6).getCell(7).value, 'Đã duyệt');
      assert.equal(sheet.getRow(6).getCell(8).value, 'Đã duyệt');
      assert.equal(sheet.rowCount, 6);
      const audit = await prisma.audit_logs.findFirstOrThrow({ where: { user_id: manager.id, action: 'BSC_REPORT_EXPORTED' }, orderBy: { created_at: 'desc' } });
      assert.equal((audit.new_data as { rowCount: number }).rowCount, 1);
      assert.doesNotMatch(JSON.stringify(audit.new_data), /password|token|snapshot|ip|user.?agent/i);
      await request(server).get(`/bsc-reports/export?departmentId=${unrelatedDepartment.id}`).set(auth(tokens.manager)).expect(403);

      const legacyResponse = await request(server).get(`/bsc-reports/export?cycleId=${cycle.id}&finalGrade=A%2B%2B`).set(auth(tokens.outsideManager)).buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      }).expect(200);
      const legacyWorkbook = new ExcelJS.Workbook();
      await legacyWorkbook.xlsx.load(legacyResponse.body);
      const legacySheet = legacyWorkbook.getWorksheet('BSC Report');
      assert.ok(legacySheet);
      assert.equal(legacySheet.rowCount, 6);
      assert.equal(legacySheet.getRow(6).getCell(1).value, outsideEmployee.employee_code);
      assert.equal(legacySheet.getRow(6).getCell(12).value, 'A++');
    });

    await t.test('single employee export uses the detailed BSC layout without a logo', async () => {
      const response = await request(server).get(`/bsc-reports/export?employeeId=${employee.id}&cycleId=${cycle.id}`).set(auth(tokens.manager)).buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(Buffer.from(chunk))); res.on('end', () => callback(null, Buffer.concat(chunks)));
      }).set('User-Agent', 'bsc-export-test').expect(200);
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(response.body);
      const sheet = workbook.getWorksheet('BSC cá nhân'); assert.ok(sheet); assert.equal(sheet.getImages().length, 0);
      assert.equal(sheet.getCell('A1').value, 'BẢNG GIAO MỤC TIÊU VÀ ĐÁNH GIÁ KẾT QUẢ HOẠT ĐỘNG');
      assert.equal(sheet.getCell('C7').value, 'APPROVED'); assert.equal(sheet.getCell('H7').value, 100);
      assert.equal(sheet.getCell('I7').value, 100); assert.equal(sheet.getCell('J7').value, 100); assert.equal(sheet.getCell('K7').value, 100);
      assert.equal(sheet.getCell('A20').value, manager.full_name);
      const audit = await prisma.audit_logs.findFirstOrThrow({ where: { user_id: manager.id, action: 'BSC_EXPORTED', entity_id: approved.id }, orderBy: { created_at: 'desc' } });
      assert.equal(audit.user_agent, 'bsc-export-test'); assert.ok(audit.ip_address);
    });

    await t.test('employee exports only their own detailed BSC', async () => {
      const response = await request(server).get(`/bsc-reports/export?employeeId=${employee.id}&cycleId=${cycle.id}`).set(auth(tokens.employee)).buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(Buffer.from(chunk))); res.on('end', () => callback(null, Buffer.concat(chunks)));
      }).expect(200);
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(response.body);
      const sheet = workbook.getWorksheet('BSC cá nhân'); assert.ok(sheet);
      assert.equal(sheet.getImages().length, 0);
      assert.equal(sheet.getCell('A20').value, manager.full_name);
      assert.equal(sheet.getCell('G20').value, employee.full_name);

      const forbidden = await request(server).get(`/bsc-reports/export?employeeId=${employee2.id}&cycleId=${cycle.id}`).set(auth(tokens.employee)).expect(403);
      assert.equal(forbidden.body.code, 'AUTH_SCOPE_DENIED');
    });

    await t.test('export intersects its assigned scope with the report view scope', async () => {
      const response = await request(server).get('/bsc-reports/export').set(auth(tokens.mixedExportUser)).buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      }).expect(200);
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(response.body);
      const sheet = workbook.getWorksheet('BSC Report'); assert.ok(sheet);
      const employeeCodes = new Set<string>();
      for (let row = 6; row <= sheet.rowCount; row += 1) employeeCodes.add(String(sheet.getRow(row).getCell(1).value));
      assert.ok(employeeCodes.has(employee.employee_code));
      assert.ok(!employeeCodes.has(outsideEmployee.employee_code));
      assert.ok(!employeeCodes.has(crossDepartmentEmployee.employee_code));
      await request(server).get(`/bsc-reports/export?departmentId=${outsideDepartment.id}`).set(auth(tokens.mixedExportUser)).expect(403);
    });

    await t.test('dashboard query count remains bounded as records increase', async () => {
      const appPrisma = app!.get(PrismaService);
      const delegates = [appPrisma.user_roles, appPrisma.bsc_cycles, appPrisma.employee_bsc, appPrisma.bsc_approval_steps, appPrisma.bsc_unlock_requests, appPrisma.departments, appPrisma.users, appPrisma.employee_bsc_items];
      let queryCalls = 0;
      const restores: Array<() => void> = [];
      for (const delegate of delegates) for (const method of ['findMany', 'findFirst', 'findUnique', 'count', 'groupBy', 'aggregate'] as const) {
        const target = delegate as unknown as Record<string, (...args: unknown[]) => unknown>;
        if (typeof target[method] !== 'function') continue;
        const original = target[method].bind(delegate);
        target[method] = (...args: unknown[]) => { queryCalls += 1; return original(...args); };
        restores.push(() => { target[method] = original; });
      }
      try {
        await request(server).get(`/bsc-reports/dashboard?cycleId=${cycle.id}`).set(auth(tokens.manager)).expect(200);
        assert.ok(queryCalls > 0, 'dashboard query instrumentation did not observe Prisma calls');
        assert.ok(queryCalls <= 20, `dashboard executed ${queryCalls} Prisma calls`);
      } finally { for (const restore of restores) restore(); }
    });

    await t.test('ADMIN has no implicit report access', async () => {
      await request(server).get('/bsc-reports').set(auth(tokens.admin)).expect(403);
      await request(server).get('/bsc-reports/dashboard').set(auth(tokens.admin)).expect(403);
    });
  } finally {
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  }
});
