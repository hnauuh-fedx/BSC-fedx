import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/main';
import { BSC_PERMISSIONS } from '../src/modules/employee-bsc/policies/bsc-access.policy';
import { BSC_REPORT_PERMISSIONS } from '../src/modules/reports/reports.constants';

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
    const permissionCodes = [...new Set([...Object.values(BSC_PERMISSIONS), ...Object.values(BSC_REPORT_PERMISSIONS)])];
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
    const employeeRole = await role('EMPLOYEE', [BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.DUPLICATE_OWN, BSC_PERMISSIONS.REQUEST_REOPEN]);
    const managerRole = await role('MANAGER', [BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE,
      BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE, BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE,
      BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.VIEW_VERSION, BSC_PERMISSIONS.REVIEW_REOPEN,
      BSC_REPORT_PERMISSIONS.UNIT]);
    const directorRole = await role('DIRECTOR', [BSC_PERMISSIONS.VIEW_UNIT, BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE,
      BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE, BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE,
      BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.VIEW_VERSION]);
    const adminRole = await role('ADMIN', []);
    const selfApprovalRole = await role('ADMIN_SELF_BSC', [BSC_PERMISSIONS.VIEW_UNIT, BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE]);
    const unrelatedGlobalRole = await role('UNRELATED_GLOBAL', []);
    const hash = await argon2.hash(password);
    const user = async (name: string, departmentId: string, roleId: string, scope: 'SELF' | 'DEPARTMENT' | 'GLOBAL', managerId?: string | null) => {
      const created = await prisma.users.create({ data: { employee_code: `${marker}_${name}`, full_name: `${marker} ${name}`,
        email: `${marker.toLowerCase()}_${name.toLowerCase()}@example.test`, password_hash: hash, department_id: departmentId,
        position_id: position.id, direct_manager_id: managerId ?? null } });
      tracked.users.push(created.id);
      await prisma.user_roles.create({ data: { user_id: created.id, role_id: roleId, scope_type: scope,
        scope_id: scope === 'DEPARTMENT' ? departmentId : null } });
      return created;
    };
    const directorA = await user('DIRECTOR_A', departmentA.id, directorRole.id, 'DEPARTMENT');
    const directorB = await user('DIRECTOR_B', departmentB.id, directorRole.id, 'DEPARTMENT');
    const managerA = await user('MANAGER_A', departmentA.id, managerRole.id, 'DEPARTMENT', directorA.id);
    const managerA2 = await user('MANAGER_A2', departmentA.id, managerRole.id, 'DEPARTMENT', directorA.id);
    const managerB = await user('MANAGER_B', departmentB.id, managerRole.id, 'DEPARTMENT', directorB.id);
    const employeeA = await user('EMPLOYEE_A', departmentA.id, employeeRole.id, 'SELF', managerA.id);
    const employeeB = await user('EMPLOYEE_B', departmentB.id, employeeRole.id, 'SELF', managerB.id);
    const employeeB2 = await user('EMPLOYEE_B2', departmentB.id, employeeRole.id, 'SELF', managerB.id);
    const admin = await user('ADMIN', departmentA.id, adminRole.id, 'GLOBAL');
    const adminSelf = await user('ADMIN_SELF', departmentA.id, selfApprovalRole.id, 'SELF');
    await prisma.user_roles.create({ data: { user_id: adminSelf.id, role_id: unrelatedGlobalRole.id, scope_type: 'GLOBAL' } });
    const relationship = async (employeeId: string, managerId: string, start: string, end?: string) => prisma.manager_relationships.create({ data: {
      employee_id: employeeId, manager_id: managerId, start_date: new Date(start), end_date: end ? new Date(end) : null, is_primary: true,
    } });
    await relationship(managerA.id, directorA.id, '2020-01-01');
    await relationship(managerB.id, directorB.id, '2020-01-01');
    const employeeARelationship = await relationship(employeeA.id, managerA.id, '2020-01-01');
    await relationship(employeeB.id, managerB.id, '2020-01-01');
    await relationship(employeeB2.id, managerB.id, '2020-01-01');
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
        employee_bsc_id: created.id, stage: 'PLAN', step_order: 1, approver_id: reviewerId, approver_role: 'MANAGER', status: 'PENDING',
      } });
      return created;
    };
    const employeeABsc = await bsc(employeeA, managerA.id);
    const employeeBBsc = await bsc(employeeB, managerB.id);
    const managerABsc = await bsc(managerA, directorA.id);
    const managerBBsc = await bsc(managerB, directorB.id);
    const directorABsc = await bsc(directorA, directorA.id);
    const approvedEmployeeBBsc = await bsc(employeeB2, managerB.id, 'APPROVED', 'APPROVED');
    await prisma.bsc_versions.create({ data: { employee_bsc_id: approvedEmployeeBBsc.id, version_number: 1, stage: 'PLAN', version_type: 'PLAN_APPROVED', snapshot: {}, created_by: managerB.id } });
    await prisma.bsc_unlock_requests.create({ data: { employee_bsc_id: approvedEmployeeBBsc.id, stage: 'PLAN', requested_by: employeeB2.id,
      reviewer_id: managerB.id, request_reason: 'Outside scope', status: 'PENDING' } });

    const created = await createApp(); app = created.app; await app.init(); const server = app.getHttpServer();
    const login = async (email: string) => (await request(server).post('/auth/login').send({ email, password }).expect(200)).body.accessToken as string;
    const tokens = { directorA: await login(directorA.email), managerA: await login(managerA.email), managerA2: await login(managerA2.email), employeeA: await login(employeeA.email),
      admin: await login(admin.email), adminSelf: await login(adminSelf.email) };
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    await t.test('permission and scope are bound to the same active assignment', async () => {
      await request(server).get(`/employee-bsc/${employeeABsc.id}`).set(auth(tokens.admin)).expect(403);
      await request(server).get(`/employee-bsc/${employeeABsc.id}`).set(auth(tokens.adminSelf)).expect(403);
      await request(server).post(`/employee-bsc/${employeeABsc.id}/plan/approve`).set(auth(tokens.adminSelf)).send({}).expect(403);
    });

    await t.test('manager list, total, pending review and object endpoints are isolated', async () => {
      const list = await request(server).get('/employee-bsc?limit=100').set(auth(tokens.managerA)).expect(200);
      assert.deepEqual(list.body.items.map((row: { id: string }) => row.id), [employeeABsc.id]);
      assert.equal(list.body.total, 1);
      const injected = await request(server).get(`/employee-bsc?employeeId=${employeeB.id}&limit=100`).set(auth(tokens.managerA)).expect(200);
      assert.equal(injected.body.total, 0);
      const pending = await request(server).get('/employee-bsc/pending-review?stage=PLAN&limit=100').set(auth(tokens.managerA)).expect(200);
      assert.deepEqual(pending.body.items.map((row: { id: string }) => row.id), [employeeABsc.id]);
      assert.equal(pending.body.total, 1);
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
      const future = await request(server).get('/employee-bsc/pending-review?stage=PLAN&limit=100').set(auth(tokens.managerA)).expect(200);
      assert.equal(future.body.total, 0);
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

    await t.test('manager reassignment moves pending work to the new active manager', async () => {
      await prisma.manager_relationships.update({ where: { id: employeeARelationship.id }, data: { end_date: new Date('2020-02-01') } });
      await prisma.users.update({ where: { id: employeeA.id }, data: { direct_manager_id: managerA2.id } });
      await relationship(employeeA.id, managerA2.id, '2020-01-01');
      assert.equal((await request(server).get('/employee-bsc/pending-review?stage=PLAN&limit=100').set(auth(tokens.managerA))).body.total, 0);
      const pending = await request(server).get('/employee-bsc/pending-review?stage=PLAN&limit=100').set(auth(tokens.managerA2)).expect(200);
      assert.deepEqual(pending.body.items.map((row: { id: string }) => row.id), [employeeABsc.id]);
      await request(server).post(`/employee-bsc/${employeeABsc.id}/plan/approve`).set(auth(tokens.managerA2)).send({}).expect(200);
    });

    await t.test('DIRECTOR reviews MANAGER in scope only and never self-approves or bypasses an employee manager', async () => {
      await request(server).post(`/employee-bsc/${managerBBsc.id}/plan/approve`).set(auth(tokens.directorA)).send({}).expect(403);
      await request(server).post(`/employee-bsc/${directorABsc.id}/plan/approve`).set(auth(tokens.directorA)).send({}).expect(403);
      await request(server).post(`/employee-bsc/${employeeBBsc.id}/plan/approve`).set(auth(tokens.directorA)).send({}).expect(403);
      const approved = await request(server).post(`/employee-bsc/${managerABsc.id}/plan/approve`).set(auth(tokens.directorA)).send({}).expect(200);
      assert.equal(approved.body.plan_status, 'APPROVED');
      assert.equal(approved.body.plan_approved_by, directorA.id);
    });

    await t.test('reports and aggregates exclude the other department', async () => {
      const report = await request(server).get('/bsc-reports?limit=100').set(auth(tokens.managerA)).expect(200);
      assert.ok(report.body.items.every((row: { departmentId: string }) => row.departmentId === departmentA.id));
      assert.equal(report.body.total, report.body.items.length);
      const summary = await request(server).get('/bsc-reports/summary').set(auth(tokens.managerA)).expect(200);
      assert.equal(summary.body.totalBsc, report.body.total);
      await request(server).get(`/bsc-reports?departmentId=${departmentB.id}`).set(auth(tokens.managerA)).expect(403);
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
