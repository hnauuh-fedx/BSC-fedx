import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/main';
import { BSC_PERMISSIONS } from '../src/modules/employee-bsc/policies/bsc-access.policy';

const prisma = new PrismaClient();
const marker = `BSCDUAL_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`.toUpperCase();
const password = 'BscDual!Test#1';
const ids = {
  users: [] as string[], roles: [] as string[], permissions: [] as string[],
  rolePermissions: [] as Array<{ role_id: string; permission_id: string }>,
  departments: [] as string[], positions: [] as string[], cycles: [] as string[], bscs: [] as string[],
};
let httpAssertions = 0;

function safeDatabase(): boolean {
  try { return decodeURIComponent(new URL(process.env.TEST_DATABASE_URL ?? '').pathname.slice(1)).toLowerCase() === 'bsc_organization_test'; }
  catch { return false; }
}

async function cleanup() {
  if (ids.users.length) await prisma.audit_logs.deleteMany({ where: { user_id: { in: ids.users } } });
  await prisma.employee_bsc.deleteMany({ where: { bsc_code: { startsWith: marker } } });
  await prisma.bsc_cycles.deleteMany({ where: { code: { startsWith: marker } } });
  if (ids.users.length) {
    await prisma.auth_refresh_tokens.deleteMany({ where: { user_id: { in: ids.users } } });
    await prisma.manager_relationships.deleteMany({ where: { OR: [{ employee_id: { in: ids.users } }, { manager_id: { in: ids.users } }] } });
    await prisma.user_roles.deleteMany({ where: { OR: [{ user_id: { in: ids.users } }, { assigned_by: { in: ids.users } }] } });
    await prisma.users.deleteMany({ where: { id: { in: ids.users } } });
  }
  if (ids.roles.length) {
    await prisma.role_permissions.deleteMany({ where: { role_id: { in: ids.roles } } });
    await prisma.roles.deleteMany({ where: { id: { in: ids.roles } } });
  }
  for (const pair of ids.rolePermissions) await prisma.role_permissions.deleteMany({ where: pair });
  for (const id of ids.permissions) {
    if (await prisma.role_permissions.count({ where: { permission_id: id } }) === 0) await prisma.permissions.deleteMany({ where: { id } });
  }
  await prisma.departments.deleteMany({ where: { code: { startsWith: marker } } });
  await prisma.positions.deleteMany({ where: { code: { startsWith: marker } } });
}

async function assertClean() {
  assert.deepEqual({
    users: await prisma.users.count({ where: { employee_code: { startsWith: marker } } }),
    roles: await prisma.roles.count({ where: { code: { startsWith: marker } } }),
    departments: await prisma.departments.count({ where: { code: { startsWith: marker } } }),
    positions: await prisma.positions.count({ where: { code: { startsWith: marker } } }),
    cycles: await prisma.bsc_cycles.count({ where: { code: { startsWith: marker } } }),
    bscs: await prisma.employee_bsc.count({ where: { bsc_code: { startsWith: marker } } }),
    permissions: await prisma.permissions.count({ where: { id: { in: ids.permissions } } }),
  }, { users: 0, roles: 0, departments: 0, positions: 0, cycles: 0, bscs: 0, permissions: 0 });
}

test('Phase 3B.3 dual-stage BSC workflow integration', { skip: safeDatabase() ? false : 'TEST_DATABASE_URL is not configured with exact bsc_organization_test' }, async (t) => {
  const database = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  assert.equal(database[0].current_database.toLowerCase(), 'bsc_organization_test');
  let app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
  try {
    await cleanup();
    const department = await prisma.departments.create({ data: { code: `${marker}_DEPT`, name: `${marker} Department` } });
    const otherDepartment = await prisma.departments.create({ data: { code: `${marker}_OTHER_DEPT`, name: `${marker} Other Department` } });
    const position = await prisma.positions.create({ data: { code: `${marker}_POS`, name: `${marker} Position`, level: 1 } });
    ids.departments.push(department.id, otherDepartment.id); ids.positions.push(position.id);
    for (const code of Object.values(BSC_PERMISSIONS)) {
      const existing = await prisma.permissions.findUnique({ where: { code } });
      const permission = await prisma.permissions.upsert({ where: { code }, create: { code, name: code, module: 'bsc' }, update: {} });
      if (!existing) ids.permissions.push(permission.id);
    }
    const role = async (name: string, permissions: string[]) => {
      const result = await prisma.roles.create({ data: { code: `${marker}_${name}`, name, hierarchy_level: 1, is_system: false, status: 'ACTIVE' } });
      ids.roles.push(result.id);
      const rows = await prisma.permissions.findMany({ where: { code: { in: permissions } }, select: { id: true } });
      await prisma.role_permissions.createMany({ data: rows.map(row => ({ role_id: result.id, permission_id: row.id })) });
      return result;
    };
    const employeeRole = await role('EMPLOYEE', [BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.EDIT_OWN, BSC_PERMISSIONS.UPDATE_ACTUAL, BSC_PERMISSIONS.SUBMIT_PLAN_OWN, BSC_PERMISSIONS.SUBMIT_EVALUATION_OWN, BSC_PERMISSIONS.VIEW_PLAN_HISTORY, BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY]);
    const reviewerRole = await role('MANAGER', [BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.MANAGE_KPI, BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE, BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.VIEW_PLAN_HISTORY, BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY]);
    const managerOwnerRole = await role('MANAGER_OWNER', [BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.EDIT_OWN, BSC_PERMISSIONS.UPDATE_ACTUAL, BSC_PERMISSIONS.SUBMIT_PLAN_OWN, BSC_PERMISSIONS.SUBMIT_EVALUATION_OWN, BSC_PERMISSIONS.VIEW_PLAN_HISTORY, BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY]);
    const adminRole = await role('ADMIN', [BSC_PERMISSIONS.VIEW_UNIT]);
    const hash = await argon2.hash(password);
    const user = async (name: string, roleId: string, scope: 'SELF'|'DEPARTMENT'|'GLOBAL', departmentId: string, managerId?: string) => {
      const result = await prisma.users.create({ data: { employee_code: `${marker}_${name}`, username: String(`${marker}_${name}`).toLowerCase(), full_name: `${marker} ${name}`, email: `${marker.toLowerCase()}_${name.toLowerCase()}@example.test`, password_hash: hash, department_id: departmentId, position_id: position.id, direct_manager_id: managerId } });
      ids.users.push(result.id); await prisma.user_roles.create({ data: { user_id: result.id, role_id: roleId, scope_type: scope, scope_id: scope === 'DEPARTMENT' ? departmentId : null } }); return result;
    };
    const admin = await user('ADMIN', adminRole.id, 'GLOBAL', department.id);
    const manager = await user('MANAGER', reviewerRole.id, 'DEPARTMENT', department.id, admin.id);
    const otherManager = await user('OTHER_MANAGER', reviewerRole.id, 'DEPARTMENT', otherDepartment.id, admin.id);
    const employee = await user('EMPLOYEE', employeeRole.id, 'SELF', department.id, manager.id);
    const employee2 = await user('EMPLOYEE2', employeeRole.id, 'SELF', department.id, manager.id);
    const employeeNoManager = await user('EMPLOYEE_NO_MANAGER', employeeRole.id, 'SELF', department.id);
    let directorRole = await prisma.roles.findUnique({ where: { code: 'DIRECTOR' } });
    const createdDirectorRole = !directorRole;
    if (!directorRole) {
      directorRole = await prisma.roles.create({ data: { code: 'DIRECTOR', name: 'Director', hierarchy_level: 2, is_system: true, status: 'ACTIVE' } });
      ids.roles.push(directorRole.id);
    }
    const directorPermissionIds = await prisma.permissions.findMany({ where: { code: { in: [BSC_PERMISSIONS.VIEW_UNIT, BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE, BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.VIEW_PLAN_HISTORY, BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY] } }, select: { id: true } });
    for (const permission of directorPermissionIds) {
      const pair = { role_id: directorRole.id, permission_id: permission.id };
      const existing = await prisma.role_permissions.findUnique({ where: { role_id_permission_id: pair } });
      await prisma.role_permissions.upsert({ where: { role_id_permission_id: pair }, create: pair, update: {} });
      if (!createdDirectorRole && !existing) ids.rolePermissions.push(pair);
    }
    const director = await user('DIRECTOR', directorRole.id, 'GLOBAL', department.id, admin.id);
    const managerOwner = await user('MANAGER_OWNER', managerOwnerRole.id, 'SELF', department.id, director.id);
    await prisma.manager_relationships.createMany({ data: [
      { employee_id: employee.id, manager_id: manager.id, start_date: new Date('2020-01-01'), is_primary: true },
      { employee_id: employee2.id, manager_id: manager.id, start_date: new Date('2020-01-01'), is_primary: true },
      { employee_id: managerOwner.id, manager_id: director.id, start_date: new Date('2020-01-01'), is_primary: true },
    ] });
    let counter = 0;
    const bsc = async (name: string, owner = employee, actual: number | null = null) => {
      counter += 1;
      const cycle = await prisma.bsc_cycles.create({ data: { code: `${marker}_C${counter}`, name: `${marker} Cycle ${counter}`, cycle_type: 'MONTH', year: 2099, month: counter, start_date: new Date('2099-01-01'), end_date: new Date('2099-12-31'), submission_deadline: new Date('2099-12-31T23:59:59Z'), status: 'OPEN', created_by: admin.id } });
      ids.cycles.push(cycle.id);
      const result = await prisma.employee_bsc.create({ data: { bsc_code: `${marker}_${name}`, cycle_id: cycle.id, employee_id: owner.id, department_id: owner.department_id, position_id: position.id, direct_manager_id: owner.direct_manager_id!, created_by: owner.id } });
      ids.bscs.push(result.id);
      const item = await prisma.employee_bsc_items.create({ data: { employee_bsc_id: result.id, kpi_code: `${marker.slice(0, 35)}_${counter}`, kpi_name: 'KPI hợp lệ', target_value: 100, actual_value: actual, weight: 100, calculation_method: 'ACTUAL_DIV_TARGET', assigned_by: manager.id } });
      return { ...result, item, cycle };
    };
    const created = await createApp(); app = created.app; await app.init(); const server = app.getHttpServer();
    const login = async (username: string) => (await request(server).post('/auth/login').send({ username, password }).expect(200)).body.accessToken as string;
    const tokens = { admin: await login(admin.username), manager: await login(manager.username), otherManager: await login(otherManager.username), employee: await login(employee.username), employee2: await login(employee2.username), employeeNoManager: await login(employeeNoManager.username), director: await login(director.username), managerOwner: await login(managerOwner.username) };
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const expectHttp = async (call: any, status: number) => { httpAssertions += 1; return call.expect(status); };

    await t.test('plan submit does not require actual and plan approval opens only evaluation fields', async () => {
      const record = await bsc('PLAN_NO_ACTUAL');
      const submitted = await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/submit`).set(auth(tokens.employee)).send({}), 200);
      assert.equal(submitted.body.plan_status, 'SUBMITTED'); assert.equal(submitted.body.evaluation_status, 'NOT_STARTED'); assert.equal(submitted.body.final_score, null);
      await expectHttp(request(server).patch(`/employee-bsc/${record.id}/items/${record.item.id}/actual`).set(auth(tokens.employee)).send({ actualValue: 80 }), 403);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/approve`).set(auth(tokens.admin)).send({}), 403);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/approve`).set(auth(tokens.otherManager)).send({}), 403);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/approve`).set(auth(tokens.manager)).send({}), 403);
      const approved = await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/approve`).set(auth(tokens.director)).send({}), 200);
      assert.equal(approved.body.plan_status, 'APPROVED'); assert.equal(approved.body.evaluation_status, 'DRAFT'); assert.equal(approved.body.final_grade, null);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/approve`).set(auth(tokens.director)).send({}), 409);
      await expectHttp(request(server).patch(`/employee-bsc/${record.id}/items/${record.item.id}`).set(auth(tokens.manager)).send({ targetValue: 90 }), 403);
      await expectHttp(request(server).patch(`/employee-bsc/${record.id}/items/${record.item.id}/actual`).set(auth(tokens.employee)).send({ actualValue: 95, employeeNote: 'TM KQTH fixture' }), 200);
      const histories = await prisma.bsc_status_histories.findMany({ where: { employee_bsc_id: record.id } });
      assert.deepEqual(histories.map(row => row.stage), ['PLAN', 'PLAN']);
    });

    await t.test('employee without a direct manager still submits to the global DIRECTOR', async () => {
      const record = await bsc('NO_MANAGER', employeeNoManager);
      assert.equal(record.direct_manager_id, null);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/submit`).set(auth(tokens.employeeNoManager)).send({}), 200);
      const step = await prisma.bsc_approval_steps.findFirstOrThrow({ where: { employee_bsc_id: record.id, stage: 'PLAN', status: 'PENDING' } });
      assert.equal(step.approver_id, director.id);
      assert.equal(step.approver_role, 'DIRECTOR');
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/approve`).set(auth(tokens.director)).send({}), 200);
    });

    await t.test('evaluation return opens only result fields and approval persists official score', async () => {
      const record = await bsc('EVALUATION', employee, 90);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/submit`).set(auth(tokens.employee)).send({}), 200);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/approve`).set(auth(tokens.director)).send({}), 200);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/evaluation/submit`).set(auth(tokens.employee)).send({ score: 999 }), 400);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/evaluation/submit`).set(auth(tokens.employee)).send({}), 200);
      const missingReason = await expectHttp(request(server).post(`/employee-bsc/${record.id}/evaluation/return`).set(auth(tokens.director)).send({ reason: ' ' }), 400);
      assert.ok(['VALIDATION_ERROR', 'BSC_EVALUATION_RETURN_REASON_REQUIRED'].includes(missingReason.body.code));
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/evaluation/return`).set(auth(tokens.director)).send({ reason: 'Bổ sung TM KQTH' }), 200);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/evaluation/return`).set(auth(tokens.director)).send({ reason: 'Lặp lại' }), 409);
      await expectHttp(request(server).patch(`/employee-bsc/${record.id}/items/${record.item.id}`).set(auth(tokens.manager)).send({ weight: 99 }), 403);
      await expectHttp(request(server).patch(`/employee-bsc/${record.id}/items/${record.item.id}/actual`).set(auth(tokens.employee)).send({ actualValue: 92, employeeNote: 'Đã bổ sung' }), 200);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/evaluation/submit`).set(auth(tokens.employee)).send({}), 200);
      const approved = await expectHttp(request(server).post(`/employee-bsc/${record.id}/evaluation/approve`).set(auth(tokens.director)).send({}), 200);
      assert.equal(approved.body.evaluation_status, 'APPROVED'); assert.equal(Number(approved.body.final_score), 90); assert.equal(approved.body.final_grade, 'A'); assert.equal(approved.body.evaluation_approved_by, director.id);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/evaluation/approve`).set(auth(tokens.director)).send({}), 409);
      await expectHttp(request(server).patch(`/employee-bsc/${record.id}/items/${record.item.id}/actual`).set(auth(tokens.employee)).send({ actualValue: 100 }), 403);
      const reasons = await prisma.bsc_status_histories.findMany({ where: { employee_bsc_id: record.id, comment: { not: null } } });
      assert.deepEqual(reasons.map(row => [row.stage, row.comment]), [['EVALUATION', 'Bổ sung TM KQTH']]);
    });

    await t.test('conditional transitions allow one winner without duplicate side effects', async () => {
      const planRace = await bsc('PLAN_RACE', employee2);
      const submits = await Promise.all([0, 1].map(() => request(server).post(`/employee-bsc/${planRace.id}/plan/submit`).set(auth(tokens.employee2)).send({})));
      httpAssertions += 2; assert.deepEqual(submits.map(row => row.status).sort(), [200, 409]);
      assert.equal(await prisma.bsc_status_histories.count({ where: { employee_bsc_id: planRace.id, stage: 'PLAN', action: 'SUBMIT_PLAN' } }), 1);
      const reviews = await Promise.all([
        request(server).post(`/employee-bsc/${planRace.id}/plan/approve`).set(auth(tokens.director)).send({}),
        request(server).post(`/employee-bsc/${planRace.id}/plan/return`).set(auth(tokens.director)).send({ reason: 'Race' }),
      ]);
      httpAssertions += 2; assert.deepEqual(reviews.map(row => row.status).sort(), [200, 409]);
      assert.equal(await prisma.bsc_reviews.count({ where: { employee_bsc_id: planRace.id, stage: 'PLAN' } }), 1);
    });

    await t.test('evaluation concurrency has one submit and one final review winner', async () => {
      const record = await bsc('EVALUATION_RACE', employee2, 100);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/submit`).set(auth(tokens.employee2)).send({}), 200);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/approve`).set(auth(tokens.director)).send({}), 200);
      const submits = await Promise.all([0, 1].map(() => request(server).post(`/employee-bsc/${record.id}/evaluation/submit`).set(auth(tokens.employee2)).send({})));
      httpAssertions += 2; assert.deepEqual(submits.map(row => row.status).sort(), [200, 409]);
      assert.equal(await prisma.bsc_status_histories.count({ where: { employee_bsc_id: record.id, stage: 'EVALUATION', action: 'SUBMIT_EVALUATION' } }), 1);
      const decisions = await Promise.all([
        request(server).post(`/employee-bsc/${record.id}/evaluation/approve`).set(auth(tokens.director)).send({}),
        request(server).post(`/employee-bsc/${record.id}/evaluation/return`).set(auth(tokens.director)).send({ reason: 'Race result' }),
      ]);
      httpAssertions += 2; assert.deepEqual(decisions.map(row => row.status).sort(), [200, 409]);
      assert.equal(await prisma.bsc_reviews.count({ where: { employee_bsc_id: record.id, stage: 'EVALUATION' } }), 1);
      assert.equal(await prisma.audit_logs.count({ where: { entity_id: record.id, action: { in: ['BSC_EVALUATION_APPROVED', 'BSC_EVALUATION_RETURNED'] } } }), 1);
    });

    await t.test('stage validation rejects invalid plan weight and incomplete evaluation', async () => {
      const invalidPlan = await bsc('INVALID_PLAN');
      await prisma.employee_bsc_items.update({ where: { id: invalidPlan.item.id }, data: { weight: 99 } });
      const planResponse = await expectHttp(request(server).post(`/employee-bsc/${invalidPlan.id}/plan/submit`).set(auth(tokens.employee)).send({}), 400);
      assert.equal(planResponse.body.code, 'BSC_PLAN_TOTAL_WEIGHT_NOT_100');
      const missingActual = await bsc('MISSING_ACTUAL');
      await expectHttp(request(server).post(`/employee-bsc/${missingActual.id}/plan/submit`).set(auth(tokens.employee)).send({}), 200);
      await expectHttp(request(server).post(`/employee-bsc/${missingActual.id}/plan/approve`).set(auth(tokens.director)).send({}), 200);
      const evaluationResponse = await expectHttp(request(server).post(`/employee-bsc/${missingActual.id}/evaluation/submit`).set(auth(tokens.employee)).send({}), 400);
      assert.equal(evaluationResponse.body.code, 'BSC_EVALUATION_ACTUAL_REQUIRED');
    });

    await t.test('a manager-owned BSC uses the DIRECTOR as reviewer in both stages', async () => {
      const record = await bsc('MANAGER_TO_DIRECTOR', managerOwner, 100);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/submit`).set(auth(tokens.managerOwner)).send({}), 200);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/approve`).set(auth(tokens.director)).send({}), 200);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/evaluation/submit`).set(auth(tokens.managerOwner)).send({}), 200);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/evaluation/approve`).set(auth(tokens.director)).send({}), 200);
      const steps = await prisma.bsc_approval_steps.findMany({ where: { employee_bsc_id: record.id }, orderBy: { stage: 'asc' } });
      assert.equal(steps.length, 2); assert.ok(steps.every(step => step.approver_id === director.id && step.approver_role === 'DIRECTOR'));
    });

    await t.test('pending review is stage-filtered, scoped, searchable and paginated', async () => {
      const planPending = await bsc('PENDING_PLAN');
      const evaluationPending = await bsc('PENDING_EVAL', employee2, 100);
      await expectHttp(request(server).post(`/employee-bsc/${planPending.id}/plan/submit`).set(auth(tokens.employee)).send({}), 200);
      await expectHttp(request(server).post(`/employee-bsc/${evaluationPending.id}/plan/submit`).set(auth(tokens.employee2)).send({}), 200);
      await expectHttp(request(server).post(`/employee-bsc/${evaluationPending.id}/plan/approve`).set(auth(tokens.director)).send({}), 200);
      await expectHttp(request(server).post(`/employee-bsc/${evaluationPending.id}/evaluation/submit`).set(auth(tokens.employee2)).send({}), 200);
      const plan = await expectHttp(request(server).get(`/employee-bsc/pending-review?stage=PLAN&search=PENDING&page=1&limit=1&sortBy=plan_submitted_at&sortOrder=asc`).set(auth(tokens.director)), 200);
      const evaluation = await expectHttp(request(server).get(`/employee-bsc/pending-review?stage=EVALUATION&search=PENDING&page=1&limit=1&sortBy=evaluation_submitted_at&sortOrder=asc`).set(auth(tokens.director)), 200);
      assert.deepEqual(plan.body.items.map((row: any) => row.id), [planPending.id]);
      assert.deepEqual(evaluation.body.items.map((row: any) => row.id), [evaluationPending.id]);
      await expectHttp(request(server).get('/employee-bsc/pending-review?stage=PLAN').set(auth(tokens.otherManager)), 403);
    });

    await t.test('history/audit are stage-aware, public history is private and payloads are secret-free', async () => {
      const record = await bsc('AUDIT');
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/submit`).set(auth(tokens.employee)).set('User-Agent', 'BSCDUAL-Test').send({}), 200);
      const detail = await expectHttp(request(server).get(`/employee-bsc/${record.id}`).set(auth(tokens.employee)), 200);
      assert.equal(detail.body.bsc_status_histories[0].stage, 'PLAN'); assert.equal('ip_address' in detail.body.bsc_status_histories[0], false); assert.equal('user_agent' in detail.body.bsc_status_histories[0], false);
      const withoutHistoryPermission = await expectHttp(request(server).get(`/employee-bsc/${record.id}`).set(auth(tokens.admin)), 200);
      assert.deepEqual(withoutHistoryPermission.body.bsc_status_histories, []);
      const audit = await prisma.audit_logs.findMany({ where: { entity_id: record.id } });
      assert.doesNotMatch(JSON.stringify(audit), /authorization|cookie|access.?token|refresh.?token|password|credential|database_url/i);
      assert.ok(httpAssertions >= 25, `Expected at least 25 HTTP assertions, received ${httpAssertions}`);
    });
  } finally {
    if (app) await app.close();
    await cleanup();
    await assertClean();
    await prisma.$disconnect();
  }
});
