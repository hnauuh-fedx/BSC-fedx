import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/main';
import { BSC_PERMISSIONS } from '../src/modules/employee-bsc/policies/bsc-access.policy';

const prisma = new PrismaClient();
const marker = `BSCSCORE_${Date.now()}_${randomUUID().slice(0, 8)}`.toUpperCase();
const password = 'BscScore!Test#1';
const tracked = {
  users: [] as string[], roles: [] as string[], permissions: [] as string[],
  departments: [] as string[], positions: [] as string[], cycles: [] as string[], bscs: [] as string[],
};

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

async function assertFixtureClean() {
  const counts = {
    users: await prisma.users.count({ where: { employee_code: { startsWith: marker } } }),
    roles: await prisma.roles.count({ where: { code: { startsWith: marker } } }),
    departments: await prisma.departments.count({ where: { code: { startsWith: marker } } }),
    positions: await prisma.positions.count({ where: { code: { startsWith: marker } } }),
    cycles: await prisma.bsc_cycles.count({ where: { code: { startsWith: marker } } }),
    bscs: await prisma.employee_bsc.count({ where: { bsc_code: { startsWith: marker } } }),
    audits: await prisma.audit_logs.count({ where: { user_id: { in: tracked.users } } }),
  };
  assert.deepEqual(counts, { users: 0, roles: 0, departments: 0, positions: 0, cycles: 0, bscs: 0, audits: 0 });
}

test('Phase 3B.2 BSC scoring integration', { skip: safeDatabase() ? false : 'TEST_DATABASE_URL is not configured with a safe test database' }, async (t) => {
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

    for (const code of Object.values(BSC_PERMISSIONS)) {
      const existing = await prisma.permissions.findUnique({ where: { code } });
      const permission = await prisma.permissions.upsert({ where: { code }, create: { code, name: code, module: 'bsc' }, update: {} });
      if (!existing) tracked.permissions.push(permission.id);
    }
    const createRole = async (suffix: string, permissions: string[]) => {
      const role = await prisma.roles.create({ data: { code: `${marker}_${suffix}`, name: `${marker} ${suffix}`, hierarchy_level: 1, is_system: false, status: 'ACTIVE' } });
      tracked.roles.push(role.id);
      const records = await prisma.permissions.findMany({ where: { code: { in: permissions } }, select: { id: true } });
      await prisma.role_permissions.createMany({ data: records.map(({ id }) => ({ role_id: role.id, permission_id: id })) });
      return role;
    };
    const employeeRole = await createRole('EMPLOYEE', [BSC_PERMISSIONS.CREATE_OWN, BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.EDIT_OWN, BSC_PERMISSIONS.DELETE_OWN, BSC_PERMISSIONS.UPDATE_ACTUAL]);
    const managerRole = await createRole('MANAGER', [BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.MANAGE_KPI]);
    const unitRole = await createRole('UNIT_VIEWER', [BSC_PERMISSIONS.VIEW_UNIT]);
    const createOnlyRole = await createRole('CREATE_ONLY', [BSC_PERMISSIONS.CREATE_OWN]);
    const noneRole = await createRole('NONE', []);
    const hash = await argon2.hash(password);
    const createUser = async (suffix: string, departmentId: string, roleId: string, scopeType: 'GLOBAL'|'DEPARTMENT'|'SELF', scopeId: string | null, managerId?: string) => {
      const user = await prisma.users.create({ data: { employee_code: `${marker}_${suffix}`, full_name: `${marker} ${suffix}`, email: `${marker.toLowerCase()}_${suffix.toLowerCase()}@example.test`, password_hash: hash, department_id: departmentId, position_id: position.id, direct_manager_id: managerId } });
      tracked.users.push(user.id);
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: roleId, scope_type: scopeType, scope_id: scopeId } });
      return user;
    };
    const globalViewer = await createUser('GLOBAL', departmentA.id, unitRole.id, 'GLOBAL', null);
    const manager = await createUser('MANAGER', departmentA.id, managerRole.id, 'DEPARTMENT', departmentA.id, globalViewer.id);
    const departmentViewer = await createUser('DEPT_VIEWER', departmentA.id, unitRole.id, 'DEPARTMENT', departmentA.id, globalViewer.id);
    const otherManager = await createUser('OTHER_MANAGER', departmentB.id, managerRole.id, 'DEPARTMENT', departmentB.id, globalViewer.id);
    const employee = await createUser('EMPLOYEE', departmentA.id, employeeRole.id, 'SELF', null, manager.id);
    const employee2 = await createUser('EMPLOYEE_2', departmentA.id, employeeRole.id, 'SELF', null, manager.id);
    const outsider = await createUser('OUTSIDER', departmentB.id, employeeRole.id, 'SELF', null, otherManager.id);
    const noPermission = await createUser('NONE', departmentA.id, noneRole.id, 'SELF', null, manager.id);
    const ineligibleCreator = await createUser('INELIGIBLE_CREATOR', departmentA.id, createOnlyRole.id, 'SELF', null);

    const cycleData = (suffix: string, year: number, month: number, status: string) => ({ code: `${marker}_${suffix}`, name: `${marker} ${suffix}`, cycle_type: 'MONTH', year, month, start_date: new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00Z`), end_date: new Date(`${year}-${String(month).padStart(2, '0')}-28T00:00:00Z`), submission_deadline: new Date(`${year}-${String(month).padStart(2, '0')}-28T17:00:00Z`), status, created_by: globalViewer.id });
    const openOld = await prisma.bsc_cycles.create({ data: cycleData('OPEN_OLD', 2026, 6, 'OPEN') });
    tracked.cycles.push(openOld.id);
    const openNew = await prisma.bsc_cycles.create({ data: cycleData('OPEN_NEW', 2026, 7, 'OPEN') });
    tracked.cycles.push(openNew.id);
    const closed = await prisma.bsc_cycles.create({ data: cycleData('CLOSED', 2026, 8, 'CLOSED') });
    tracked.cycles.push(closed.id);

    const createdApp = await createApp(); app = createdApp.app; await app.init(); const server = app.getHttpServer();
    const login = async (email: string) => (await request(server).post('/auth/login').send({ email, password }).expect(200)).body.accessToken as string;
    const tokens = { employee: await login(employee.email), employee2: await login(employee2.email), outsider: await login(outsider.email), manager: await login(manager.email), department: await login(departmentViewer.email), global: await login(globalViewer.email), none: await login(noPermission.email), ineligibleCreator: await login(ineligibleCreator.email) };
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    await t.test('cycle read API returns only eligible OPEN cycles in newest-first order', async () => {
      await request(server).get('/bsc-cycles/open').expect(401);
      await request(server).get('/bsc-cycles/open').set(auth(tokens.none)).expect(403);
      const ineligible = await request(server).get('/bsc-cycles/open').set(auth(tokens.ineligibleCreator)).expect(200);
      assert.deepEqual(ineligible.body, []);
      const response = await request(server).get('/bsc-cycles/open').set(auth(tokens.employee)).expect(200);
      assert.deepEqual(response.body.map((cycle: { id: string }) => cycle.id), [openNew.id, openOld.id]);
      assert.deepEqual(Object.keys(response.body[0]).sort(), ['endDate', 'id', 'month', 'name', 'startDate', 'status', 'year']);
      const detail = await request(server).get(`/bsc-cycles/${openNew.id}`).set(auth(tokens.employee)).expect(200);
      assert.equal(detail.body.name, openNew.name);
      const missing = await request(server).get(`/bsc-cycles/${randomUUID()}`).set(auth(tokens.employee)).expect(404);
      assert.equal(missing.body.code, 'BSC_CYCLE_NOT_FOUND');
      await request(server).get(`/bsc-cycles/${closed.id}`).set(auth(tokens.employee)).expect(200);
    });

    let bscId = '';
    let higherId = '';
    let lowerId = '';
    let binaryId = '';

    await t.test('scoring preview enforces scope and computes complete and incomplete drafts', async () => {
      const created = await request(server).post('/employee-bsc').set(auth(tokens.employee)).send({ cycleId: openNew.id }).expect(201);
      bscId = created.body.id; tracked.bscs.push(bscId);
      await request(server).get(`/employee-bsc/${bscId}/scoring-preview`).expect(401);
      await request(server).get(`/employee-bsc/${bscId}/scoring-preview`).set(auth(tokens.none)).expect(403);
      await request(server).get(`/employee-bsc/${bscId}/scoring-preview`).set(auth(tokens.outsider)).expect(403);
      await request(server).get(`/employee-bsc/${bscId}/scoring-preview`).set(auth(tokens.employee2)).expect(403);

      const higher = await request(server).post(`/employee-bsc/${bscId}/items`).set(auth(tokens.manager)).send({ kpiCode: `${marker}_HIGHER`, kpiName: 'Higher', targetValue: 100, weight: 40, calculationMethod: 'ACTUAL_DIV_TARGET' }).expect(201);
      higherId = higher.body.id;
      const incomplete = await request(server).get(`/employee-bsc/${bscId}/scoring-preview`).set(auth(tokens.employee)).expect(200);
      assert.equal(incomplete.body.totalWeight, 40); assert.equal(incomplete.body.scoredWeight, 0); assert.equal(incomplete.body.isComplete, false); assert.equal(incomplete.body.classification, null);
      assert.equal(incomplete.body.items[0].reason, 'ACTUAL_NOT_PROVIDED');

      await request(server).patch(`/employee-bsc/${bscId}/items/${higherId}/actual`).set(auth(tokens.employee)).send({ actualValue: 120, employeeScore: 999, achievementPercentage: 999 }).expect(400);
      await request(server).patch(`/employee-bsc/${bscId}/items/${higherId}/actual`).set(auth(tokens.employee)).send({ actualValue: 120 }).expect(200);
      const partial = await request(server).get(`/employee-bsc/${bscId}/scoring-preview`).set(auth(tokens.manager)).expect(200);
      assert.equal(partial.body.totalWeightedScore, 48); assert.equal(partial.body.scoredWeight, 40); assert.equal(partial.body.classification, null);
      await request(server).get(`/employee-bsc/${bscId}/scoring-preview`).set(auth(tokens.department)).expect(200);
      await request(server).get(`/employee-bsc/${bscId}/scoring-preview`).set(auth(tokens.global)).expect(200);

      const lower = await request(server).post(`/employee-bsc/${bscId}/items`).set(auth(tokens.manager)).send({ kpiCode: `${marker}_LOWER`, kpiName: 'Lower', targetValue: 10, weight: 30, calculationMethod: 'TARGET_DIV_ACTUAL' }).expect(201);
      lowerId = lower.body.id;
      await request(server).patch(`/employee-bsc/${bscId}/items/${lowerId}/actual`).set(auth(tokens.employee)).send({ actualValue: 8 }).expect(200);
      const binary = await request(server).post(`/employee-bsc/${bscId}/items`).set(auth(tokens.manager)).send({ kpiCode: `${marker}_BINARY`, kpiName: 'Binary', weight: 30, calculationMethod: 'BINARY' }).expect(201);
      binaryId = binary.body.id;
      await request(server).patch(`/employee-bsc/${bscId}/items/${binaryId}/actual`).set(auth(tokens.employee)).send({ actualValue: 1 }).expect(200);

      const complete = await request(server).get(`/employee-bsc/${bscId}/scoring-preview`).set(auth(tokens.employee)).expect(200);
      assert.equal(complete.body.bscId, bscId); assert.equal(complete.body.status, 'DRAFT');
      assert.equal(complete.body.totalWeight, 100); assert.equal(complete.body.scoredWeight, 100); assert.equal(complete.body.totalWeightedScore, 115.5);
      assert.equal(complete.body.isComplete, true); assert.equal(complete.body.classification, 'A++');
      assert.deepEqual(complete.body.items.map((item: { achievementPercentage: number; weightedScore: number }) => [item.achievementPercentage, item.weightedScore]), [[120, 48], [125, 37.5], [100, 30]]);
      assert.doesNotMatch(JSON.stringify(complete.body), /NaN|Infinity/);
    });

    await t.test('preview recalculates after actual, target, weight, delete and add without stale aggregate', async () => {
      await request(server).patch(`/employee-bsc/${bscId}/items/${higherId}/actual`).set(auth(tokens.employee)).send({ actualValue: 80 }).expect(200);
      let preview = await request(server).get(`/employee-bsc/${bscId}/scoring-preview`).set(auth(tokens.employee)).expect(200);
      assert.equal(preview.body.totalWeightedScore, 99.5); assert.equal(preview.body.classification, 'A');

      await request(server).patch(`/employee-bsc/${bscId}/items/${higherId}`).set(auth(tokens.manager)).send({ targetValue: 80 }).expect(200);
      preview = await request(server).get(`/employee-bsc/${bscId}/scoring-preview`).set(auth(tokens.employee)).expect(200);
      assert.equal(preview.body.totalWeightedScore, 107.5); assert.equal(preview.body.classification, 'A+');

      await request(server).patch(`/employee-bsc/${bscId}/items/${binaryId}`).set(auth(tokens.manager)).send({ weight: 20 }).expect(200);
      await request(server).patch(`/employee-bsc/${bscId}/items/${higherId}`).set(auth(tokens.manager)).send({ weight: 50 }).expect(200);
      preview = await request(server).get(`/employee-bsc/${bscId}/scoring-preview`).set(auth(tokens.employee)).expect(200);
      assert.equal(preview.body.totalWeight, 100); assert.equal(preview.body.totalWeightedScore, 107.5);

      await request(server).delete(`/employee-bsc/${bscId}/items/${binaryId}`).set(auth(tokens.manager)).expect(200);
      preview = await request(server).get(`/employee-bsc/${bscId}/scoring-preview`).set(auth(tokens.employee)).expect(200);
      assert.equal(preview.body.totalWeight, 80); assert.equal(preview.body.isComplete, false); assert.equal(preview.body.classification, null);

      const added = await request(server).post(`/employee-bsc/${bscId}/items`).set(auth(tokens.manager)).send({ kpiCode: `${marker}_ADDED`, kpiName: 'Added', targetValue: 100, weight: 20, calculationMethod: 'ACTUAL_DIV_TARGET' }).expect(201);
      await request(server).patch(`/employee-bsc/${bscId}/items/${added.body.id}/actual`).set(auth(tokens.employee)).send({ actualValue: 50 }).expect(200);
      preview = await request(server).get(`/employee-bsc/${bscId}/scoring-preview`).set(auth(tokens.employee)).expect(200);
      assert.equal(preview.body.totalWeight, 100); assert.equal(preview.body.totalWeightedScore, 97.5); assert.equal(preview.body.classification, 'A');

      const audits = await prisma.audit_logs.findMany({ where: { user_id: { in: [employee.id, manager.id] }, module: 'employee-bsc' } });
      for (const action of ['BSC_ITEM_CREATED', 'BSC_ITEM_UPDATED', 'BSC_ITEM_DELETED', 'BSC_ACTUAL_UPDATED']) assert.ok(audits.some((audit) => audit.action === action));
    });

    await t.test('zero, invalid binary and unsupported threshold inputs return safe incomplete previews', async () => {
      const created = await request(server).post('/employee-bsc').set(auth(tokens.employee2)).send({ cycleId: openNew.id }).expect(201);
      const edgeBscId = created.body.id; tracked.bscs.push(edgeBscId);
      const zeroTarget = await request(server).post(`/employee-bsc/${edgeBscId}/items`).set(auth(tokens.manager)).send({ kpiCode: `${marker}_ZERO_TARGET`, kpiName: 'Zero target', targetValue: 0, weight: 50, calculationMethod: 'TARGET_DIV_ACTUAL' }).expect(201);
      await request(server).patch(`/employee-bsc/${edgeBscId}/items/${zeroTarget.body.id}/actual`).set(auth(tokens.employee2)).send({ actualValue: 10 }).expect(200);
      const zeroActual = await request(server).post(`/employee-bsc/${edgeBscId}/items`).set(auth(tokens.manager)).send({ kpiCode: `${marker}_ZERO_ACTUAL`, kpiName: 'Zero actual', targetValue: 10, weight: 50, calculationMethod: 'TARGET_DIV_ACTUAL' }).expect(201);
      await request(server).patch(`/employee-bsc/${edgeBscId}/items/${zeroActual.body.id}/actual`).set(auth(tokens.employee2)).send({ actualValue: 0 }).expect(200);
      let preview = await request(server).get(`/employee-bsc/${edgeBscId}/scoring-preview`).set(auth(tokens.employee2)).expect(200);
      assert.deepEqual(preview.body.items.map((item: { reason: string }) => item.reason), ['TARGET_ZERO_NOT_SCORABLE', 'ACTUAL_ZERO_NOT_SCORABLE']);
      assert.equal(preview.body.isComplete, false); assert.equal(preview.body.classification, null); assert.doesNotMatch(JSON.stringify(preview.body), /NaN|Infinity/);

      await request(server).delete(`/employee-bsc/${edgeBscId}/items/${zeroTarget.body.id}`).set(auth(tokens.manager)).expect(200);
      await request(server).delete(`/employee-bsc/${edgeBscId}/items/${zeroActual.body.id}`).set(auth(tokens.manager)).expect(200);
      const threshold = await request(server).post(`/employee-bsc/${edgeBscId}/items`).set(auth(tokens.manager)).send({ kpiCode: `${marker}_THRESHOLD`, kpiName: 'Threshold', targetValue: 10, weight: 100, calculationMethod: 'THRESHOLD' }).expect(201);
      await request(server).patch(`/employee-bsc/${edgeBscId}/items/${threshold.body.id}/actual`).set(auth(tokens.employee2)).send({ actualValue: 10 }).expect(200);
      preview = await request(server).get(`/employee-bsc/${edgeBscId}/scoring-preview`).set(auth(tokens.employee2)).expect(200);
      assert.equal(preview.body.items[0].reason, 'CALCULATION_METHOD_UNSUPPORTED');

      await request(server).patch(`/employee-bsc/${edgeBscId}/items/${threshold.body.id}`).set(auth(tokens.manager)).send({ calculationMethod: 'BINARY' }).expect(200);
      await request(server).patch(`/employee-bsc/${edgeBscId}/items/${threshold.body.id}/actual`).set(auth(tokens.employee2)).send({ actualValue: 2 }).expect(200);
      preview = await request(server).get(`/employee-bsc/${edgeBscId}/scoring-preview`).set(auth(tokens.employee2)).expect(200);
      assert.equal(preview.body.items[0].reason, 'BINARY_ACTUAL_INVALID');
    });
  } finally {
    if (app) await app.close();
    await cleanup();
    await assertFixtureClean();
    await prisma.$disconnect();
  }
});
