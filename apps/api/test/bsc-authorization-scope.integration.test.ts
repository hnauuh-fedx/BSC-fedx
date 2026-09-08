import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/main';
import { BSC_PERMISSIONS } from '../src/modules/employee-bsc/policies/bsc-access.policy';
import { BSC_REPORT_PERMISSIONS } from '../src/modules/reports/reports.constants';
import { backfillTransferredEmployeeBsc } from '../prisma/seed';

const prisma = new PrismaClient();
const marker = `BSCAUTH_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`.toUpperCase();
const password = 'BscAuth!Test#1';
const tracked = { users: [] as string[], roles: [] as string[], permissions: [] as string[] };

function safeDatabase(): boolean {
  try { return decodeURIComponent(new URL(process.env.TEST_DATABASE_URL ?? '').pathname.slice(1)).toLowerCase() === 'bsc_organization_test'; }
  catch { return false; }
}

async function cleanup() {
  if (tracked.users.length) await prisma.audit_logs.deleteMany({ where: { user_id: { in: tracked.users } } });
  await prisma.employee_bsc.deleteMany({ where: { bsc_code: { startsWith: marker } } });
  await prisma.bsc_cycles.deleteMany({ where: { code: { startsWith: marker } } });
  if (tracked.users.length) {
    await prisma.auth_refresh_tokens.deleteMany({ where: { user_id: { in: tracked.users } } });
    await prisma.department_manager_assignments.deleteMany({ where: { OR: [{ manager_id: { in: tracked.users } }, { assigned_by: { in: tracked.users } }] } });
    await prisma.manager_relationships.deleteMany({ where: { OR: [{ employee_id: { in: tracked.users } }, { manager_id: { in: tracked.users } }] } });
    await prisma.user_roles.deleteMany({ where: { OR: [{ user_id: { in: tracked.users } }, { assigned_by: { in: tracked.users } }] } });
    await prisma.users.deleteMany({ where: { id: { in: tracked.users } } });
  }
  if (tracked.roles.length) {
    await prisma.role_permissions.deleteMany({ where: { role_id: { in: tracked.roles } } });
    await prisma.roles.deleteMany({ where: { id: { in: tracked.roles } } });
  }
  for (const id of tracked.permissions) {
    if (await prisma.role_permissions.count({ where: { permission_id: id } }) === 0) await prisma.permissions.deleteMany({ where: { id } });
  }
  await prisma.departments.deleteMany({ where: { code: { startsWith: marker } } });
  await prisma.positions.deleteMany({ where: { code: { startsWith: marker } } });
}

test('Phase 3D.1 BSC authorization, DIRECTOR flow and scope isolation', { skip: safeDatabase() ? false : 'TEST_DATABASE_URL is not configured with exact bsc_organization_test' }, async (t) => {
  let app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
  try {
    await cleanup();
    const [departmentA, departmentB, position] = await Promise.all([
      prisma.departments.create({ data: { code: `${marker}_A`, name: `${marker} Department A` } }),
      prisma.departments.create({ data: { code: `${marker}_B`, name: `${marker} Department B` } }),
      prisma.positions.create({ data: { code: `${marker}_POS`, name: `${marker} Position`, level: 1 } }),
    ]);
    const permissionCodes = [...new Set([...Object.values(BSC_PERMISSIONS), ...Object.values(BSC_REPORT_PERMISSIONS), 'user.update'])];
    for (const code of permissionCodes) {
      const existing = await prisma.permissions.findUnique({ where: { code } });
      const permission = await prisma.permissions.upsert({ where: { code }, create: { code, name: code, module: 'bsc' }, update: {} });
      if (!existing) tracked.permissions.push(permission.id);
    }
    const role = async (name: string, permissions: string[]) => {
      const created = await prisma.roles.create({ data: { code: `${marker}_${name}`, name, hierarchy_level: 1, is_system: false, status: 'ACTIVE' } });
      tracked.roles.push(created.id);
      const rows = await prisma.permissions.findMany({ where: { code: { in: permissions } }, select: { id: true } });
      await prisma.role_permissions.createMany({ data: rows.map(({ id }) => ({ role_id: created.id, permission_id: id })) });
      return created;
    };
    const employeeRole = await role('EMPLOYEE', [BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.DUPLICATE_OWN,
      BSC_PERMISSIONS.REQUEST_REOPEN, BSC_PERMISSIONS.SUBMIT_PLAN_OWN, BSC_PERMISSIONS.SUBMIT_EVALUATION_OWN]);
    const managerRole = await role('MANAGER', [BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE,
      BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE, BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE,
      BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.VIEW_VERSION, BSC_PERMISSIONS.REVIEW_REOPEN,
      BSC_REPORT_PERMISSIONS.UNIT]);
    const canonicalManagerRole = await prisma.roles.findUniqueOrThrow({ where: { code: 'MANAGER' } });
    const managerPermissionRows = await prisma.permissions.findMany({ where: { code: { in: [
      BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE,
      BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE,
      BSC_PERMISSIONS.REVIEW_REOPEN, BSC_PERMISSIONS.RESET_APPROVED,
    ] } }, select: { id: true } });
    await prisma.role_permissions.createMany({ data: managerPermissionRows.map(({ id }) => ({
      role_id: canonicalManagerRole.id, permission_id: id,
    })), skipDuplicates: true });
    const directorRole = await prisma.roles.findUniqueOrThrow({ where: { code: 'DIRECTOR' } });
    await prisma.permissions.upsert({
      where: { code: 'bsc.review.override' },
      create: { code: 'bsc.review.override', name: 'bsc.review.override', module: 'bsc' },
      update: {},
    });
    const directorPermissionRows = await prisma.permissions.findMany({ where: { code: { in: [
      BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE,
      BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE,
      BSC_PERMISSIONS.REVIEW_REOPEN, BSC_PERMISSIONS.RESET_APPROVED, BSC_PERMISSIONS.REVIEW_OVERRIDE,
    ] } }, select: { id: true } });
    await prisma.role_permissions.createMany({
      data: directorPermissionRows.map(({ id }) => ({ role_id: directorRole.id, permission_id: id })),
      skipDuplicates: true,
    });
    const adminRole = await role('ADMIN', ['user.update']);
    const selfApprovalRole = await role('ADMIN_SELF_BSC', [BSC_PERMISSIONS.VIEW_UNIT, BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE]);
    const unrelatedGlobalRole = await role('UNRELATED_GLOBAL', []);
    const hash = await argon2.hash(password);
    const user = async (name: string, departmentId: string, roleId: string, scope: 'SELF' | 'DEPARTMENT' | 'GLOBAL', managerId?: string | null) => {
      const created = await prisma.users.create({ data: { employee_code: `${marker}_${name}`, username: String(`${marker}_${name}`).toLowerCase(), full_name: `${marker} ${name}`,
        email: `${marker.toLowerCase()}_${name.toLowerCase()}@example.test`, password_hash: hash, department_id: departmentId,
        position_id: position.id, direct_manager_id: managerId ?? null } });
      tracked.users.push(created.id);
      await prisma.user_roles.create({ data: { user_id: created.id, role_id: roleId, scope_type: scope,
        scope_id: scope === 'DEPARTMENT' ? departmentId : null } });
      return created;
    };
    const directorA = await user('DIRECTOR_A', departmentA.id, directorRole.id, 'GLOBAL');
    const directorB = await user('DIRECTOR_B', departmentB.id, directorRole.id, 'DEPARTMENT');
    const managerA = await user('MANAGER_A', departmentA.id, managerRole.id, 'DEPARTMENT', directorA.id);
    const managerA2 = await user('MANAGER_A2', departmentA.id, managerRole.id, 'DEPARTMENT', directorA.id);
    const managerB = await user('MANAGER_B', departmentB.id, managerRole.id, 'DEPARTMENT', directorB.id);
    const managerViewOnly = await user('MANAGER_VIEW_ONLY', departmentA.id, canonicalManagerRole.id, 'GLOBAL', directorA.id);
    await prisma.user_roles.create({ data: { user_id: managerViewOnly.id, role_id: managerRole.id, scope_type: 'GLOBAL' } });
    const employeeA = await user('EMPLOYEE_A', departmentA.id, employeeRole.id, 'SELF', managerA.id);
    const employeeA2 = await user('EMPLOYEE_A2', departmentA.id, employeeRole.id, 'SELF', managerA.id);
    const employeeB = await user('EMPLOYEE_B', departmentB.id, employeeRole.id, 'SELF', managerB.id);
    const employeeB2 = await user('EMPLOYEE_B2', departmentB.id, employeeRole.id, 'SELF', managerB.id);
    const employeeViewOnly = await user('EMPLOYEE_VIEW_ONLY', departmentA.id, employeeRole.id, 'SELF', managerViewOnly.id);
    const employeeViewOnlyOtherDepartment = await user('EMP_VIEW_OTHER', departmentB.id, employeeRole.id, 'SELF', managerViewOnly.id);
    const routedManager = await user('ROUTED_MANAGER', departmentA.id, canonicalManagerRole.id, 'DEPARTMENT', directorA.id);
    const managerBscOwner = await user('MANAGER_BSC_OWNER', departmentA.id, canonicalManagerRole.id, 'DEPARTMENT', directorA.id);
    const managerEvalOwner = await user('MANAGER_EVAL_OWNER', departmentA.id, canonicalManagerRole.id, 'DEPARTMENT', directorA.id);
    const handoverManager = await user('HANDOVER_MANAGER', departmentA.id, canonicalManagerRole.id, 'DEPARTMENT', directorA.id);
    const routedEmployee = await user('ROUTED_EMPLOYEE', departmentA.id, employeeRole.id, 'SELF', routedManager.id);
    const overrideEmployee = await user('OVERRIDE_EMPLOYEE', departmentA.id, employeeRole.id, 'SELF', routedManager.id);
    const legacyRoutedEmployee = await user('LEGACY_EMP', departmentA.id, employeeRole.id, 'SELF', routedManager.id);
    const handoverEmployee = await user('HANDOVER_EMPLOYEE', departmentA.id, employeeRole.id, 'SELF', routedManager.id);
    const admin = await user('ADMIN', departmentA.id, adminRole.id, 'GLOBAL');
    const adminSelf = await user('ADMIN_SELF', departmentA.id, selfApprovalRole.id, 'SELF');
    await prisma.user_roles.create({ data: { user_id: adminSelf.id, role_id: unrelatedGlobalRole.id, scope_type: 'GLOBAL' } });
    const relationship = async (employeeId: string, managerId: string, start: string, end?: string) => prisma.manager_relationships.create({ data: {
      employee_id: employeeId, manager_id: managerId, start_date: new Date(start), end_date: end ? new Date(end) : null, is_primary: true,
    } });
    await relationship(managerA.id, directorA.id, '2020-01-01');
    await relationship(managerB.id, directorB.id, '2020-01-01');
    await relationship(managerViewOnly.id, directorA.id, '2020-01-01');
    const employeeARelationship = await relationship(employeeA.id, managerA.id, '2020-01-01');
    await relationship(employeeA2.id, managerA.id, '2020-01-01');
    await relationship(employeeB.id, managerB.id, '2020-01-01');
    await relationship(employeeB2.id, managerB.id, '2020-01-01');
    await relationship(employeeViewOnly.id, managerViewOnly.id, '2020-01-01');
    await relationship(employeeViewOnlyOtherDepartment.id, managerViewOnly.id, '2020-01-01');
    await relationship(routedEmployee.id, routedManager.id, '2020-01-01');
    await relationship(overrideEmployee.id, routedManager.id, '2020-01-01');
    await relationship(managerBscOwner.id, directorA.id, '2020-01-01');
    await relationship(managerEvalOwner.id, directorA.id, '2020-01-01');
    await relationship(legacyRoutedEmployee.id, routedManager.id, '2020-01-01');
    await relationship(handoverEmployee.id, routedManager.id, '2020-01-01');
    await prisma.department_manager_assignments.create({ data: {
      department_id: departmentA.id, manager_id: routedManager.id, start_date: new Date('2020-01-01'),
      is_primary: true, assigned_by: admin.id,
    } });
    await prisma.employee_bsc_approval_routes.createMany({ data: [
      { department_id: departmentA.id, stage: 'PLAN', reviewer_type: 'DEPARTMENT_MANAGER' },
      { department_id: departmentA.id, stage: 'EVALUATION', reviewer_type: 'DEPARTMENT_MANAGER' },
    ] });
    const cycle = await prisma.bsc_cycles.create({ data: { code: `${marker}_CYCLE`, name: marker, cycle_type: 'MONTH', year: 2099, month: 1,
      start_date: new Date('2020-01-01'), end_date: new Date('2199-12-31'), submission_deadline: new Date('2199-12-31'), status: 'OPEN', created_by: admin.id } });
    let sequence = 0;
    const bsc = async (owner: typeof employeeA, reviewerId: string, plan = 'SUBMITTED', evaluation = 'NOT_STARTED') => {
      sequence += 1;
      const created = await prisma.employee_bsc.create({ data: { bsc_code: `${marker}_BSC_${sequence}`, cycle_id: cycle.id, employee_id: owner.id,
        department_id: owner.department_id, position_id: position.id, direct_manager_id: reviewerId, created_by: owner.id,
        plan_status: plan, evaluation_status: evaluation } });
      await prisma.employee_bsc_items.create({ data: { employee_bsc_id: created.id, kpi_code: `${marker.slice(0, 35)}_${sequence}`,
        kpi_name: 'Authorization KPI', target_value: 100, actual_value: evaluation === 'SUBMITTED' ? 100 : null, weight: 100,
        calculation_method: 'ACTUAL_DIV_TARGET', assigned_by: reviewerId } });
      if (plan === 'SUBMITTED') await prisma.bsc_approval_steps.create({ data: {
        employee_bsc_id: created.id, stage: 'PLAN', step_order: 1, approver_id: directorA.id, approver_role: 'DIRECTOR', status: 'PENDING',
      } });
      if (evaluation === 'SUBMITTED') await prisma.bsc_approval_steps.create({ data: {
        employee_bsc_id: created.id, stage: 'EVALUATION', step_order: 1, approver_id: directorA.id, approver_role: 'DIRECTOR', status: 'PENDING',
      } });
      return created;
    };
    const employeeABsc = await bsc(employeeA, managerA.id);
    const employeeBBsc = await bsc(employeeB, managerB.id);
    const managerABsc = await bsc(managerBscOwner, directorA.id);
    const managerBBsc = await bsc(managerB, directorB.id);
    const directorABsc = await bsc(directorA, directorA.id);
    const approvedEmployeeBBsc = await bsc(employeeB2, managerB.id, 'APPROVED', 'APPROVED');
    const directorOverridePlanBsc = await bsc(overrideEmployee, routedManager.id);
    const legacyRoutedEvaluationBsc = await bsc(legacyRoutedEmployee, routedManager.id, 'APPROVED', 'SUBMITTED');
    const employeeViewOnlyBsc = await bsc(employeeViewOnly, managerViewOnly.id);
    const employeeViewOnlyOtherDepartmentBsc = await bsc(employeeViewOnlyOtherDepartment, managerViewOnly.id);
    const approvedEmployeeBPlanVersion = await prisma.bsc_versions.create({ data: { employee_bsc_id: approvedEmployeeBBsc.id, version_number: 1, stage: 'PLAN', version_type: 'PLAN_APPROVED', snapshot: {}, created_by: managerB.id } });
    const directorReopenRequest = await prisma.bsc_unlock_requests.create({ data: { employee_bsc_id: approvedEmployeeBBsc.id, stage: 'PLAN', requested_by: employeeB2.id,
      reviewer_id: directorA.id, request_reason: 'System-wide director review', status: 'PENDING', source_version_id: approvedEmployeeBPlanVersion.id } });

    const created = await createApp(); app = created.app; await app.init(); const server = app.getHttpServer();
    const login = async (username: string) => (await request(server).post('/auth/login').send({ username, password }).expect(200)).body.accessToken as string;
    const tokens = { directorA: await login(directorA.username), managerA: await login(managerA.username), managerA2: await login(managerA2.username), managerViewOnly: await login(managerViewOnly.username), employeeA: await login(employeeA.username), employeeA2: await login(employeeA2.username),
      admin: await login(admin.username), adminSelf: await login(adminSelf.username),
      routedManager: await login(routedManager.username), routedEmployee: await login(routedEmployee.username),
      legacyRoutedEmployee: await login(legacyRoutedEmployee.username),
      handoverManager: await login(handoverManager.username),
      handoverEmployee: await login(handoverEmployee.username) };
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    await t.test('permission and scope are bound to the same active assignment', async () => {
      await request(server).get(`/employee-bsc/${employeeABsc.id}`).set(auth(tokens.admin)).expect(403);
      await request(server).get(`/employee-bsc/${employeeABsc.id}`).set(auth(tokens.adminSelf)).expect(403);
      await request(server).post(`/employee-bsc/${employeeABsc.id}/plan/approve`).set(auth(tokens.adminSelf)).send({}).expect(403);
    });

    await t.test('canonical MANAGER can view only the assigned employee BSC and cannot review it', async () => {
      const list = await request(server).get('/employee-bsc?limit=100').set(auth(tokens.managerViewOnly)).expect(200);
      assert.deepEqual(list.body.items.map((row: { id: string }) => row.id), [employeeViewOnlyBsc.id]);
      await request(server).get(`/employee-bsc/${employeeViewOnlyBsc.id}`).set(auth(tokens.managerViewOnly)).expect(200);
      await request(server).get(`/employee-bsc/${employeeViewOnlyOtherDepartmentBsc.id}`).set(auth(tokens.managerViewOnly)).expect(403);
      await request(server).get(`/employee-bsc/${employeeBBsc.id}`).set(auth(tokens.managerViewOnly)).expect(403);
      await request(server).get('/employee-bsc/pending-review?stage=PLAN&limit=100').set(auth(tokens.managerViewOnly)).expect(403);
      await request(server).get('/employee-bsc/pending-review?stage=EVALUATION&limit=100').set(auth(tokens.managerViewOnly)).expect(403);
      await request(server).get('/employee-bsc/reopen-requests/pending?limit=100').set(auth(tokens.managerViewOnly)).expect(403);
      await request(server).post(`/employee-bsc/${employeeViewOnlyBsc.id}/plan/approve`).set(auth(tokens.managerViewOnly)).send({}).expect(403);
      await request(server).post(`/employee-bsc/${employeeViewOnlyBsc.id}/plan/return`).set(auth(tokens.managerViewOnly)).send({ reason: 'Không hợp lệ' }).expect(403);
      await request(server).post(`/employee-bsc/${employeeViewOnlyBsc.id}/evaluation/approve`).set(auth(tokens.managerViewOnly)).send({}).expect(403);
      await request(server).post(`/employee-bsc/${employeeViewOnlyBsc.id}/evaluation/return`).set(auth(tokens.managerViewOnly)).send({ reason: 'Không hợp lệ' }).expect(403);
    });

    await t.test('manager list and object endpoints are isolated while review endpoints stay forbidden', async () => {
      const list = await request(server).get('/employee-bsc?limit=100').set(auth(tokens.managerA)).expect(200);
      assert.deepEqual(list.body.items.map((row: { id: string }) => row.id), [employeeABsc.id]);
      assert.equal(list.body.total, 1);
      const injected = await request(server).get(`/employee-bsc?employeeId=${employeeB.id}&limit=100`).set(auth(tokens.managerA)).expect(200);
      assert.equal(injected.body.total, 0);
      await request(server).get('/employee-bsc/pending-review?stage=PLAN&limit=100').set(auth(tokens.managerA)).expect(403);
      await request(server).get(`/employee-bsc/${employeeBBsc.id}`).set(auth(tokens.managerA)).expect(403);
      await request(server).get(`/employee-bsc/${employeeBBsc.id}/scoring-preview`).set(auth(tokens.managerA)).expect(403);
      await request(server).get(`/employee-bsc/${approvedEmployeeBBsc.id}/versions`).set(auth(tokens.managerA)).expect(403);
      await request(server).get(`/employee-bsc/${approvedEmployeeBBsc.id}/reopen-requests`).set(auth(tokens.managerA)).expect(403);
      await request(server).post(`/employee-bsc/${employeeBBsc.id}/plan/approve`).set(auth(tokens.managerA)).send({}).expect(403);
    });

    await t.test('expired and future manager relationships grant no access', async () => {
      await prisma.manager_relationships.update({ where: { id: employeeARelationship.id }, data: { end_date: new Date('2020-02-01') } });
      const expired = await request(server).get('/employee-bsc?limit=100').set(auth(tokens.managerA)).expect(200);
      assert.equal(expired.body.total, 0);
      await request(server).get(`/employee-bsc/${employeeABsc.id}`).set(auth(tokens.managerA)).expect(403);
      await prisma.manager_relationships.update({ where: { id: employeeARelationship.id }, data: { start_date: new Date('2199-01-01'), end_date: null } });
      await request(server).get('/employee-bsc/pending-review?stage=PLAN&limit=100').set(auth(tokens.managerA)).expect(403);
      await request(server).post(`/employee-bsc/${employeeABsc.id}/plan/approve`).set(auth(tokens.managerA)).send({}).expect(403);
      await prisma.manager_relationships.update({ where: { id: employeeARelationship.id }, data: { start_date: new Date('2020-01-01'), end_date: null } });
      await prisma.users.update({ where: { id: employeeA.id }, data: { status: 'INACTIVE' } });
      assert.equal((await request(server).get('/employee-bsc?limit=100').set(auth(tokens.managerA)).expect(200)).body.total, 0);
      await request(server).get(`/employee-bsc/${employeeABsc.id}`).set(auth(tokens.managerA)).expect(403);
      await prisma.users.update({ where: { id: employeeA.id }, data: { status: 'ACTIVE' } });
      await prisma.users.update({ where: { id: managerA.id }, data: { status: 'INACTIVE' } });
      await request(server).get('/employee-bsc?limit=100').set(auth(tokens.managerA)).expect(401);
      await prisma.users.update({ where: { id: managerA.id }, data: { status: 'ACTIVE' } });
    });

    await t.test('manager reassignment changes visibility but never transfers approval authority', async () => {
      await prisma.manager_relationships.update({ where: { id: employeeARelationship.id }, data: { end_date: new Date('2020-02-01') } });
      await prisma.users.update({ where: { id: employeeA.id }, data: { direct_manager_id: managerA2.id } });
      await relationship(employeeA.id, managerA2.id, '2020-01-01');
      assert.equal((await request(server).get('/employee-bsc?limit=100').set(auth(tokens.managerA)).expect(200)).body.total, 0);
      const visible = await request(server).get('/employee-bsc?limit=100').set(auth(tokens.managerA2)).expect(200);
      assert.deepEqual(visible.body.items.map((row: { id: string }) => row.id), [employeeABsc.id]);
      await request(server).get('/employee-bsc/pending-review?stage=PLAN&limit=100').set(auth(tokens.managerA2)).expect(403);
      await request(server).post(`/employee-bsc/${employeeABsc.id}/plan/approve`).set(auth(tokens.managerA2)).send({}).expect(403);
    });

    await t.test('DIRECTOR can approve and return PLAN and EVALUATION across visible Manager and Employee BSCs', async () => {
      const evaluationManagerBsc = await bsc(managerEvalOwner, directorA.id, 'APPROVED', 'SUBMITTED');
      const visible = await request(server).get('/employee-bsc?limit=100').set(auth(tokens.directorA)).expect(200);
      const visibleIds = new Set(visible.body.items.map((row: { id: string }) => row.id));
      assert.ok(visibleIds.has(managerABsc.id)); assert.ok(visibleIds.has(employeeABsc.id));
      await request(server).get(`/employee-bsc/${managerABsc.id}`).set(auth(tokens.directorA)).expect(200);
      await request(server).get(`/employee-bsc/${employeeABsc.id}`).set(auth(tokens.directorA)).expect(200);
      const pending = await request(server).get('/employee-bsc/pending-review?stage=PLAN&limit=100').set(auth(tokens.directorA)).expect(200);
      const pendingPlanIds = new Set(pending.body.items.map((row: { id: string }) => row.id));
      assert.ok(pendingPlanIds.has(managerABsc.id)); assert.ok(pendingPlanIds.has(employeeBBsc.id));
      assert.ok(!pendingPlanIds.has(directorABsc.id));
      await request(server).post(`/employee-bsc/${directorABsc.id}/plan/approve`).set(auth(tokens.directorA)).send({}).expect(403);
      const returnedPlan = await request(server).post(`/employee-bsc/${employeeBBsc.id}/plan/return`).set(auth(tokens.directorA)).send({ reason: 'Cần chỉnh sửa kế hoạch' }).expect(200);
      assert.equal(returnedPlan.body.plan_status, 'RETURNED');
      assert.equal(returnedPlan.body.direct_manager_id, managerB.id);
      const approved = await request(server).post(`/employee-bsc/${managerABsc.id}/plan/approve`).set(auth(tokens.directorA)).send({}).expect(200);
      assert.equal(approved.body.plan_status, 'APPROVED');
      assert.equal(approved.body.plan_approved_by, directorA.id);
      assert.equal(approved.body.direct_manager_id, directorA.id);

      const pendingEvaluation = await request(server).get('/employee-bsc/pending-review?stage=EVALUATION&limit=100').set(auth(tokens.directorA)).expect(200);
      const pendingEvaluationIds = new Set(pendingEvaluation.body.items.map((row: { id: string }) => row.id));
      assert.ok(pendingEvaluationIds.has(evaluationManagerBsc.id));
      const returnedEvaluation = await request(server).post(`/employee-bsc/${evaluationManagerBsc.id}/evaluation/return`).set(auth(tokens.directorA)).send({ reason: 'Cần bổ sung kết quả' }).expect(200);
      assert.equal(returnedEvaluation.body.evaluation_status, 'RETURNED');
      assert.equal(returnedEvaluation.body.direct_manager_id, directorA.id);
    });

    await t.test('DIRECTOR can review a reopen request assigned independently from the direct manager', async () => {
      const pending = await request(server).get('/employee-bsc/reopen-requests/pending?stage=PLAN&limit=100')
        .set(auth(tokens.directorA)).expect(200);
      assert.ok(pending.body.items.some((item: { id: string }) => item.id === directorReopenRequest.id));
      await request(server).get(`/employee-bsc/reopen-requests/${directorReopenRequest.id}`)
        .set(auth(tokens.directorA)).expect(200);
      const approved = await request(server).post(`/employee-bsc/reopen-requests/${directorReopenRequest.id}/approve`)
        .set(auth(tokens.directorA)).send({}).expect(200);
      assert.equal(approved.body.status, 'APPROVED');
      const reopened = await prisma.employee_bsc.findUniqueOrThrow({ where: { id: approvedEmployeeBBsc.id } });
      assert.equal(reopened.plan_status, 'REOPENED');
    });

    await t.test('configured department manager is primary while GLOBAL DIRECTOR can intervene and own BSC stays with DIRECTOR', async () => {
      const employeeRecord = await bsc(routedEmployee, routedManager.id, 'DRAFT', 'NOT_STARTED');
      const submittedPlan = await request(server).post(`/employee-bsc/${employeeRecord.id}/plan/submit`)
        .set(auth(tokens.routedEmployee)).send({}).expect(200);
      assert.equal(submittedPlan.plan_status ?? submittedPlan.body?.plan_status, 'SUBMITTED');
      const planStep = await prisma.bsc_approval_steps.findUniqueOrThrow({
        where: { employee_bsc_id_stage_step_order: { employee_bsc_id: employeeRecord.id, stage: 'PLAN', step_order: 1 } },
      });
      assert.equal(planStep.approver_id, routedManager.id);
      assert.equal(planStep.approver_role, 'MANAGER');
      await request(server).post(`/employee-bsc/${employeeRecord.id}/plan/approve`).set(auth(tokens.directorA)).send({}).expect(400);
      await request(server).post(`/employee-bsc/${employeeRecord.id}/plan/approve`).set(auth(tokens.routedManager)).send({}).expect(200);

      await prisma.employee_bsc_items.updateMany({ where: { employee_bsc_id: employeeRecord.id }, data: { actual_value: 100 } });
      await request(server).post(`/employee-bsc/${employeeRecord.id}/evaluation/submit`).set(auth(tokens.routedEmployee)).send({}).expect(200);
      const missingEvaluationReason = await request(server).post(`/employee-bsc/${employeeRecord.id}/evaluation/approve`)
        .set(auth(tokens.directorA)).send({}).expect(400);
      assert.equal(missingEvaluationReason.body.code, 'BSC_OVERRIDE_REASON_REQUIRED');
      await request(server).post(`/employee-bsc/${employeeRecord.id}/evaluation/approve`).set(auth(tokens.directorA))
        .send({ reason: 'Giám đốc duyệt thay kết quả trong thời gian Trưởng phòng vắng mặt' }).expect(200);
      const overriddenEvaluationStep = await prisma.bsc_approval_steps.findUniqueOrThrow({
        where: { employee_bsc_id_stage_step_order: { employee_bsc_id: employeeRecord.id, stage: 'EVALUATION', step_order: 1 } },
      });
      assert.equal(overriddenEvaluationStep.approver_id, routedManager.id);
      assert.equal(overriddenEvaluationStep.approver_role, 'MANAGER');
      assert.equal(overriddenEvaluationStep.acted_by, directorA.id);
      assert.equal(overriddenEvaluationStep.acted_as_role, 'DIRECTOR');
      assert.equal(overriddenEvaluationStep.decision_source, 'DIRECTOR_OVERRIDE');
      await request(server).post(`/employee-bsc/${employeeRecord.id}/evaluation/reset-approved`).set(auth(tokens.directorA))
        .send({ reason: 'Giám đốc mở lại để can thiệp kết quả' }).expect(200);
      assert.equal((await prisma.employee_bsc.findUniqueOrThrow({ where: { id: employeeRecord.id } })).evaluation_status, 'REOPENED');
      const overrideReset = await prisma.bsc_unlock_requests.findFirstOrThrow({
        where: { employee_bsc_id: employeeRecord.id, request_source: 'DIRECTOR_RESET', stage: 'EVALUATION' },
        orderBy: { requested_at: 'desc' },
      });
      assert.equal(overrideReset.decision_source, 'DIRECTOR_OVERRIDE');
      assert.equal(await prisma.bsc_status_histories.count({
        where: { employee_bsc_id: employeeRecord.id, action: 'RESET_EVALUATION_APPROVED_OVERRIDE' },
      }), 1);

      await request(server).post(`/employee-bsc/${employeeRecord.id}/evaluation/submit`).set(auth(tokens.routedEmployee)).send({}).expect(200);
      await request(server).post(`/employee-bsc/${employeeRecord.id}/evaluation/approve`).set(auth(tokens.routedManager)).send({}).expect(200);
      await request(server).post(`/employee-bsc/${employeeRecord.id}/plan/reset-approved`).set(auth(tokens.routedManager))
        .send({ reason: 'Điều chỉnh kế hoạch trong phạm vi phòng ban' }).expect(200);
      const resetPlan = await prisma.employee_bsc.findUniqueOrThrow({ where: { id: employeeRecord.id } });
      assert.equal(resetPlan.plan_status, 'REOPENED');
      assert.equal(resetPlan.evaluation_status, 'NOT_STARTED');

      await request(server).post(`/employee-bsc/${employeeRecord.id}/plan/submit`).set(auth(tokens.routedEmployee)).send({}).expect(200);
      const returned = await request(server).post(`/employee-bsc/${employeeRecord.id}/plan/return`).set(auth(tokens.routedManager))
        .send({ reason: 'Trưởng phòng yêu cầu chỉnh kế hoạch' }).expect(200);
      assert.equal(returned.body.plan_status, 'RETURNED');
      await request(server).post(`/employee-bsc/${employeeRecord.id}/plan/submit`).set(auth(tokens.routedEmployee)).send({}).expect(200);
      await request(server).post(`/employee-bsc/${employeeRecord.id}/plan/approve`).set(auth(tokens.routedManager)).send({}).expect(200);
      await prisma.employee_bsc_items.updateMany({ where: { employee_bsc_id: employeeRecord.id }, data: { actual_value: 100 } });
      await request(server).post(`/employee-bsc/${employeeRecord.id}/evaluation/submit`).set(auth(tokens.routedEmployee)).send({}).expect(200);
      await request(server).post(`/employee-bsc/${employeeRecord.id}/evaluation/approve`).set(auth(tokens.routedManager)).send({}).expect(200);

      // Simulate an approval made before department-manager routing was deployed.
      await prisma.bsc_approval_steps.update({
        where: { employee_bsc_id_stage_step_order: { employee_bsc_id: employeeRecord.id, stage: 'EVALUATION', step_order: 1 } },
        data: { approver_id: directorA.id, approver_role: 'DIRECTOR' },
      });

      const reopenRequest = await request(server).post(`/employee-bsc/${employeeRecord.id}/reopen-requests`)
        .set(auth(tokens.routedEmployee)).send({ stage: 'EVALUATION', reason: 'Cần cập nhật kết quả' }).expect(201);
      assert.equal(reopenRequest.body.reviewer_id, routedManager.id);
      const managerQueue = await request(server).get('/employee-bsc/reopen-requests/pending?stage=EVALUATION&limit=100')
        .set(auth(tokens.routedManager)).expect(200);
      assert.ok(managerQueue.body.items.some((item: { id: string }) => item.id === reopenRequest.body.id));
      await request(server).post(`/employee-bsc/reopen-requests/${reopenRequest.body.id}/reject`)
        .set(auth(tokens.routedManager)).send({ reason: 'Chưa đủ căn cứ' }).expect(200);
      const approvedRequest = await request(server).post(`/employee-bsc/${employeeRecord.id}/reopen-requests`)
        .set(auth(tokens.routedEmployee)).send({ stage: 'EVALUATION', reason: 'Đã bổ sung căn cứ' }).expect(201);
      const directorQueue = await request(server).get('/employee-bsc/reopen-requests/pending?stage=EVALUATION&limit=100')
        .set(auth(tokens.directorA)).expect(200);
      const queuedOverride = directorQueue.body.items.find((item: { id: string }) => item.id === approvedRequest.body.id);
      assert.equal(queuedOverride.review_decision_source, 'DIRECTOR_OVERRIDE');
      const missingReopenReason = await request(server).post(`/employee-bsc/reopen-requests/${approvedRequest.body.id}/approve`)
        .set(auth(tokens.directorA)).send({}).expect(400);
      assert.equal(missingReopenReason.body.code, 'BSC_OVERRIDE_REASON_REQUIRED');
      await request(server).post(`/employee-bsc/reopen-requests/${approvedRequest.body.id}/approve`)
        .set(auth(tokens.directorA)).send({ reason: 'Giám đốc duyệt mở lại thay Trưởng phòng' }).expect(200);
      const reviewedRequest = await prisma.bsc_unlock_requests.findUniqueOrThrow({ where: { id: approvedRequest.body.id } });
      assert.equal(reviewedRequest.reviewer_id, routedManager.id);
      assert.equal(reviewedRequest.reviewed_by, directorA.id);
      assert.equal(reviewedRequest.decision_source, 'DIRECTOR_OVERRIDE');
      assert.equal((await prisma.employee_bsc.findUniqueOrThrow({ where: { id: employeeRecord.id } })).evaluation_status, 'REOPENED');

      await request(server).post(`/employee-bsc/${approvedEmployeeBBsc.id}/plan/reset-approved`).set(auth(tokens.routedManager))
        .send({ reason: 'Ngoài phạm vi phòng ban' }).expect(403);

      const managerRecord = await bsc(routedManager, directorA.id, 'DRAFT', 'NOT_STARTED');
      await request(server).post(`/employee-bsc/${managerRecord.id}/plan/submit`).set(auth(tokens.routedManager)).send({}).expect(200);
      const managerPlanStep = await prisma.bsc_approval_steps.findUniqueOrThrow({
        where: { employee_bsc_id_stage_step_order: { employee_bsc_id: managerRecord.id, stage: 'PLAN', step_order: 1 } },
      });
      assert.equal(managerPlanStep.approver_id, null);
      assert.equal(managerPlanStep.approver_role, 'DIRECTOR');
      await request(server).post(`/employee-bsc/${managerRecord.id}/plan/approve`).set(auth(tokens.routedManager)).send({}).expect(403);
      await request(server).post(`/employee-bsc/${managerRecord.id}/plan/approve`).set(auth(tokens.directorA)).send({}).expect(200);
    });

    await t.test('configured department manager can return a legacy evaluation submitted to DIRECTOR', async () => {
      const detail = await request(server).get(`/employee-bsc/${legacyRoutedEvaluationBsc.id}`)
        .set(auth(tokens.routedManager)).expect(200);
      assert.equal(detail.body.review_capabilities.canApproveEvaluation, true);
      assert.equal(detail.body.review_capabilities.canReturnEvaluation, true);
      await request(server).post(`/employee-bsc/${legacyRoutedEvaluationBsc.id}/evaluation/return`)
        .set(auth(tokens.routedManager)).send({ reason: 'Bổ sung kết quả đánh giá' }).expect(200);
    });

    await t.test('GLOBAL DIRECTOR can override a department-manager PLAN with a required reason', async () => {
      const pending = await request(server).get('/employee-bsc/pending-review?stage=PLAN&limit=100')
        .set(auth(tokens.directorA)).expect(200);
      assert.ok(pending.body.items.some((item: { id: string }) => item.id === directorOverridePlanBsc.id));

      const detail = await request(server).get(`/employee-bsc/${directorOverridePlanBsc.id}`)
        .set(auth(tokens.directorA)).expect(200);
      assert.equal(detail.body.review_capabilities.canApprovePlan, true);
      assert.equal(detail.body.review_capabilities.planDecisionSource, 'DIRECTOR_OVERRIDE');

      const missingReason = await request(server).post(`/employee-bsc/${directorOverridePlanBsc.id}/plan/approve`)
        .set(auth(tokens.directorA)).send({}).expect(400);
      assert.equal(missingReason.body.code, 'BSC_OVERRIDE_REASON_REQUIRED');

      const approved = await request(server).post(`/employee-bsc/${directorOverridePlanBsc.id}/plan/approve`)
        .set(auth(tokens.directorA)).send({ reason: 'Phê duyệt thay do Trưởng phòng vắng mặt' }).expect(200);
      assert.equal(approved.body.plan_status, 'APPROVED');
      assert.equal(approved.body.plan_approved_by, directorA.id);
      const step = await prisma.bsc_approval_steps.findUniqueOrThrow({
        where: { employee_bsc_id_stage_step_order: { employee_bsc_id: directorOverridePlanBsc.id, stage: 'PLAN', step_order: 1 } },
      });
      assert.equal(step.approver_id, routedManager.id);
      assert.equal(step.approver_role, 'MANAGER');
      assert.equal(step.acted_by, directorA.id);
      assert.equal(step.acted_as_role, 'DIRECTOR');
      assert.equal(step.decision_source, 'DIRECTOR_OVERRIDE');
      const review = await prisma.bsc_reviews.findFirstOrThrow({
        where: { employee_bsc_id: directorOverridePlanBsc.id, stage: 'PLAN' }, orderBy: { reviewed_at: 'desc' },
      });
      assert.equal(review.reviewer_id, directorA.id);
      assert.equal(review.reviewer_role, 'DIRECTOR');
      assert.equal(review.decision_source, 'DIRECTOR_OVERRIDE');
    });

    await t.test('the current department head can take over a manager-routed pending submission', async () => {
      const pendingRecord = await bsc(handoverEmployee, routedManager.id, 'DRAFT', 'NOT_STARTED');
      await request(server).post(`/employee-bsc/${pendingRecord.id}/plan/submit`)
        .set(auth(tokens.handoverEmployee)).send({}).expect(200);

      await prisma.department_manager_assignments.updateMany({
        where: { department_id: departmentA.id, manager_id: routedManager.id, is_primary: true },
        data: { end_date: new Date('2026-09-06') },
      });
      await prisma.department_manager_assignments.create({ data: {
        department_id: departmentA.id, manager_id: handoverManager.id, start_date: new Date('2026-09-07'),
        is_primary: true, assigned_by: directorA.id,
      } });

      const queue = await request(server).get('/employee-bsc/pending-review?stage=PLAN&limit=100')
        .set(auth(tokens.handoverManager)).expect(200);
      assert.ok(queue.body.items.some((item: { id: string }) => item.id === pendingRecord.id));
      await request(server).post(`/employee-bsc/${pendingRecord.id}/plan/approve`)
        .set(auth(tokens.handoverManager)).send({}).expect(200);
      const step = await prisma.bsc_approval_steps.findUniqueOrThrow({
        where: { employee_bsc_id_stage_step_order: { employee_bsc_id: pendingRecord.id, stage: 'PLAN', step_order: 1 } },
      });
      assert.equal(step.approver_id, handoverManager.id);
      assert.equal(step.status, 'APPROVED');
    });

    await t.test('GLOBAL DIRECTOR can intervene when a configured department has no active head', async () => {
      await prisma.department_manager_assignments.updateMany({
        where: { department_id: departmentA.id, is_primary: true },
        data: { end_date: new Date('2026-09-07') },
      });

      const detail = await request(server).get(`/employee-bsc/${employeeABsc.id}`)
        .set(auth(tokens.directorA)).expect(200);
      assert.equal(detail.body.review_capabilities.canApprovePlan, true);
      assert.equal(detail.body.review_capabilities.planDecisionSource, 'DIRECTOR_OVERRIDE');

      const missingReason = await request(server).post(`/employee-bsc/${employeeABsc.id}/plan/approve`)
        .set(auth(tokens.directorA)).send({}).expect(400);
      assert.equal(missingReason.body.code, 'BSC_OVERRIDE_REASON_REQUIRED');
      await request(server).post(`/employee-bsc/${employeeABsc.id}/plan/approve`)
        .set(auth(tokens.directorA)).send({ reason: 'Giám đốc xử lý để hồ sơ không bị treo khi phòng ban đang khuyết Trưởng phòng' })
        .expect(200);
    });

    await t.test('a department transfer does not make an existing BSC inaccessible', async () => {
      await prisma.users.update({ where: { id: employeeA.id }, data: { department_id: departmentB.id } });
      await request(server).get(`/employee-bsc/${employeeABsc.id}`).set(auth(tokens.directorA)).expect(200);
      await prisma.users.update({ where: { id: employeeA.id }, data: { department_id: departmentA.id } });
    });

    await t.test('reports and aggregates exclude the other department', async () => {
      const report = await request(server).get('/bsc-reports?limit=100').set(auth(tokens.managerA)).expect(200);
      assert.ok(report.body.items.every((row: { departmentId: string }) => row.departmentId === departmentA.id));
      assert.equal(report.body.total, report.body.items.length);
      const summary = await request(server).get('/bsc-reports/summary').set(auth(tokens.managerA)).expect(200);
      assert.equal(summary.body.totalBsc, report.body.total);
      await request(server).get(`/bsc-reports?departmentId=${departmentB.id}`).set(auth(tokens.managerA)).expect(403);
    });

    await t.test('transferring an employee moves open-cycle BSC ownership and pending review to the new department', async () => {
      await prisma.department_manager_assignments.updateMany({
        where: { department_id: departmentA.id, manager_id: routedManager.id, is_primary: true },
        data: { end_date: null },
      });
      const transferRoute = await prisma.employee_bsc_approval_routes.findUniqueOrThrow({
        where: { department_id_stage: { department_id: departmentA.id, stage: 'PLAN' } },
      });
      assert.equal(transferRoute.reviewer_type, 'DEPARTMENT_MANAGER');
      assert.equal(await prisma.user_roles.count({ where: { user_id: employeeB.id, roles: { code: 'MANAGER' } } }), 0);
      const closedCycle = await prisma.bsc_cycles.create({ data: {
        code: `${marker}_CLOSED_TRANSFER`, name: `${marker} Closed transfer`, cycle_type: 'MONTH', year: 2098, month: 12,
        start_date: new Date('2098-12-01'), end_date: new Date('2098-12-31'), status: 'CLOSED', created_by: admin.id,
      } });
      const historicalBsc = await prisma.employee_bsc.create({ data: {
        bsc_code: `${marker}_BSC_CLOSED_TRANSFER`, cycle_id: closedCycle.id, employee_id: employeeB.id,
        department_id: departmentB.id, position_id: position.id, direct_manager_id: managerB.id, created_by: employeeB.id,
        plan_status: 'APPROVED', evaluation_status: 'APPROVED', status: 'APPROVED', locked_at: new Date(),
      } });
      await prisma.employee_bsc.update({ where: { id: employeeBBsc.id }, data: { plan_status: 'SUBMITTED' } });
      await prisma.bsc_approval_steps.update({ where: {
        employee_bsc_id_stage_step_order: { employee_bsc_id: employeeBBsc.id, stage: 'PLAN', step_order: 1 },
      }, data: { status: 'PENDING', comment: null, acted_at: null, acted_by: null, acted_as_role: null } });

      const missingReason = await request(server).patch(`/users/${employeeB.id}`).set(auth(tokens.admin)).send({
        departmentId: departmentA.id,
        directManagerId: routedManager.id,
      }).expect(400);
      assert.equal(missingReason.body.code, 'USER_TRANSFER_REASON_REQUIRED');
      assert.equal((await prisma.users.findUniqueOrThrow({ where: { id: employeeB.id } })).department_id, departmentB.id);

      await request(server).patch(`/users/${employeeB.id}`).set(auth(tokens.admin)).send({
        departmentId: departmentA.id,
        directManagerId: routedManager.id,
        transferReason: 'Điều chuyển nhân sự sang Marketing',
      }).expect(200);

      const [openBsc, closedBsc, pendingStep] = await Promise.all([
        prisma.employee_bsc.findUniqueOrThrow({ where: { id: employeeBBsc.id } }),
        prisma.employee_bsc.findUniqueOrThrow({ where: { id: historicalBsc.id } }),
        prisma.bsc_approval_steps.findUniqueOrThrow({ where: {
          employee_bsc_id_stage_step_order: { employee_bsc_id: employeeBBsc.id, stage: 'PLAN', step_order: 1 },
        } }),
      ]);
      assert.equal(openBsc.department_id, departmentA.id);
      assert.equal(openBsc.direct_manager_id, routedManager.id);
      assert.equal(pendingStep.approver_id, routedManager.id);
      assert.equal(pendingStep.approver_role, 'MANAGER');
      assert.equal(closedBsc.department_id, departmentB.id);
      assert.equal(closedBsc.direct_manager_id, managerB.id);

      const visible = await request(server).get('/employee-bsc?limit=100').set(auth(tokens.routedManager)).expect(200);
      assert.ok(visible.body.items.some((item: { id: string }) => item.id === employeeBBsc.id));
      assert.ok(await prisma.audit_logs.count({ where: { entity_id: employeeBBsc.id, action: 'BSC_ORGANIZATION_TRANSFERRED' } }));
    });

    await t.test('release backfill reconciles two transferred employees once', async () => {
      const first = await user('BACKFILL_FIRST', departmentB.id, employeeRole.id, 'SELF', managerB.id);
      const second = await user('BACKFILL_SECOND', departmentB.id, employeeRole.id, 'SELF', managerB.id);
      await relationship(first.id, managerB.id, '2020-01-01');
      await relationship(second.id, managerB.id, '2020-01-01');
      const firstBsc = await bsc(first, managerB.id, 'SUBMITTED', 'NOT_STARTED');
      const secondBsc = await bsc(second, managerB.id, 'APPROVED', 'APPROVED');
      const secondVersion = await prisma.bsc_versions.create({ data: {
        employee_bsc_id: secondBsc.id, version_number: 1, stage: 'EVALUATION',
        version_type: 'EVALUATION_APPROVED', snapshot: {}, created_by: managerB.id,
      } });
      const secondReopen = await prisma.bsc_unlock_requests.create({ data: {
        employee_bsc_id: secondBsc.id, stage: 'EVALUATION', requested_by: second.id,
        reviewer_id: directorA.id, request_reason: 'Cần cập nhật kết quả', status: 'PENDING', source_version_id: secondVersion.id,
      } });
      await prisma.users.updateMany({
        where: { id: { in: [first.id, second.id] } },
        data: { department_id: departmentA.id, direct_manager_id: routedManager.id },
      });
      await prisma.manager_relationships.updateMany({
        where: { employee_id: { in: [first.id, second.id] }, is_primary: true, end_date: null },
        data: { end_date: new Date() },
      });
      await prisma.manager_relationships.createMany({ data: [
        { employee_id: first.id, manager_id: routedManager.id, start_date: new Date(), is_primary: true },
        { employee_id: second.id, manager_id: routedManager.id, start_date: new Date(), is_primary: true },
      ] });

      const dryRun = await backfillTransferredEmployeeBsc(prisma, `${first.id}, ${second.id}`, 'DRY_RUN');
      assert.equal(dryRun.candidateBscCount, 2);
      assert.equal(dryRun.transferredBscCount, 0);
      assert.equal((await prisma.employee_bsc.findUniqueOrThrow({ where: { id: firstBsc.id } })).department_id, departmentB.id);
      assert.equal(await prisma.audit_logs.count({ where: {
        entity_id: { in: [firstBsc.id, secondBsc.id] }, action: 'BSC_ORGANIZATION_TRANSFERRED',
      } }), 0);

      const firstRun = await backfillTransferredEmployeeBsc(prisma, `${first.id}, ${second.id}`, 'APPLY');
      assert.deepEqual(firstRun.transferredEmployeeIds.sort(), [first.id, second.id].sort());
      assert.equal(firstRun.transferredBscCount, 2);
      const transferred = await prisma.employee_bsc.findMany({ where: { id: { in: [firstBsc.id, secondBsc.id] } } });
      assert.ok(transferred.every((item) => item.department_id === departmentA.id && item.direct_manager_id === routedManager.id));
      const firstStep = await prisma.bsc_approval_steps.findUniqueOrThrow({ where: {
        employee_bsc_id_stage_step_order: { employee_bsc_id: firstBsc.id, stage: 'PLAN', step_order: 1 },
      } });
      assert.equal(firstStep.approver_id, routedManager.id);
      assert.equal((await prisma.bsc_unlock_requests.findUniqueOrThrow({ where: { id: secondReopen.id } })).reviewer_id, routedManager.id);
      const auditCount = await prisma.audit_logs.count({ where: {
        entity_id: { in: [firstBsc.id, secondBsc.id] }, action: 'BSC_ORGANIZATION_TRANSFERRED',
      } });

      const secondRun = await backfillTransferredEmployeeBsc(prisma, `${first.id},${second.id}`);
      assert.equal(secondRun.transferredBscCount, 0);
      assert.equal(await prisma.audit_logs.count({ where: {
        entity_id: { in: [firstBsc.id, secondBsc.id] }, action: 'BSC_ORGANIZATION_TRANSFERRED',
      } }), auditCount);
    });

    await t.test('owner-only duplicate cannot use an out-of-scope source id', async () => {
      await request(server).get(`/employee-bsc/${approvedEmployeeBBsc.id}/duplicate-options`).set(auth(tokens.employeeA)).expect(403);
    });
  } finally {
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  }
});
