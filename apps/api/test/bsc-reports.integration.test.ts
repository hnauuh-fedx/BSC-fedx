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
    const position = await prisma.positions.create({ data: { code: `${marker}_POS`, name: `${marker} Position` } });

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
    const employeeRole = await makeRole('EMPLOYEE', [REPORT_PERMISSIONS.PERSONAL]);
    const managerRole = await makeRole('MANAGER', [REPORT_PERMISSIONS.UNIT, REPORT_PERMISSIONS.EXPORT]);
    const unrelatedGlobalRole = await makeRole('GLOBAL_TECH', []);
    const globalViewRole = await makeRole('GLOBAL_VIEW', [REPORT_PERMISSIONS.ORGANIZATION]);
    const departmentExportRole = await makeRole('DEPT_EXPORT', [REPORT_PERMISSIONS.EXPORT]);
    const adminRole = await makeRole('ADMIN', []);
    const hash = await argon2.hash(password);
    const makeUser = async (name: string, roleId: string, departmentId: string, scope: 'SELF' | 'DEPARTMENT' | 'GLOBAL', managerId?: string) => {
      const user = await prisma.users.create({ data: { employee_code: `${marker}_${name}`, full_name: `${marker} ${name}`, email: `${marker.toLowerCase()}_${name.toLowerCase()}@example.test`, password_hash: hash, department_id: departmentId, position_id: position.id, direct_manager_id: managerId } });
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
    const crossDepartmentEmployee = await makeUser('CROSS_EMPLOYEE', employeeRole.id, outsideDepartment.id, 'SELF', manager.id);
    const outsideEmployee = await makeUser('OUT_EMPLOYEE', employeeRole.id, outsideDepartment.id, 'SELF', outsideManager.id);
    const cycle = await prisma.bsc_cycles.create({ data: { code: `${marker}_C1`, name: `${marker} Cycle 1`, cycle_type: 'MONTH', year: 2099, month: 1, start_date: new Date('2099-01-01'), end_date: new Date('2099-01-31'), submission_deadline: new Date('2099-01-31T23:59:59Z'), status: 'OPEN', created_by: admin.id } });
    const otherCycle = await prisma.bsc_cycles.create({ data: { code: `${marker}_C2`, name: `${marker} Cycle 2`, cycle_type: 'MONTH', year: 2099, month: 2, start_date: new Date('2099-02-01'), end_date: new Date('2099-02-28'), submission_deadline: new Date('2099-02-28T23:59:59Z'), status: 'OPEN', created_by: admin.id } });
    const makeBsc = async (name: string, owner: typeof employee, ownerManager: typeof manager, data: { plan: string; evaluation: string; score?: number; grade?: string; cycleId?: string }) => {
      const bsc = await prisma.employee_bsc.create({ data: { bsc_code: `${marker}_${name}`, cycle_id: data.cycleId ?? cycle.id, employee_id: owner.id, department_id: owner.department_id, position_id: position.id, direct_manager_id: ownerManager.id, created_by: owner.id, plan_status: data.plan, evaluation_status: data.evaluation, final_score: data.score, final_grade: data.grade, plan_approved_at: data.plan === 'APPROVED' ? new Date('2099-01-10') : null, evaluation_approved_at: data.evaluation === 'APPROVED' ? new Date('2099-01-20') : null } });
      await prisma.employee_bsc_items.create({ data: { employee_bsc_id: bsc.id, kpi_code: `${marker.slice(0, 35)}_${name}`, kpi_name: name, target_value: 100, actual_value: data.evaluation === 'NOT_STARTED' ? null : 100, weight: 100, assigned_by: ownerManager.id } });
      if (data.plan === 'SUBMITTED') await prisma.bsc_approval_steps.create({ data: { employee_bsc_id: bsc.id, stage: 'PLAN', step_order: 1, approver_id: ownerManager.id, approver_role: 'MANAGER', status: 'PENDING' } });
      if (data.evaluation === 'SUBMITTED') await prisma.bsc_approval_steps.create({ data: { employee_bsc_id: bsc.id, stage: 'EVALUATION', step_order: 1, approver_id: ownerManager.id, approver_role: 'MANAGER', status: 'PENDING' } });
      return bsc;
    };
    const approved = await makeBsc('APPROVED', employee, manager, { plan: 'APPROVED', evaluation: 'APPROVED', score: 95, grade: 'A' });
    await makeBsc('DRAFT_PREVIEW', employee2, manager, { plan: 'APPROVED', evaluation: 'DRAFT', score: 130, grade: 'A++' });
    await makeBsc('OUTSIDE', outsideEmployee, outsideManager, { plan: 'APPROVED', evaluation: 'APPROVED', score: 111, grade: 'A++' });
    const crossDepartmentBsc = await makeBsc('CROSS_DEPARTMENT', crossDepartmentEmployee, manager, { plan: 'APPROVED', evaluation: 'APPROVED', score: 90, grade: 'A', cycleId: otherCycle.id });
    await makeBsc('PENDING', employee3, manager, { plan: 'SUBMITTED', evaluation: 'NOT_STARTED' });
    await makeBsc('MGR_PENDING', manager, admin, { plan: 'SUBMITTED', evaluation: 'NOT_STARTED' });
    await makeBsc('OTHER_CYCLE', employee2, manager, { plan: 'SUBMITTED', evaluation: 'NOT_STARTED', cycleId: otherCycle.id });

    const started = await createApp(); app = started.app; await app.init(); const server = app.getHttpServer();
    const login = async (email: string) => (await request(server).post('/auth/login').send({ email, password }).expect(200)).body.accessToken as string;
    const tokens = { employee: await login(employee.email), employeeWithoutBsc: await login(employeeWithoutBsc.email), manager: await login(manager.email), outsideManager: await login(outsideManager.email), mixedExportUser: await login(mixedExportUser.email), admin: await login(admin.email) };
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    await t.test('employee dashboard and report contain only the owner BSC', async () => {
      const dashboard = await request(server).get(`/bsc-reports/dashboard?cycleId=${cycle.id}`).set(auth(tokens.employee)).expect(200);
      assert.equal(dashboard.body.kind, 'EMPLOYEE');
      assert.equal(dashboard.body.currentBsc.id, approved.id);
      assert.equal(dashboard.body.currentBsc.officialScore, '95');
      const report = await request(server).get('/bsc-reports?limit=100').set(auth(tokens.employee)).expect(200);
      assert.deepEqual(report.body.items.map((row: { employeeId: string }) => row.employeeId), [employee.id]);
      const emptyDashboard = await request(server).get(`/bsc-reports/dashboard?cycleId=${cycle.id}`).set(auth(tokens.employeeWithoutBsc)).expect(200);
      assert.equal(emptyDashboard.body.currentBsc, null);
      assert.deepEqual(emptyDashboard.body.actions.map((action: { code: string }) => action.code), ['CREATE_BSC']);
    });

    await t.test('manager report enforces scope and backend filters', async () => {
      const report = await request(server).get(`/bsc-reports?cycleId=${cycle.id}&departmentId=${department.id}&planStatus=APPROVED&evaluationStatus=APPROVED&finalGrade=A&search=${marker}_EMPLOYEE&sortBy=final_score&sortOrder=desc`).set(auth(tokens.manager)).expect(200);
      assert.equal(report.body.total, 1);
      assert.equal(report.body.items[0].id, approved.id);
      const crossDepartment = await request(server).get(`/bsc-reports?departmentId=${outsideDepartment.id}`).set(auth(tokens.manager)).expect(200);
      assert.deepEqual(crossDepartment.body.items.map((row: { id: string }) => row.id), [crossDepartmentBsc.id]);
      const unrelated = await request(server).get(`/bsc-reports?departmentId=${unrelatedDepartment.id}`).set(auth(tokens.manager)).expect(403);
      assert.equal(unrelated.body.code, 'AUTH_SCOPE_DENIED');
      const outsideView = await request(server).get('/bsc-reports').set(auth(tokens.outsideManager)).expect(200);
      assert.deepEqual(outsideView.body.items.map((row: { employeeId: string }) => row.employeeId).sort(), [outsideEmployee.id, crossDepartmentEmployee.id].sort());
    });

    await t.test('summary uses only persisted approved final score and grade', async () => {
      const summary = await request(server).get(`/bsc-reports/summary?cycleId=${cycle.id}`).set(auth(tokens.manager)).expect(200);
      assert.equal(summary.body.totalBsc, 4);
      assert.equal(summary.body.approvedAverageScore, '95');
      assert.deepEqual(summary.body.gradeDistribution, { C: 0, B: 0, A: 1, 'A+': 0, 'A++': 0 });
      assert.equal(summary.body.evaluationStatusCounts.DRAFT, 1);
      assert.equal(summary.body.evaluationStatusCounts.APPROVED, 1);
      assert.equal(summary.body.pendingPlanReviews, 1);
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
