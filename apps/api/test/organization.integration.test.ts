import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/main';

const prisma = new PrismaClient();
const integrationEnabled = (() => { try { const raw = process.env.TEST_DATABASE_URL; if (!raw) return false; const name = new URL(raw).pathname.replace(/^\//, '').toLowerCase(); return name === 'bsc_organization_test'; } catch { return false; } })();
const marker = `ORGIT_${Date.now()}_${randomUUID().slice(0, 6)}`.toUpperCase();
const password = 'Organization!Test#1';
const ids = { users: [] as string[], departments: [] as string[], positions: [] as string[], roles: [] as string[] };

async function cleanup() {
  if (ids.users.length) {
    await prisma.audit_logs.deleteMany({ where: { OR: [{ user_id: { in: ids.users } }, { entity_id: { in: ids.users } }] } });
    await prisma.auth_refresh_tokens.deleteMany({ where: { user_id: { in: ids.users } } });
    await prisma.manager_relationships.deleteMany({ where: { OR: [{ employee_id: { in: ids.users } }, { manager_id: { in: ids.users } }] } });
    await prisma.user_roles.deleteMany({ where: { OR: [{ user_id: { in: ids.users } }, { assigned_by: { in: ids.users } }] } });
    await prisma.users.deleteMany({ where: { id: { in: ids.users } } });
  }
  await prisma.audit_logs.deleteMany({ where: { OR: [{ entity_id: { in: [...ids.departments, ...ids.positions] } }, { new_data: { path: ['code'], string_starts_with: marker } }] } });
  await prisma.departments.deleteMany({ where: { code: { startsWith: marker } } });
  await prisma.positions.deleteMany({ where: { code: { startsWith: marker } } });
  if (ids.roles.length) { await prisma.role_permissions.deleteMany({ where: { role_id: { in: ids.roles } } }); await prisma.roles.deleteMany({ where: { id: { in: ids.roles } } }); }
}

async function createDepartment(suffix: string, status = 'ACTIVE', parentId?: string | null) { const item = await prisma.departments.create({ data: { code: `${marker}_${suffix}`, name: `${marker} ${suffix}`, status, parent_id: parentId ?? null } }); ids.departments.push(item.id); return item; }
async function createPosition(suffix: string, status = 'ACTIVE') { const item = await prisma.positions.create({ data: { code: `${marker}_${suffix}`, name: `${marker} ${suffix}`, level: 1, status } }); ids.positions.push(item.id); return item; }
async function createUser(suffix: string, departmentId: string, positionId: string, status = 'ACTIVE', managerId?: string | null) { const item = await prisma.users.create({ data: { employee_code: `${marker}_${suffix}`, full_name: `${marker} ${suffix}`, email: `${marker.toLowerCase()}_${suffix.toLowerCase()}@example.test`, password_hash: await argon2.hash(password), department_id: departmentId, position_id: positionId, direct_manager_id: managerId ?? null, status } }); ids.users.push(item.id); return item; }

test('Organization API integration', { skip: integrationEnabled ? false : 'TEST_DATABASE_URL is not configured with a safe test database' }, async t => {
  const database = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  assert.match(database[0].current_database, /test/i); assert.notEqual(database[0].current_database, 'bsc_db');
  await cleanup();
  const departmentA = await createDepartment('DEPT_A'); const departmentB = await createDepartment('DEPT_B'); const inactiveDepartment = await createDepartment('DEPT_INACTIVE', 'INACTIVE');
  const positionA = await createPosition('POS_A'); const inactivePosition = await createPosition('POS_INACTIVE', 'INACTIVE');
  const admin = await createUser('ADMIN', departmentA.id, positionA.id); const noPermission = await createUser('NO_PERMISSION', departmentA.id, positionA.id); const departmentUser = await createUser('DEPT_SCOPE', departmentA.id, positionA.id); const otherUser = await createUser('OTHER', departmentB.id, positionA.id); const selfUser = await createUser('SELF', departmentB.id, positionA.id);
  const adminRole = await prisma.roles.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  const userView = await prisma.permissions.findUniqueOrThrow({ where: { code: 'user.view' } });
  const deptRole = await prisma.roles.create({ data: { code: `${marker}_DEPT_ROLE`, name: marker, hierarchy_level: 1, is_system: false, status: 'ACTIVE' } }); const selfRole = await prisma.roles.create({ data: { code: `${marker}_SELF_ROLE`, name: marker, hierarchy_level: 1, is_system: false, status: 'ACTIVE' } }); ids.roles.push(deptRole.id, selfRole.id);
  await prisma.role_permissions.createMany({ data: [{ role_id: deptRole.id, permission_id: userView.id }, { role_id: selfRole.id, permission_id: userView.id }] });
  await prisma.user_roles.createMany({ data: [{ user_id: admin.id, role_id: adminRole.id, scope_type: 'GLOBAL' }, { user_id: departmentUser.id, role_id: deptRole.id, scope_type: 'DEPARTMENT', scope_id: departmentA.id }, { user_id: selfUser.id, role_id: selfRole.id, scope_type: 'SELF' }] });
  const { app } = await createApp(); await app.init(); const server = app.getHttpServer();
  const login = async (email: string) => (await request(server).post('/auth/login').send({ email, password }).expect(200)).body.accessToken as string;
  const adminToken = await login(admin.email), noPermissionToken = await login(noPermission.email), departmentToken = await login(departmentUser.email), selfToken = await login(selfUser.email);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  try {
    await t.test('departments enforce auth, permission, validation, hierarchy, status and audit', async () => {
      await request(server).get('/departments').expect(401);
      await request(server).get('/departments').set(auth(noPermissionToken)).expect(403);
      const list = await request(server).get(`/departments?search=${marker}&status=ACTIVE&page=1&limit=2`).set(auth(adminToken)).expect(200); assert.equal(list.body.page, 1); assert.equal(list.body.limit, 2); assert.ok(list.body.total >= 2);
      const created = await request(server).post('/departments').set(auth(adminToken)).send({ code: `${marker.toLowerCase()}_created`, name: 'Created' }).expect(201); ids.departments.push(created.body.id); assert.equal(created.body.code, `${marker}_CREATED`);
      const duplicate = await request(server).post('/departments').set(auth(adminToken)).send({ code: `${marker}_CREATED`, name: 'Duplicate' }).expect(409); assert.equal(duplicate.body.code, 'DEPARTMENT_CODE_EXISTS');
      await request(server).post('/departments').set(auth(adminToken)).send({ code: `${marker}_BAD_PARENT`, name: 'Bad', parentId: randomUUID() }).expect(404);
      await request(server).post('/departments').set(auth(adminToken)).send({ code: `${marker}_INACTIVE_PARENT`, name: 'Bad', parentId: inactiveDepartment.id }).expect(400);
      const parent = await createDepartment('CYCLE_PARENT'), child = await createDepartment('CYCLE_CHILD', 'ACTIVE', parent.id), grandchild = await createDepartment('CYCLE_GRANDCHILD', 'ACTIVE', child.id);
      const selfParent = await request(server).patch(`/departments/${parent.id}`).set(auth(adminToken)).send({ parentId: parent.id }).expect(400); assert.equal(selfParent.body.code, 'DEPARTMENT_CYCLE');
      await request(server).patch(`/departments/${parent.id}`).set(auth(adminToken)).send({ parentId: child.id }).expect(400);
      await request(server).patch(`/departments/${parent.id}`).set(auth(adminToken)).send({ parentId: grandchild.id }).expect(400);
      const activeChild = await request(server).post(`/departments/${parent.id}/deactivate`).set(auth(adminToken)).expect(400); assert.equal(activeChild.body.code, 'DEPARTMENT_HAS_ACTIVE_CHILDREN');
      const userDepartment = await createDepartment('HAS_USER'); const dependent = await createUser('DEPENDENT', userDepartment.id, positionA.id);
      const activeUser = await request(server).post(`/departments/${userDepartment.id}/deactivate`).set(auth(adminToken)).expect(400); assert.equal(activeUser.body.code, 'DEPARTMENT_HAS_ACTIVE_USERS');
      await prisma.users.update({ where: { id: dependent.id }, data: { status: 'INACTIVE' } });
      await request(server).post(`/departments/${userDepartment.id}/deactivate`).set(auth(adminToken)).expect(201); await request(server).post(`/departments/${userDepartment.id}/activate`).set(auth(adminToken)).expect(201);
      assert.ok(await prisma.audit_logs.count({ where: { entity_id: created.body.id, action: 'DEPARTMENT_CREATED' } }));
    });

    await t.test('positions enforce validation, dependencies, normalization, filters and audit', async () => {
      await request(server).get('/positions').expect(401); await request(server).get('/positions').set(auth(noPermissionToken)).expect(403);
      const created = await request(server).post('/positions').set(auth(adminToken)).send({ code: `${marker.toLowerCase()}_pos_created`, name: 'Position', level: 2 }).expect(201); ids.positions.push(created.body.id); assert.equal(created.body.code, `${marker}_POS_CREATED`);
      const updated = await request(server).patch(`/positions/${created.body.id}`).set(auth(adminToken)).send({ level: 999 }).expect(200); assert.equal(updated.body.level, 999);
      const replaced = await request(server).put(`/positions/${created.body.id}`).set(auth(adminToken)).send({ code: `${marker}_POS_CREATED`, name: 'Position updated', level: 100 }).expect(200); assert.equal(replaced.body.level, 100);
      await request(server).patch(`/positions/${created.body.id}`).set(auth(adminToken)).send({ level: null }).expect(400);
      const duplicate = await request(server).post('/positions').set(auth(adminToken)).send({ code: `${marker}_POS_CREATED`, name: 'Position', level: 2 }).expect(409); assert.equal(duplicate.body.code, 'POSITION_CODE_EXISTS');
      for (const [suffix, level] of [['ZERO', 0], ['NEG', -1], ['DECIMAL', 1.5], ['TOO_HIGH', 1000], ['NULL', null], ['TEXT', 'không hợp lệ'], ['BLANK', '   '], ['BOOLEAN', true], ['ARRAY', [1]]] as const) {
        const response = await request(server).post('/positions').set(auth(adminToken)).send({ code: `${marker}_${suffix}`, name: suffix, level }).expect(400);
        assert.match(JSON.stringify(response.body), /thứ bậc tổ chức/i);
      }
      await request(server).post('/positions').set(auth(adminToken)).send({ code: ' ADMIN ', name: 'Quản trị hệ thống', level: 100 }).expect(400);
      for (const [suffix, name, level] of [['SORT_LOW', 'Zulu', 10], ['SORT_HIGH_Z', 'Zulu', 30], ['SORT_HIGH_A', 'Alpha', 30]] as const) {
        const item = await prisma.positions.create({ data: { code: `${marker}_${suffix}`, name: `${marker} ${name}`, level } }); ids.positions.push(item.id);
      }
      const sorted = await request(server).get(`/positions?search=${marker}&page=1&limit=100`).set(auth(adminToken)).expect(200);
      const sortRows = sorted.body.items.filter((item: { code: string }) => item.code.includes('_SORT_'));
      assert.deepEqual(sortRows.map((item: { code: string }) => item.code), [`${marker}_SORT_HIGH_A`, `${marker}_SORT_HIGH_Z`, `${marker}_SORT_LOW`]);
      const existingLegacyAdmin = await prisma.positions.findFirst({ where: { code: { equals: ' ADMIN ', mode: 'insensitive' } } });
      const legacyAdmin = existingLegacyAdmin ?? await prisma.positions.create({ data: { code: ' ADMIN ', name: 'Quản trị hệ thống', level: 100 } });
      const validPositions = await request(server).get('/positions?page=1&limit=100').set(auth(adminToken)).expect(200);
      assert.ok(validPositions.body.items.every((item: { id: string }) => item.id !== legacyAdmin.id));
      if (!existingLegacyAdmin) await prisma.positions.delete({ where: { id: legacyAdmin.id } });
      const dependentPosition = await createPosition('HAS_USER_POS'); const dependent = await createUser('POSITION_DEPENDENT', departmentA.id, dependentPosition.id);
      const conflict = await request(server).post(`/positions/${dependentPosition.id}/deactivate`).set(auth(adminToken)).expect(400); assert.equal(conflict.body.code, 'POSITION_HAS_ACTIVE_USERS');
      await prisma.users.update({ where: { id: dependent.id }, data: { status: 'INACTIVE' } }); await request(server).post(`/positions/${dependentPosition.id}/deactivate`).set(auth(adminToken)).expect(201); await request(server).post(`/positions/${dependentPosition.id}/activate`).set(auth(adminToken)).expect(201);
      const list = await request(server).get(`/positions?search=${marker}&status=ACTIVE&page=1&limit=2`).set(auth(adminToken)).expect(200); assert.equal(list.body.limit, 2); assert.ok(list.body.total >= 2); assert.ok(await prisma.audit_logs.count({ where: { entity_id: created.body.id, action: 'POSITION_CREATED' } }));
    });

    await t.test('users enforce scopes, secure create, manager history, revocation and last-admin protection', async () => {
      await request(server).get('/users').expect(401); await request(server).get('/users').set(auth(noPermissionToken)).expect(403);
      const globalList = await request(server).get(`/users?search=${marker}&page=1&limit=100`).set(auth(adminToken)).expect(200); assert.ok(globalList.body.items.length >= 5);
      const departmentList = await request(server).get('/users?page=1&limit=100').set(auth(departmentToken)).expect(200); assert.ok(departmentList.body.items.every((item: { department_id: string }) => item.department_id === departmentA.id));
      const selfList = await request(server).get('/users?page=1&limit=100').set(auth(selfToken)).expect(200); assert.deepEqual(selfList.body.items.map((item: { id: string }) => item.id), [selfUser.id]);
      await request(server).get(`/users/${otherUser.id}`).set(auth(departmentToken)).expect(403); const detail = await request(server).get(`/users/${departmentUser.id}`).set(auth(departmentToken)).expect(200); assert.equal(detail.body.department_id, departmentA.id); assert.equal(detail.body.password_hash, undefined);
      const createBody = { employeeCode: `${marker}_API_USER`, fullName: 'API User', email: `${marker.toLowerCase()}_api@example.test`, password, departmentId: departmentA.id, positionId: positionA.id, directManagerId: departmentUser.id };
      const created = await request(server).post('/users').set(auth(adminToken)).send(createBody).expect(201); ids.users.push(created.body.id); assert.equal(created.body.password_hash, undefined); const stored = await prisma.users.findUniqueOrThrow({ where: { id: created.body.id } }); assert.ok(await argon2.verify(stored.password_hash, password));
      await request(server).post('/users').set(auth(adminToken)).send({ ...createBody, employeeCode: `${marker}_OTHER_CODE` }).expect(409); await request(server).post('/users').set(auth(adminToken)).send({ ...createBody, email: `${marker.toLowerCase()}_other@example.test` }).expect(409);
      await request(server).post('/users').set(auth(adminToken)).send({ ...createBody, employeeCode: `${marker}_BAD_DEPT`, email: `${marker.toLowerCase()}_bad_dept@example.test`, departmentId: inactiveDepartment.id }).expect(400);
      await request(server).post('/users').set(auth(adminToken)).send({ ...createBody, employeeCode: `${marker}_BAD_POS`, email: `${marker.toLowerCase()}_bad_pos@example.test`, positionId: inactivePosition.id }).expect(400);
      const inactiveManager = await createUser('INACTIVE_MANAGER', departmentA.id, positionA.id, 'INACTIVE'); await request(server).post('/users').set(auth(adminToken)).send({ ...createBody, employeeCode: `${marker}_BAD_MGR`, email: `${marker.toLowerCase()}_bad_mgr@example.test`, directManagerId: inactiveManager.id }).expect(400);
      const managerA = await createUser('MANAGER_A', departmentA.id, positionA.id), managerB = await createUser('MANAGER_B', departmentA.id, positionA.id, 'ACTIVE', managerA.id), managerC = await createUser('MANAGER_C', departmentA.id, positionA.id, 'ACTIVE', managerB.id);
      await request(server).patch(`/users/${managerA.id}`).set(auth(adminToken)).send({ directManagerId: managerA.id }).expect(400); await request(server).patch(`/users/${managerA.id}`).set(auth(adminToken)).send({ directManagerId: managerB.id }).expect(400); await request(server).patch(`/users/${managerA.id}`).set(auth(adminToken)).send({ directManagerId: managerC.id }).expect(400);
      const historyBefore = await prisma.manager_relationships.count({ where: { employee_id: created.body.id } }); await request(server).patch(`/users/${created.body.id}`).set(auth(adminToken)).send({ directManagerId: managerA.id }).expect(200); assert.equal(await prisma.manager_relationships.count({ where: { employee_id: created.body.id } }), historyBefore + 1);
      const unchanged = await prisma.manager_relationships.count({ where: { employee_id: created.body.id } }); await request(server).patch(`/users/${created.body.id}`).set(auth(adminToken)).send({ directManagerId: managerA.id }).expect(200); assert.equal(await prisma.manager_relationships.count({ where: { employee_id: created.body.id } }), unchanged);
      await request(server).patch(`/users/${created.body.id}`).set(auth(adminToken)).send({ directManagerId: null }).expect(200); assert.equal(await prisma.manager_relationships.count({ where: { employee_id: created.body.id, end_date: null, is_primary: true } }), 0);
      const revocationTarget = await createUser('REVOKE', departmentA.id, positionA.id); const addToken = () => prisma.auth_refresh_tokens.create({ data: { user_id: revocationTarget.id, token_hash: 'hash', jti: randomUUID(), expires_at: new Date(Date.now() + 60_000) } });
      await addToken(); await request(server).post(`/users/${revocationTarget.id}/lock`).set(auth(adminToken)).expect(201); assert.equal(await prisma.auth_refresh_tokens.count({ where: { user_id: revocationTarget.id, revoked_at: null } }), 0); await request(server).post(`/users/${revocationTarget.id}/unlock`).set(auth(adminToken)).expect(201);
      await addToken(); await request(server).post(`/users/${revocationTarget.id}/deactivate`).set(auth(adminToken)).expect(201); assert.equal(await prisma.auth_refresh_tokens.count({ where: { user_id: revocationTarget.id, revoked_at: null } }), 0); await request(server).post(`/users/${revocationTarget.id}/activate`).set(auth(adminToken)).expect(201);
      await addToken(); await request(server).post(`/users/${revocationTarget.id}/reset-password`).set(auth(adminToken)).send({ password: 'NewOrganization!1' }).expect(201); assert.equal(await prisma.auth_refresh_tokens.count({ where: { user_id: revocationTarget.id, revoked_at: null } }), 0);
      const lastAdminLock = await request(server).post(`/users/${admin.id}/lock`).set(auth(adminToken)).expect(400); assert.equal(lastAdminLock.body.code, 'USER_LAST_ACTIVE_ADMIN'); const lastAdminDeactivate = await request(server).post(`/users/${admin.id}/deactivate`).set(auth(adminToken)).expect(400); assert.equal(lastAdminDeactivate.body.code, 'USER_LAST_ACTIVE_ADMIN');
      const expiredAdmin = await createUser('EXPIRED_ADMIN', departmentA.id, positionA.id); await prisma.user_roles.create({ data: { user_id: expiredAdmin.id, role_id: adminRole.id, scope_type: 'GLOBAL', expires_at: new Date(Date.now() - 60_000) } }); await request(server).post(`/users/${admin.id}/lock`).set(auth(adminToken)).expect(400);
      const secondAdmin = await createUser('SECOND_ADMIN', departmentA.id, positionA.id); await prisma.user_roles.create({ data: { user_id: secondAdmin.id, role_id: adminRole.id, scope_type: 'GLOBAL' } }); await request(server).post(`/users/${secondAdmin.id}/lock`).set(auth(adminToken)).expect(201); await request(server).post(`/users/${secondAdmin.id}/unlock`).set(auth(adminToken)).expect(201);
      const lockPermission = await prisma.permissions.findUniqueOrThrow({ where: { code: 'user.lock' } }); const opsRole = await prisma.roles.create({ data: { code: `${marker}_OPS_ROLE`, name: marker, hierarchy_level: 1, is_system: false, status: 'ACTIVE' } }); ids.roles.push(opsRole.id); await prisma.role_permissions.create({ data: { role_id: opsRole.id, permission_id: lockPermission.id } }); await prisma.user_roles.create({ data: { user_id: admin.id, role_id: opsRole.id, scope_type: 'GLOBAL' } }); await prisma.roles.update({ where: { id: adminRole.id }, data: { status: 'INACTIVE' } }); try { await request(server).post(`/users/${secondAdmin.id}/lock`).set(auth(adminToken)).expect(201); } finally { await prisma.roles.update({ where: { id: adminRole.id }, data: { status: 'ACTIVE' } }); }
      const list = await request(server).get(`/users?search=${marker}&departmentId=${departmentA.id}&positionId=${positionA.id}&status=ACTIVE&page=1&limit=2&sortBy=employee_code&sortOrder=asc`).set(auth(adminToken)).expect(200); assert.equal(list.body.page, 1); assert.equal(list.body.limit, 2); assert.ok(list.body.total >= 2);
      const audits = await prisma.audit_logs.findMany({ where: { user_id: admin.id, module: 'users' }, select: { old_data: true, new_data: true } }); assert.doesNotMatch(JSON.stringify(audits), /password|password_hash|token_hash|refresh.?token/i);
    });
  } finally { await app.close(); await cleanup(); await prisma.$disconnect(); }
});
