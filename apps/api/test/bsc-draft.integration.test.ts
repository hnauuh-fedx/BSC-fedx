import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/main';
import { BSC_PERMISSIONS } from '../src/modules/employee-bsc/policies/bsc-access.policy';

const prisma = new PrismaClient();
const marker = `BSCIT_${Date.now()}_${randomUUID().slice(0, 8)}`.toUpperCase();
const password = 'BscDraft!Test#1';
const tracked = { users: [] as string[], roles: [] as string[], permissions: [] as string[], rolePermissions: [] as Array<{ role_id: string; permission_id: string }>, departments: [] as string[], positions: [] as string[], cycles: [] as string[], bscs: [] as string[] };

function safeDatabase(): boolean {
  try {
    const raw = process.env.TEST_DATABASE_URL;
    if (!raw) return false;
    const database = decodeURIComponent(new URL(raw).pathname.replace(/^\//, '')).toLowerCase();
    return database === 'bsc_organization_test';
  } catch { return false; }
}

async function cleanup() {
  if (tracked.users.length) await prisma.audit_logs.deleteMany({ where: { user_id: { in: tracked.users } } });
  if (tracked.bscs.length) await prisma.employee_bsc.deleteMany({ where: { id: { in: tracked.bscs } } });
  await prisma.employee_bsc.deleteMany({ where: { bsc_code: { startsWith: marker } } });
  if (tracked.cycles.length) await prisma.bsc_cycles.deleteMany({ where: { id: { in: tracked.cycles } } });
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
  for (const pair of tracked.rolePermissions) await prisma.role_permissions.deleteMany({ where: pair });
  for (const id of tracked.permissions) {
    if (await prisma.role_permissions.count({ where: { permission_id: id } }) === 0) await prisma.permissions.deleteMany({ where: { id } });
  }
  await prisma.departments.deleteMany({ where: { code: { startsWith: marker } } });
  await prisma.positions.deleteMany({ where: { code: { startsWith: marker } } });
}

test('Phase 3B.1 BSC Draft Core integration', { skip: safeDatabase() ? false : 'TEST_DATABASE_URL is not configured with a safe test database' }, async (t) => {
  const database = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  assert.match(database[0].current_database, /test/i);
  assert.notEqual(database[0].current_database.toLowerCase(), 'bsc_db');
  let app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
  try {
    await cleanup();

  const departmentA = await prisma.departments.create({ data: { code: `${marker}_DEPT_A`, name: `${marker} Department A` } });
  const departmentB = await prisma.departments.create({ data: { code: `${marker}_DEPT_B`, name: `${marker} Department B` } });
  const position = await prisma.positions.create({ data: { code: `${marker}_POSITION`, name: `${marker} Position`, level: 1 } });
  tracked.departments.push(departmentA.id, departmentB.id); tracked.positions.push(position.id);

  const permissionCodes = Object.values(BSC_PERMISSIONS);
  for (const code of permissionCodes) {
    const existing = await prisma.permissions.findUnique({ where: { code } });
    const permission = await prisma.permissions.upsert({ where: { code }, create: { code, name: code, module: 'bsc' }, update: {} });
    if (!existing) tracked.permissions.push(permission.id);
  }
  const createRole = async (suffix: string, permissions: string[]) => {
    const role = await prisma.roles.create({ data: { code: `${marker}_${suffix}`, name: `${marker} ${suffix}`, hierarchy_level: 1, is_system: false, status: 'ACTIVE' } });
    tracked.roles.push(role.id);
    const records = await prisma.permissions.findMany({ where: { code: { in: permissions } }, select: { id: true } });
    await prisma.role_permissions.createMany({ data: records.map((item) => ({ role_id: role.id, permission_id: item.id })) });
    return role;
  };
  const employeeRole = await createRole('EMPLOYEE', [BSC_PERMISSIONS.CREATE_OWN, BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.EDIT_OWN, BSC_PERMISSIONS.DELETE_OWN, BSC_PERMISSIONS.UPDATE_ACTUAL]);
  const managerRole = await createRole('MANAGER', [BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.MANAGE_KPI]);
  const globalRole = await createRole('GLOBAL_VIEWER', [BSC_PERMISSIONS.VIEW_UNIT]);
  const existingDirector = await prisma.roles.findUnique({ where: { code: 'DIRECTOR' } });
  const directorRole = await prisma.roles.upsert({ where: { code: 'DIRECTOR' }, create: { code: 'DIRECTOR', name: 'Giám đốc', hierarchy_level: 80, is_system: true, status: 'ACTIVE' }, update: {} });
  if (!existingDirector) tracked.roles.push(directorRole.id);
  for (const code of [BSC_PERMISSIONS.CREATE_OWN, BSC_PERMISSIONS.VIEW_OWN]) {
    const permission = await prisma.permissions.findUniqueOrThrow({ where: { code } });
    const existing = await prisma.role_permissions.findUnique({ where: { role_id_permission_id: { role_id: directorRole.id, permission_id: permission.id } } });
    await prisma.role_permissions.upsert({ where: { role_id_permission_id: { role_id: directorRole.id, permission_id: permission.id } }, create: { role_id: directorRole.id, permission_id: permission.id }, update: {} });
    if (existingDirector && !existing) tracked.rolePermissions.push({ role_id: directorRole.id, permission_id: permission.id });
  }
  const noPermissionRole = await createRole('NO_PERMISSION', []);
  const hash = await argon2.hash(password);
  const createUser = async (suffix: string, departmentId: string, roleId: string, scopeType: 'GLOBAL'|'DEPARTMENT'|'SELF', scopeId: string | null, managerId?: string) => {
    const user = await prisma.users.create({ data: { employee_code: `${marker}_${suffix}`, full_name: `${marker} ${suffix}`, email: `${marker.toLowerCase()}_${suffix.toLowerCase()}@example.test`, password_hash: hash, department_id: departmentId, position_id: position.id, direct_manager_id: managerId } });
    tracked.users.push(user.id);
    await prisma.user_roles.create({ data: { user_id: user.id, role_id: roleId, scope_type: scopeType, scope_id: scopeId } });
    return user;
  };
  const globalViewer = await createUser('GLOBAL', departmentA.id, globalRole.id, 'GLOBAL', null);
  const manager = await createUser('MANAGER', departmentA.id, managerRole.id, 'DEPARTMENT', departmentA.id, globalViewer.id);
  const sameDepartmentManager = await createUser('SAME_DEPT_MANAGER', departmentA.id, managerRole.id, 'DEPARTMENT', departmentA.id, globalViewer.id);
  const otherManager = await createUser('OTHER_MANAGER', departmentB.id, managerRole.id, 'DEPARTMENT', departmentB.id, globalViewer.id);
  const employee = await createUser('EMPLOYEE', departmentA.id, employeeRole.id, 'SELF', null, manager.id);
  const employee2 = await createUser('EMPLOYEE_2', departmentA.id, employeeRole.id, 'SELF', null, manager.id);
  const outsider = await createUser('OUTSIDER', departmentB.id, employeeRole.id, 'SELF', null, otherManager.id);
  const director = await createUser('DIRECTOR', departmentA.id, directorRole.id, 'GLOBAL', null, globalViewer.id);
  const noPermission = await createUser('NO_PERMISSION', departmentA.id, noPermissionRole.id, 'SELF', null, manager.id);
  await prisma.manager_relationships.createMany({ data: [
    { employee_id: employee.id, manager_id: manager.id, is_primary: true, start_date: new Date('2026-01-01') },
    { employee_id: employee2.id, manager_id: manager.id, is_primary: true, start_date: new Date('2026-01-01') },
    { employee_id: outsider.id, manager_id: otherManager.id, is_primary: true, start_date: new Date('2026-01-01') },
  ] });
  const cycle = await prisma.bsc_cycles.create({ data: { code: `${marker}_2026_07`, name: `${marker} July`, cycle_type: 'MONTH', year: 2026, month: 7, start_date: new Date('2026-07-01'), end_date: new Date('2026-07-31'), submission_deadline: new Date('2026-07-31T17:00:00Z'), status: 'OPEN', created_by: globalViewer.id } });
  tracked.cycles.push(cycle.id);

  const createdApp = await createApp(); app = createdApp.app; await app.init(); const server = app.getHttpServer();
  const login = async (email: string) => (await request(server).post('/auth/login').send({ email, password }).expect(200)).body.accessToken as string;
  const tokens = { employee: await login(employee.email), employee2: await login(employee2.email), outsider: await login(outsider.email), manager: await login(manager.email), sameDepartmentManager: await login(sameDepartmentManager.email), otherManager: await login(otherManager.email), global: await login(globalViewer.email), director: await login(director.email), none: await login(noPermission.email) };
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    let firstBscId = '';
    let secondBscId = '';
    let firstItemId = '';

    await t.test('create, owner/manager access, scopes, pagination and IDOR', async () => {
      await request(server).get('/employee-bsc').expect(401);
      await request(server).get('/employee-bsc').set(auth(tokens.none)).expect(403);
      const unknownField = await request(server).post('/employee-bsc').set(auth(tokens.employee)).send({ cycleId: cycle.id, employeeId: outsider.id }).expect(400); assert.equal(unknownField.body.code, 'VALIDATION_ERROR');
      const created = await request(server).post('/employee-bsc').set(auth(tokens.employee)).set('User-Agent', 'BSC-Integration').send({ cycleId: cycle.id }).expect(201);
      firstBscId = created.body.id; tracked.bscs.push(firstBscId);
      const ownerKpi = await request(server).post(`/employee-bsc/${firstBscId}/items`).set(auth(tokens.employee)).send({ kpiCode: `${marker}_OWNER_KPI`, kpiName: 'KPI cá nhân', targetValue: 100, weight: 10, calculationMethod: 'ACTUAL_DIV_TARGET', sortOrder: 0 }).expect(201);
      await request(server).delete(`/employee-bsc/${firstBscId}/items/${ownerKpi.body.id}`).set(auth(tokens.employee)).expect(200);
      const second = await request(server).post('/employee-bsc').set(auth(tokens.employee2)).send({ cycleId: cycle.id }).expect(201); secondBscId = second.body.id; tracked.bscs.push(secondBscId);
      assert.equal(created.body.status, 'DRAFT'); assert.equal(created.body.employee_id, employee.id); assert.equal(created.body.department_id, departmentA.id); assert.equal(created.body.position_id, position.id); assert.equal(created.body.direct_manager_id, manager.id);
      const duplicate = await request(server).post('/employee-bsc').set(auth(tokens.employee)).send({ cycleId: cycle.id }).expect(409); assert.equal(duplicate.body.code, 'BSC_ALREADY_EXISTS_FOR_CYCLE');
      const updated = await request(server).patch(`/employee-bsc/${firstBscId}`).set(auth(tokens.employee)).send({ employeeComment: 'Draft comment' }).expect(200); assert.equal(updated.body.employee_comment, 'Draft comment');
      const directorDenied = await request(server).post('/employee-bsc').set(auth(tokens.director)).send({ cycleId: cycle.id }).expect(403); assert.equal(directorDenied.body.code, 'BSC_DIRECTOR_NOT_ELIGIBLE');
      await request(server).get(`/employee-bsc/${firstBscId}`).set(auth(tokens.employee)).expect(200);
      await request(server).get(`/employee-bsc/${firstBscId}`).set(auth(tokens.manager)).expect(200);
      await request(server).get(`/employee-bsc/${firstBscId}`).set(auth(tokens.sameDepartmentManager)).expect(403);
      await request(server).get(`/employee-bsc/${firstBscId}`).set(auth(tokens.outsider)).expect(403);
      await request(server).get(`/employee-bsc/${firstBscId}`).set(auth(tokens.otherManager)).expect(403);
      const missing = await request(server).get(`/employee-bsc/${randomUUID()}`).set(auth(tokens.employee)).expect(404); assert.equal(missing.body.code, 'BSC_NOT_FOUND');
      const selfList = await request(server).get(`/employee-bsc?cycleId=${cycle.id}&employeeId=${employee.id}&planStatus=DRAFT&evaluationStatus=NOT_STARTED&page=1&limit=1&sortBy=created_at&sortOrder=desc`).set(auth(tokens.employee)).expect(200); assert.deepEqual(selfList.body.items.map((item: { employee_id: string }) => item.employee_id), [employee.id]);
      const departmentPage1 = await request(server).get(`/employee-bsc?departmentId=${departmentA.id}&cycleId=${cycle.id}&page=1&limit=1&sortBy=bsc_code&sortOrder=asc`).set(auth(tokens.manager)).expect(200);
      const departmentPage2 = await request(server).get(`/employee-bsc?departmentId=${departmentA.id}&cycleId=${cycle.id}&page=2&limit=1&sortBy=bsc_code&sortOrder=asc`).set(auth(tokens.manager)).expect(200);
      assert.equal(departmentPage1.body.total, 2); assert.equal(departmentPage2.body.total, 2); assert.notEqual(departmentPage1.body.items[0].id, departmentPage2.body.items[0].id);
      const noDirectReports = await request(server).get(`/employee-bsc?departmentId=${departmentA.id}`).set(auth(tokens.sameDepartmentManager)).expect(200); assert.equal(noDirectReports.body.total, 0);
      const globalList = await request(server).get(`/employee-bsc?search=${marker}&page=1&limit=100`).set(auth(tokens.global)).expect(200); assert.ok(globalList.body.total >= 1);
      await request(server).get('/employee-bsc?sortBy=status').set(auth(tokens.employee)).expect(400);
    });

    await t.test('owner and manager can maintain KPI definitions while actual fields stay stage-separated', async () => {
      const baseItem = { kpiCode: `${marker}_KPI_1`, kpiName: 'KPI 1', targetValue: 100, weight: 60, calculationMethod: 'ACTUAL_DIV_TARGET', sortOrder: 1 };
      const created = await request(server).post(`/employee-bsc/${firstBscId}/items`).set(auth(tokens.manager)).send(baseItem).expect(201); firstItemId = created.body.id;
      const duplicateItem = await request(server).post(`/employee-bsc/${firstBscId}/items`).set(auth(tokens.manager)).send({ ...baseItem, weight: 1 }).expect(409); assert.equal(duplicateItem.body.code, 'BSC_ITEM_CODE_EXISTS');
      const ownerItem = await request(server).post(`/employee-bsc/${firstBscId}/items`).set(auth(tokens.employee)).send({ ...baseItem, kpiCode: `${marker}_EMPLOYEE`, weight: 1 }).expect(201);
      await request(server).delete(`/employee-bsc/${firstBscId}/items/${ownerItem.body.id}`).set(auth(tokens.employee)).expect(200);
      const wrongManager = await request(server).post(`/employee-bsc/${firstBscId}/items`).set(auth(tokens.otherManager)).send({ ...baseItem, kpiCode: `${marker}_OTHER_MANAGER` }).expect(403); assert.equal(wrongManager.body.code, 'BSC_ACCESS_DENIED');
      for (const weight of [0, -1, 100.01]) { const invalid = await request(server).post(`/employee-bsc/${firstBscId}/items`).set(auth(tokens.manager)).send({ ...baseItem, kpiCode: `${marker}_BAD_${String(weight).replace('.', '_')}`, weight }).expect(400); assert.equal(invalid.body.code, 'BSC_WEIGHT_INVALID'); }
      const zeroTarget = await request(server).post(`/employee-bsc/${firstBscId}/items`).set(auth(tokens.manager)).send({ ...baseItem, kpiCode: `${marker}_ZERO_TARGET`, targetValue: 0, weight: 1 }).expect(400); assert.equal(zeroTarget.body.code, 'BSC_TARGET_INVALID');
      await request(server).post(`/employee-bsc/${firstBscId}/items`).set(auth(tokens.manager)).send({ ...baseItem, kpiCode: `${marker}_KPI_2`, kpiName: 'KPI 2', weight: 30 }).expect(201);
      const concurrent = await Promise.all([
        request(server).post(`/employee-bsc/${firstBscId}/items`).set(auth(tokens.manager)).send({ ...baseItem, kpiCode: `${marker}_KPI_3`, kpiName: 'KPI 3', weight: 10 }),
        request(server).post(`/employee-bsc/${firstBscId}/items`).set(auth(tokens.manager)).send({ ...baseItem, kpiCode: `${marker}_KPI_4`, kpiName: 'KPI 4', weight: 10 }),
      ]);
      assert.deepEqual(concurrent.map((response) => response.status).sort(), [201, 400]);
      assert.equal(concurrent.find((response) => response.status === 400)?.body.code, 'BSC_TOTAL_WEIGHT_EXCEEDED');
      const concurrentItem = concurrent.find((response) => response.status === 201)?.body.id as string;
      await request(server).patch(`/employee-bsc/${firstBscId}/items/${firstItemId}`).set(auth(tokens.manager)).send({ targetValue: 120, weight: 55 }).expect(200);
      await request(server).patch(`/employee-bsc/${firstBscId}/items/${firstItemId}`).set(auth(tokens.employee)).send({ targetValue: 121 }).expect(200);
      await request(server).patch(`/employee-bsc/${firstBscId}/items/${firstItemId}`).set(auth(tokens.manager)).send({ targetValue: 120 }).expect(200);
      await request(server).delete(`/employee-bsc/${firstBscId}/items/${concurrentItem}`).set(auth(tokens.manager)).expect(200);
      const secondItem = await request(server).post(`/employee-bsc/${secondBscId}/items`).set(auth(tokens.manager)).send({ ...baseItem, kpiCode: `${marker}_SECOND`, weight: 20 }).expect(201);
      await prisma.employee_bsc.updateMany({
        where: { id: { in: [firstBscId, secondBscId] } },
        data: { plan_status: 'APPROVED', evaluation_status: 'DRAFT' },
      });
      const actual = await request(server).patch(`/employee-bsc/${firstBscId}/items/${firstItemId}/actual`).set(auth(tokens.employee)).send({ actualValue: 95, actualText: '95', employeeNote: 'Evidence note' }).expect(200); assert.equal(Number(actual.body.actual_value), 95); assert.equal(actual.body.target_value, '120');
      await request(server).patch(`/employee-bsc/${firstBscId}/items/${firstItemId}/actual`).set(auth(tokens.employee)).send({ actualValue: 96, targetValue: 999 }).expect(400);
      await request(server).patch(`/employee-bsc/${firstBscId}/items/${firstItemId}/actual`).set(auth(tokens.manager)).send({ actualValue: 96 }).expect(403);

      const mismatch = await request(server).patch(`/employee-bsc/${secondBscId}/items/${firstItemId}/actual`).set(auth(tokens.employee2)).send({ actualValue: 1 }).expect(404); assert.equal(mismatch.body.code, 'BSC_ITEM_NOT_IN_BSC');
      await request(server).patch(`/employee-bsc/${secondBscId}/items/${secondItem.body.id}/actual`).set(auth(tokens.employee)).send({ actualValue: 1 }).expect(403);
      await prisma.employee_bsc.update({ where: { id: firstBscId }, data: { evaluation_status: 'SUBMITTED' } });
      const locked = await request(server).patch(`/employee-bsc/${firstBscId}/items/${firstItemId}/actual`).set(auth(tokens.employee)).send({ actualValue: 99 }).expect(403); assert.equal(locked.body.code, 'BSC_FIELD_NOT_EDITABLE_IN_CURRENT_STAGE');
      await request(server).post(`/employee-bsc/${firstBscId}/items`).set(auth(tokens.manager)).send({ ...baseItem, kpiCode: `${marker}_LOCKED` }).expect(403);
      await request(server).patch(`/employee-bsc/${firstBscId}/items/${firstItemId}`).set(auth(tokens.manager)).send({ weight: 40 }).expect(403);
      await prisma.employee_bsc.update({ where: { id: firstBscId }, data: { plan_status: 'DRAFT', evaluation_status: 'NOT_STARTED' } });
      await prisma.employee_bsc.update({ where: { id: secondBscId }, data: { plan_status: 'DRAFT', evaluation_status: 'NOT_STARTED' } });
      await request(server).delete(`/employee-bsc/${secondBscId}`).set(auth(tokens.employee2)).expect(200);
      assert.equal(await prisma.employee_bsc_items.count({ where: { id: secondItem.body.id } }), 0);
      tracked.bscs = tracked.bscs.filter((id) => id !== secondBscId);
    });

    await t.test('draft delete/state rules and sanitized audit are preserved', async () => {
      await prisma.employee_bsc.update({ where: { id: firstBscId }, data: { plan_status: 'APPROVED' } });
      const lockedDelete = await request(server).delete(`/employee-bsc/${firstBscId}`).set(auth(tokens.employee)).expect(403); assert.equal(lockedDelete.body.code, 'BSC_FIELD_NOT_EDITABLE_IN_CURRENT_STAGE');
      await prisma.employee_bsc.update({ where: { id: firstBscId }, data: { plan_status: 'DRAFT', evaluation_status: 'NOT_STARTED' } });
      const audits = await prisma.audit_logs.findMany({ where: { module: 'employee-bsc', OR: [{ entity_id: firstBscId }, { new_data: { path: ['bscId'], equals: firstBscId } }, { old_data: { path: ['bscId'], equals: firstBscId } }] }, orderBy: { created_at: 'asc' } });
      const actions = audits.map((audit) => audit.action);
      for (const action of ['BSC_CREATED', 'BSC_UPDATED', 'BSC_ITEM_CREATED', 'BSC_ITEM_UPDATED', 'BSC_ITEM_DELETED', 'BSC_ACTUAL_UPDATED']) assert.ok(actions.includes(action), `Missing audit ${action}`);
      assert.doesNotMatch(JSON.stringify(audits), /password|password_hash|authorization|access.?token|refresh.?token|database_url/i);
      const createAudit = audits.find((audit) => audit.action === 'BSC_CREATED'); assert.equal(createAudit?.user_agent, 'BSC-Integration');
      await request(server).delete(`/employee-bsc/${firstBscId}`).set(auth(tokens.outsider)).expect(403);
      await request(server).delete(`/employee-bsc/${firstBscId}`).set(auth(tokens.employee)).expect(200);
      assert.equal(await prisma.employee_bsc_items.count({ where: { employee_bsc_id: firstBscId } }), 0);
      assert.ok(await prisma.audit_logs.count({ where: { entity_id: firstBscId, action: 'BSC_DELETED' } }));
      tracked.bscs = tracked.bscs.filter((id) => id !== firstBscId);
    });
  } finally {
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  }
});
