import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/main';
import { BSC_PERMISSIONS } from '../src/modules/employee-bsc/policies/bsc-access.policy';

const prisma = new PrismaClient();
const marker = `BSCCYCLE_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 6)}`.toUpperCase();
const password = 'Cycle!Test#1';
const tracked = { users: [] as string[], roles: [] as string[], permissions: [] as string[] };

function safeDatabase(): boolean {
  try { return decodeURIComponent(new URL(process.env.TEST_DATABASE_URL ?? '').pathname.slice(1)).toLowerCase() === 'bsc_organization_test'; }
  catch { return false; }
}

async function cleanup() {
  if (tracked.users.length) await prisma.audit_logs.deleteMany({ where: { user_id: { in: tracked.users } } });
  await prisma.employee_bsc.deleteMany({ where: { OR: [
    { bsc_code: { startsWith: marker } },
    ...(tracked.users.length ? [{ employee_id: { in: tracked.users } }] : []),
  ] } });
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
  for (const id of tracked.permissions) if (await prisma.role_permissions.count({ where: { permission_id: id } }) === 0) await prisma.permissions.deleteMany({ where: { id } });
  await prisma.departments.deleteMany({ where: { code: { startsWith: marker } } });
  await prisma.positions.deleteMany({ where: { code: { startsWith: marker } } });
}

const iso = (date: string, time: string) => new Date(`${date}T${time}+07:00`).toISOString();
const day = (offset: number) => {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  vn.setUTCDate(vn.getUTCDate() + offset);
  return vn.toISOString().slice(0, 10);
};
const cyclePayload = (code: string) => ({
  code, name: `Kỳ ${code}`, cycleType: 'MONTH', year: Number(day(0).slice(0, 4)), month: Number(day(0).slice(5, 7)),
  startDate: day(-2), endDate: day(30),
  evaluationSubmissionDeadline: iso(day(20), '12:00:00'),
});

test('Phase 3D.2 BSC cycle administration and workflow enforcement', { skip: safeDatabase() ? false : 'TEST_DATABASE_URL must target exact bsc_organization_test' }, async (t) => {
  let app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
  try {
    await cleanup();
    const department = await prisma.departments.create({ data: { code: `${marker}_DEP`, name: marker } });
    const position = await prisma.positions.create({ data: { code: `${marker}_POS`, name: marker, level: 1 } });
    const managerPermissions = ['bsc.period.view', 'bsc.period.manage', BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.MANAGE_KPI,
      BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE,
      BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE];
    const employeePermissions = [BSC_PERMISSIONS.CREATE_OWN, BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.EDIT_OWN,
      BSC_PERMISSIONS.SUBMIT_PLAN_OWN, BSC_PERMISSIONS.UPDATE_ACTUAL, BSC_PERMISSIONS.SUBMIT_EVALUATION_OWN,
      BSC_PERMISSIONS.DUPLICATE_OWN];
    const permissionCodes = [...managerPermissions, ...employeePermissions];
    for (const code of permissionCodes) {
      const existing = await prisma.permissions.findUnique({ where: { code } });
      const permission = await prisma.permissions.upsert({ where: { code }, create: { code, name: code, module: 'bsc' }, update: {} });
      if (!existing) tracked.permissions.push(permission.id);
    }
    const makeRole = async (name: string, permissions: string[]) => {
      const role = await prisma.roles.create({ data: { code: `${marker}_${name}`, name, hierarchy_level: 1, is_system: false, status: 'ACTIVE' } });
      tracked.roles.push(role.id);
      const rows = await prisma.permissions.findMany({ where: { code: { in: permissions } }, select: { id: true } });
      await prisma.role_permissions.createMany({ data: rows.map(row => ({ role_id: role.id, permission_id: row.id })) });
      return role;
    };
    const managerRole = await makeRole('CYCLE_MANAGER', managerPermissions);
    const viewerRole = await makeRole('CYCLE_VIEWER', ['bsc.period.view']);
    const scopedManagerRole = await makeRole('SCOPED_MANAGER', ['bsc.period.manage']);
    const employeeRole = await makeRole('EMPLOYEE', employeePermissions);
    const noPermissionRole = await makeRole('ADMIN_NO_IMPLICIT', []);
    const hash = await argon2.hash(password);
    const makeUser = async (name: string, roleId: string, scope: 'GLOBAL'|'DEPARTMENT'|'SELF', managerId?: string) => {
      const user = await prisma.users.create({ data: { employee_code: `${marker}_${name}`, full_name: name,
        email: `${marker.toLowerCase()}_${name.toLowerCase()}@example.test`, password_hash: hash, department_id: department.id,
        position_id: position.id, direct_manager_id: managerId } });
      tracked.users.push(user.id);
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: roleId, scope_type: scope, scope_id: scope === 'DEPARTMENT' ? department.id : null } });
      return user;
    };
    const manager = await makeUser('MANAGER', managerRole.id, 'GLOBAL');
    const viewer = await makeUser('VIEWER', viewerRole.id, 'GLOBAL');
    const scoped = await makeUser('SCOPED', scopedManagerRole.id, 'DEPARTMENT');
    const noPermission = await makeUser('ADMIN', noPermissionRole.id, 'GLOBAL');
    const employee = await makeUser('EMPLOYEE', employeeRole.id, 'SELF', manager.id);
    await prisma.manager_relationships.create({ data: { employee_id: employee.id, manager_id: manager.id, start_date: new Date('2020-01-01'), is_primary: true } });

    const createdApp = await createApp(); app = createdApp.app; await app.init(); const server = app.getHttpServer();
    const login = async (email: string) => (await request(server).post('/auth/login').send({ email, password }).expect(200)).body.accessToken as string;
    const tokens = { manager: await login(manager.email), viewer: await login(viewer.email), scoped: await login(scoped.email), noPermission: await login(noPermission.email), employee: await login(employee.email) };
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const createCycle = async (suffix: string, payload = cyclePayload(`${marker}_${suffix}`)) => {
      const created = await request(server).post('/bsc-cycles').set(auth(tokens.manager)).send(payload).expect(201);
      return request(server).post(`/bsc-cycles/${created.body.id}/open`).set(auth(tokens.manager))
        .send({ expectedVersion: created.body.version }).expect(200);
    };
    const createPlan = async (cycleId: string, suffix: string) => {
      const bsc = await request(server).post('/employee-bsc').set(auth(tokens.employee)).send({ cycleId }).expect(201);
      const item = await request(server).post(`/employee-bsc/${bsc.body.id}/items`).set(auth(tokens.manager)).send({
        kpiCode: `${marker}_${suffix}_KPI`, kpiName: `KPI ${suffix}`, targetValue: 100, weight: 100,
        calculationMethod: 'ACTUAL_DIV_TARGET', sortOrder: 1,
      }).expect(201);
      return { bsc: bsc.body, item: item.body };
    };

    await t.test('permission and GLOBAL scope are both required', async () => {
      await request(server).get('/bsc-cycles').set(auth(tokens.manager)).expect(200);
      await request(server).get('/bsc-cycles').set(auth(tokens.viewer)).expect(200);
      await request(server).post('/bsc-cycles').set(auth(tokens.viewer)).send(cyclePayload(`${marker}_VIEWER`)).expect(403);
      await request(server).post('/bsc-cycles').set(auth(tokens.scoped)).send(cyclePayload(`${marker}_SCOPED`)).expect(403);
      await request(server).get('/bsc-cycles').set(auth(tokens.noPermission)).expect(403);
    });

    await t.test('create validates required fields and the evaluation submission deadline', async () => {
      await request(server).post('/bsc-cycles').set(auth(tokens.manager)).send({ name: 'Thiếu dữ liệu' }).expect(400);
      const invalid = cyclePayload(`${marker}_INVALID`);
      invalid.evaluationSubmissionDeadline = iso(day(31), '12:00:00');
      const response = await request(server).post('/bsc-cycles').set(auth(tokens.manager)).send(invalid).expect(400);
      assert.equal(response.body.code, 'BSC_CYCLE_TIMELINE_INVALID');
    });

    await t.test('CRUD, audit, summary and optimistic state transitions are consistent', async () => {
      const created = await request(server).post('/bsc-cycles').set(auth(tokens.manager)).send(cyclePayload(`${marker}_CRUD`)).expect(201);
      assert.equal(created.body.status, 'DRAFT');
      const updated = await request(server).patch(`/bsc-cycles/${created.body.id}`).set(auth(tokens.manager))
        .send({ ...cyclePayload(`${marker}_CRUD`), name: 'Kỳ đã sửa', expectedVersion: created.body.version }).expect(200);
      assert.equal(updated.body.version, 2);
      const results = await Promise.all([
        request(server).post(`/bsc-cycles/${created.body.id}/open`).set(auth(tokens.manager)).send({ expectedVersion: 2 }),
        request(server).post(`/bsc-cycles/${created.body.id}/open`).set(auth(tokens.manager)).send({ expectedVersion: 2 }),
      ]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const detail = await request(server).get(`/bsc-cycles/${created.body.id}`).set(auth(tokens.viewer)).expect(200);
      assert.equal(detail.body.status, 'OPEN'); assert.equal(detail.body.summary.totalBsc, 0);
      const editedOpen = await request(server).patch(`/bsc-cycles/${created.body.id}`).set(auth(tokens.manager))
        .send({ ...cyclePayload(`${marker}_CRUD`), name: 'Kỳ đang mở đã sửa deadline', expectedVersion: detail.body.version }).expect(200);
      const locked = await request(server).post(`/bsc-cycles/${created.body.id}/lock`).set(auth(tokens.manager)).send({ expectedVersion: editedOpen.body.version }).expect(200);
      await request(server).post(`/bsc-cycles/${created.body.id}/open`).set(auth(tokens.manager)).send({ expectedVersion: locked.body.version }).expect(400);
      const reopened = await request(server).post(`/bsc-cycles/${created.body.id}/open`).set(auth(tokens.manager)).send({ expectedVersion: locked.body.version, reason: 'Tiếp tục kỳ' }).expect(200);
      const audits = await prisma.audit_logs.findMany({ where: { entity_id: created.body.id }, orderBy: { created_at: 'asc' } });
      assert.deepEqual(audits.map(row => row.action), ['BSC_CYCLE_CREATED', 'BSC_CYCLE_UPDATED', 'BSC_CYCLE_OPEN', 'BSC_CYCLE_UPDATED', 'BSC_CYCLE_LOCKED', 'BSC_CYCLE_UNLOCKED']);
    });

    await t.test('DRAFT and LOCKED cycles reject owner work while OPEN accepts it', async () => {
      const draft = await request(server).post('/bsc-cycles').set(auth(tokens.manager)).send(cyclePayload(`${marker}_WORKFLOW`)).expect(201);
      await request(server).post('/employee-bsc').set(auth(tokens.employee)).send({ cycleId: draft.body.id }).expect(400);
      const open = await request(server).post(`/bsc-cycles/${draft.body.id}/open`).set(auth(tokens.manager)).send({ expectedVersion: draft.body.version }).expect(200);
      const bsc = await request(server).post('/employee-bsc').set(auth(tokens.employee)).send({ cycleId: draft.body.id }).expect(201);
      assert.equal(bsc.body.cycle_id, draft.body.id);
      const locked = await request(server).post(`/bsc-cycles/${draft.body.id}/lock`).set(auth(tokens.manager)).send({ expectedVersion: open.body.version }).expect(200);
      await request(server).patch(`/employee-bsc/${bsc.body.id}`).set(auth(tokens.employee)).send({ employeeComment: 'blocked' }).expect(400);
      const reopened = await request(server).post(`/bsc-cycles/${draft.body.id}/open`).set(auth(tokens.manager)).send({ expectedVersion: locked.body.version, reason: 'Tiếp tục workflow' }).expect(200);
      await request(server).patch(`/employee-bsc/${bsc.body.id}`).set(auth(tokens.employee)).send({ employeeComment: 'continued' }).expect(200);
    });

    await t.test('canonical PLAN, EVALUATION, review, duplicate and unlock rules work together', async () => {
      const pastDeadlinePayload = cyclePayload(`${marker}_CANONICAL`);
      pastDeadlinePayload.startDate = day(-5);
      pastDeadlinePayload.evaluationSubmissionDeadline = iso(day(-1), '12:00:00');
      const cycle = await createCycle('CANONICAL', pastDeadlinePayload);
      const source = await createPlan(cycle.body.id, 'CANONICAL');

      await request(server).post(`/employee-bsc/${source.bsc.id}/plan/submit`).set(auth(tokens.employee)).send({}).expect(200);
      const locked = await request(server).post(`/bsc-cycles/${cycle.body.id}/lock`).set(auth(tokens.manager))
        .send({ expectedVersion: cycle.body.version }).expect(200);
      await request(server).post(`/employee-bsc/${source.bsc.id}/plan/approve`).set(auth(tokens.manager)).send({}).expect(200);
      await request(server).post(`/bsc-cycles/${cycle.body.id}/open`).set(auth(tokens.manager))
        .send({ expectedVersion: locked.body.version }).expect(400);
      const unlocked = await request(server).post(`/bsc-cycles/${cycle.body.id}/open`).set(auth(tokens.manager))
        .send({ expectedVersion: locked.body.version, reason: 'Tiếp tục nhập kết quả' }).expect(200);
      await request(server).post(`/bsc-cycles/${cycle.body.id}/lock`).set(auth(tokens.manager))
        .send({ expectedVersion: locked.body.version }).expect(409);

      await request(server).patch(`/employee-bsc/${source.bsc.id}/items/${source.item.id}/actual`).set(auth(tokens.employee))
        .send({ actualValue: 100, employeeNote: 'Hoàn thành' }).expect(200);
      await prisma.bsc_cycles.update({ where: { id: cycle.body.id }, data: { submission_deadline: new Date(Date.now() + 60_000) } });
      await request(server).post(`/employee-bsc/${source.bsc.id}/evaluation/submit`).set(auth(tokens.employee)).send({}).expect(200);

      const targetPayload = cyclePayload(`${marker}_TARGET`);
      targetPayload.startDate = day(1);
      const target = await createCycle('TARGET', targetPayload);
      await request(server).post(`/employee-bsc/${source.bsc.id}/duplicate`).set(auth(tokens.employee))
        .send({ targetCycleId: target.body.id }).expect(201);
      await request(server).post(`/employee-bsc/${source.bsc.id}/duplicate`).set(auth(tokens.employee))
        .send({ targetCycleId: target.body.id }).expect(409);

      const lateCycle = await createCycle('LATE');
      const late = await createPlan(lateCycle.body.id, 'LATE');
      await request(server).post(`/employee-bsc/${late.bsc.id}/plan/submit`).set(auth(tokens.employee)).send({}).expect(200);
      await request(server).post(`/employee-bsc/${late.bsc.id}/plan/approve`).set(auth(tokens.manager)).send({}).expect(200);
      await request(server).patch(`/employee-bsc/${late.bsc.id}/items/${late.item.id}/actual`).set(auth(tokens.employee))
        .send({ actualValue: 100 }).expect(200);
      await prisma.bsc_cycles.update({ where: { id: lateCycle.body.id }, data: { submission_deadline: new Date(Date.now() - 1_000) } });
      const lateSubmit = await request(server).post(`/employee-bsc/${late.bsc.id}/evaluation/submit`).set(auth(tokens.employee)).send({}).expect(400);
      assert.equal(lateSubmit.body.code, 'BSC_EVALUATION_SUBMISSION_DEADLINE_PASSED');

      const lockedPlanCycle = await createCycle('LOCKED_PLAN');
      const lockedPlan = await createPlan(lockedPlanCycle.body.id, 'LOCKED_PLAN');
      await request(server).post(`/bsc-cycles/${lockedPlanCycle.body.id}/lock`).set(auth(tokens.manager))
        .send({ expectedVersion: lockedPlanCycle.body.version }).expect(200);
      await request(server).post(`/employee-bsc/${lockedPlan.bsc.id}/plan/submit`).set(auth(tokens.employee)).send({}).expect(400);

      const unlockAudit = await prisma.audit_logs.findFirst({ where: { entity_id: cycle.body.id, action: 'BSC_CYCLE_UNLOCKED' } });
      assert.equal((unlockAudit?.new_data as { reason?: string } | null)?.reason, 'Tiếp tục nhập kết quả');
      assert.equal(unlocked.body.status, 'OPEN');
    });
  } finally {
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  }
});
