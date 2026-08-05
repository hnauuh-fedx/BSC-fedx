import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/main';
import { BSC_PERMISSIONS } from '../src/modules/employee-bsc/policies/bsc-access.policy';

const prisma = new PrismaClient();
const marker = `BSCVER_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`.toUpperCase();
const password = 'BscVersion!Test#1';
const ids = {
  users: [] as string[], roles: [] as string[], permissions: [] as string[], departments: [] as string[],
  positions: [] as string[], cycles: [] as string[], bscs: [] as string[],
  rolePermissions: [] as Array<{ role_id: string; permission_id: string }>,
};
let httpAssertions = 0;

function safeDatabase(): boolean {
  try { return decodeURIComponent(new URL(process.env.TEST_DATABASE_URL ?? '').pathname.slice(1)).toLowerCase() === 'bsc_organization_test'; }
  catch { return false; }
}

async function cleanup() {
  const [fixtureUsers, fixtureRoles] = await Promise.all([
    prisma.users.findMany({ where: { employee_code: { startsWith: 'BSCVER_' } }, select: { id: true } }),
    prisma.roles.findMany({ where: { code: { startsWith: 'BSCVER_' } }, select: { id: true } }),
  ]);
  const userIds = Array.from(new Set([...ids.users, ...fixtureUsers.map(row => row.id)]));
  const roleIds = Array.from(new Set([...ids.roles, ...fixtureRoles.map(row => row.id)]));
  if (userIds.length) {
    await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.employee_bsc.deleteMany({ where: { employee_id: { in: userIds } } });
    await prisma.bsc_cycles.deleteMany({ where: { code: { startsWith: 'BSCVER_' } } });
    await prisma.auth_refresh_tokens.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.manager_relationships.deleteMany({ where: { OR: [{ employee_id: { in: userIds } }, { manager_id: { in: userIds } }] } });
    await prisma.user_roles.deleteMany({ where: { OR: [{ user_id: { in: userIds } }, { assigned_by: { in: userIds } }] } });
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });
  }
  else await prisma.bsc_cycles.deleteMany({ where: { code: { startsWith: 'BSCVER_' } } });
  if (roleIds.length) {
    await prisma.role_permissions.deleteMany({ where: { role_id: { in: roleIds } } });
    await prisma.roles.deleteMany({ where: { id: { in: roleIds } } });
  }
  for (const pair of ids.rolePermissions) await prisma.role_permissions.deleteMany({ where: pair });
  for (const id of ids.permissions) {
    if (await prisma.role_permissions.count({ where: { permission_id: id } }) === 0) await prisma.permissions.deleteMany({ where: { id } });
  }
  await prisma.departments.deleteMany({ where: { code: { startsWith: 'BSCVER_' } } });
  await prisma.positions.deleteMany({ where: { code: { startsWith: 'BSCVER_' } } });
}

async function assertClean() {
  assert.deepEqual({
    users: await prisma.users.count({ where: { employee_code: { startsWith: 'BSCVER_' } } }),
    roles: await prisma.roles.count({ where: { code: { startsWith: 'BSCVER_' } } }),
    departments: await prisma.departments.count({ where: { code: { startsWith: 'BSCVER_' } } }),
    positions: await prisma.positions.count({ where: { code: { startsWith: 'BSCVER_' } } }),
    cycles: await prisma.bsc_cycles.count({ where: { code: { startsWith: 'BSCVER_' } } }),
    bscs: await prisma.employee_bsc.count({ where: { OR: [{ bsc_code: { startsWith: 'BSCVER_' } }, { employee_id: { in: ids.users } }] } }),
    permissions: await prisma.permissions.count({ where: { id: { in: ids.permissions } } }),
  }, { users: 0, roles: 0, departments: 0, positions: 0, cycles: 0, bscs: 0, permissions: 0 });
}

test('Phase 3B.5 reopen, version and approved PLAN duplicate integration', {
  skip: safeDatabase() ? false : 'TEST_DATABASE_URL is not configured with exact bsc_organization_test',
}, async (t) => {
  const database = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  assert.equal(database[0].current_database.toLowerCase(), 'bsc_organization_test');
  let app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
  try {
    await cleanup();
    const department = await prisma.departments.create({ data: { code: `${marker}_DEPT`, name: `${marker} Department` } });
    const otherDepartment = await prisma.departments.create({ data: { code: `${marker}_OTHER`, name: `${marker} Other` } });
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
    const employeeRole = await role('EMPLOYEE', [
      BSC_PERMISSIONS.VIEW_OWN, BSC_PERMISSIONS.EDIT_OWN, BSC_PERMISSIONS.UPDATE_ACTUAL,
      BSC_PERMISSIONS.SUBMIT_PLAN_OWN, BSC_PERMISSIONS.SUBMIT_EVALUATION_OWN,
      BSC_PERMISSIONS.VIEW_PLAN_HISTORY, BSC_PERMISSIONS.VIEW_EVALUATION_HISTORY,
      BSC_PERMISSIONS.REQUEST_REOPEN, BSC_PERMISSIONS.VIEW_VERSION, BSC_PERMISSIONS.DUPLICATE_OWN,
    ]);
    const managerRole = await role('MANAGER', [
      BSC_PERMISSIONS.VIEW_SUBORDINATE, BSC_PERMISSIONS.MANAGE_KPI,
      BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE,
      BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE,
      BSC_PERMISSIONS.REVIEW_REOPEN, BSC_PERMISSIONS.VIEW_VERSION,
    ]);
    const hash = await argon2.hash(password);
    const user = async (name: string, roleId: string, departmentId: string, scope: 'SELF'|'DEPARTMENT'|'GLOBAL', managerId?: string) => {
      const result = await prisma.users.create({ data: {
        employee_code: `${marker}_${name}`, username: String(`${marker}_${name}`).toLowerCase(), full_name: `${marker} ${name}`,
        email: `${marker.toLowerCase()}_${name.toLowerCase()}@example.test`, password_hash: hash,
        department_id: departmentId, position_id: position.id, direct_manager_id: managerId,
      } });
      ids.users.push(result.id);
      await prisma.user_roles.create({ data: { user_id: result.id, role_id: roleId, scope_type: scope, scope_id: scope === 'DEPARTMENT' ? departmentId : null } });
      if (managerId) {
        await prisma.manager_relationships.create({ data: {
          employee_id: result.id,
          manager_id: managerId,
          start_date: new Date('2020-01-01T00:00:00Z'),
          is_primary: true,
        } });
      }
      return result;
    };
    const rootManager = await user('ROOT', managerRole.id, department.id, 'DEPARTMENT');
    const manager = await user('MANAGER', managerRole.id, department.id, 'DEPARTMENT', rootManager.id);
    const otherManager = await user('OTHER_MANAGER', managerRole.id, otherDepartment.id, 'DEPARTMENT', rootManager.id);
    let directorRole = await prisma.roles.findUnique({ where: { code: 'DIRECTOR' } });
    const createdDirectorRole = !directorRole;
    if (!directorRole) {
      directorRole = await prisma.roles.create({ data: { code: 'DIRECTOR', name: 'Director', hierarchy_level: 2, is_system: true, status: 'ACTIVE' } });
      ids.roles.push(directorRole.id);
    }
    const directorPermissionIds = await prisma.permissions.findMany({ where: { code: { in: [
      BSC_PERMISSIONS.APPROVE_PLAN_SUBORDINATE, BSC_PERMISSIONS.RETURN_PLAN_SUBORDINATE,
      BSC_PERMISSIONS.APPROVE_EVALUATION_SUBORDINATE, BSC_PERMISSIONS.RETURN_EVALUATION_SUBORDINATE,
      BSC_PERMISSIONS.REVIEW_REOPEN, BSC_PERMISSIONS.VIEW_VERSION,
    ] } }, select: { id: true } });
    for (const permission of directorPermissionIds) {
      const pair = { role_id: directorRole.id, permission_id: permission.id };
      const existing = await prisma.role_permissions.findUnique({ where: { role_id_permission_id: pair } });
      await prisma.role_permissions.upsert({ where: { role_id_permission_id: pair }, create: pair, update: {} });
      if (!createdDirectorRole && !existing) ids.rolePermissions.push(pair);
    }
    const director = await user('DIRECTOR', directorRole.id, department.id, 'GLOBAL');
    const employee = await user('EMPLOYEE', employeeRole.id, department.id, 'SELF', manager.id);
    const employee2 = await user('EMPLOYEE2', employeeRole.id, department.id, 'SELF', manager.id);
    let cycleCounter = 0;
    const cycle = async (month: number, status = 'OPEN', year = 2098) => {
      cycleCounter += 1;
      const value = await prisma.bsc_cycles.create({ data: {
        code: `${marker}_C${cycleCounter}`, name: `${marker} ${year}-${month}`, cycle_type: 'MONTH', year, month,
        start_date: new Date(Date.UTC(year, month - 1, 1)), end_date: new Date(Date.UTC(year, month, 0)),
        submission_deadline: new Date('2099-12-31T23:59:59Z'), status, created_by: rootManager.id,
      } });
      ids.cycles.push(value.id); return value;
    };
    const createBsc = async (name: string, owner: typeof employee, sourceCycle: Awaited<ReturnType<typeof cycle>>, actual: number | null = 90) => {
      const bsc = await prisma.employee_bsc.create({ data: {
        bsc_code: `${marker}_${name}`, cycle_id: sourceCycle.id, employee_id: owner.id,
        department_id: owner.department_id, position_id: position.id, direct_manager_id: owner.direct_manager_id!, created_by: owner.id,
      } });
      ids.bscs.push(bsc.id);
      const item = await prisma.employee_bsc_items.create({ data: {
        employee_bsc_id: bsc.id, kpi_code: `${marker.slice(0, 30)}_${cycleCounter}_${name}`.slice(0, 50),
        kpi_name: 'KPI approved definition', target_value: 100, actual_value: actual, actual_text: actual === null ? null : 'Kết quả',
        employee_note: actual === null ? null : 'TM KQTH', weight: 100, calculation_method: 'ACTUAL_DIV_TARGET', assigned_by: manager.id,
      } });
      return { ...bsc, item };
    };
    const created = await createApp(); app = created.app; await app.init(); const server = app.getHttpServer();
    const login = async (username: string) => (await request(server).post('/auth/login').send({ username, password }).expect(200)).body.accessToken as string;
    const tokens = { manager: await login(manager.username), otherManager: await login(otherManager.username), employee: await login(employee.username), employee2: await login(employee2.username), director: await login(director.username) };
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const expectHttp = async (call: any, status: number) => { httpAssertions += 1; return call.expect(status); };
    const approvePlan = async (record: { id: string }, ownerToken = tokens.employee) => {
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/submit`).set(auth(ownerToken)).send({}), 200);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/plan/approve`).set(auth(tokens.director)).send({}), 200);
    };
    const approveEvaluation = async (record: { id: string }, ownerToken = tokens.employee) => {
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/evaluation/submit`).set(auth(ownerToken)).send({}), 200);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/evaluation/approve`).set(auth(tokens.director)).send({}), 200);
    };

    await t.test('reopen eligibility rejects every non-approved stage and wrong owner but ignores manager status', async () => {
      for (const [index, status] of ['DRAFT', 'SUBMITTED', 'RETURNED', 'REOPENED'].entries()) {
        const record = await createBsc(`PLAN_${status}`, employee, await cycle(index + 1, 'OPEN', 2090));
        await prisma.employee_bsc.update({ where: { id: record.id }, data: { plan_status: status } });
        const response = await expectHttp(request(server).post(`/employee-bsc/${record.id}/reopen-requests`).set(auth(tokens.employee))
          .send({ stage: 'PLAN', reason: 'Không hợp lệ' }), 409);
        assert.equal(response.body.code, 'BSC_PLAN_NOT_APPROVED_FOR_REOPEN');
      }
      for (const [index, status] of ['NOT_STARTED', 'DRAFT', 'SUBMITTED', 'RETURNED', 'REOPENED'].entries()) {
        const record = await createBsc(`EVAL_${status}`, employee, await cycle(index + 1, 'OPEN', 2091));
        await prisma.employee_bsc.update({ where: { id: record.id }, data: { plan_status: 'APPROVED', evaluation_status: status } });
        const response = await expectHttp(request(server).post(`/employee-bsc/${record.id}/reopen-requests`).set(auth(tokens.employee))
          .send({ stage: 'EVALUATION', reason: 'Không hợp lệ' }), 409);
        assert.equal(response.body.code, 'BSC_EVALUATION_NOT_APPROVED_FOR_REOPEN');
      }
      const wrongOwner = await createBsc('WRONG_OWNER', employee, await cycle(6, 'OPEN', 2091));
      await approvePlan(wrongOwner);
      await expectHttp(request(server).post(`/employee-bsc/${wrongOwner.id}/reopen-requests`).set(auth(tokens.employee2))
        .send({ stage: 'PLAN', reason: 'Sai owner' }), 403);
      await prisma.users.update({ where: { id: manager.id }, data: { status: 'INACTIVE' } });
      await expectHttp(request(server).post(`/employee-bsc/${wrongOwner.id}/reopen-requests`).set(auth(tokens.employee))
        .send({ stage: 'PLAN', reason: '   ' }), 400);
      const requestCreated = await expectHttp(request(server).post(`/employee-bsc/${wrongOwner.id}/reopen-requests`).set(auth(tokens.employee))
        .send({ stage: 'PLAN', reason: 'Manager status must not select reviewer' }), 201);
      assert.equal(requestCreated.body.reviewer_id, director.id);
      await prisma.users.update({ where: { id: manager.id }, data: { status: 'ACTIVE' } });
    });

    await t.test('approval creates immutable scoped PLAN and EVALUATION versions', async () => {
      const record = await createBsc('VERSIONS', employee, await cycle(1));
      await prisma.employee_bsc.update({ where: { id: record.id }, data: { employee_comment: 'Ghi chú nhân viên', manager_comment: 'Ghi chú quản lý' } });
      const attachment = await prisma.bsc_attachments.create({ data: {
        employee_bsc_id: record.id,
        bsc_item_id: record.item.id,
        file_name: 'evidence.pdf',
        file_path: '/private/storage/evidence.pdf',
        mime_type: 'application/pdf',
        file_size: 1234,
        uploaded_by: employee.id,
      } });
      await approvePlan(record); await approveEvaluation(record);
      const list = await expectHttp(request(server).get(`/employee-bsc/${record.id}/versions`).set(auth(tokens.employee)), 200);
      assert.deepEqual(list.body.map((row: any) => [row.versionNumber, row.versionType]), [[2, 'EVALUATION_APPROVED'], [1, 'PLAN_APPROVED']]);
      const evaluation = await expectHttp(request(server).get(`/employee-bsc/${record.id}/versions/${list.body[0].id}`).set(auth(tokens.employee)), 200);
      assert.equal(evaluation.body.snapshot.finalScore, '90'); assert.equal(evaluation.body.snapshot.finalGrade, 'A');
      assert.equal(evaluation.body.snapshot.reviewer.id, director.id);
      assert.equal(evaluation.body.snapshot.directManager.id, manager.id);
      assert.equal(evaluation.body.snapshot.items[0].rawAchievementPercentage, 90);
      assert.equal(evaluation.body.snapshot.employeeComment, 'Ghi chú nhân viên');
      assert.equal(evaluation.body.snapshot.managerComment, 'Ghi chú quản lý');
      assert.deepEqual(evaluation.body.snapshot.evidence, [{
        id: attachment.id, itemId: record.item.id, fileName: 'evidence.pdf', mimeType: 'application/pdf',
        fileSize: '1234', uploadedBy: employee.id, uploadedAt: attachment.uploaded_at.toISOString(),
      }]);
      assert.doesNotMatch(JSON.stringify(evaluation.body.snapshot), /private\/storage|filePath/i);
      assert.doesNotMatch(JSON.stringify(evaluation.body), /password|token|cookie|authorization|credential|user.?agent|ip.?address/i);
      await expectHttp(request(server).get(`/employee-bsc/${record.id}/versions`).set(auth(tokens.otherManager)), 403);
      await expectHttp(request(server).patch(`/employee-bsc/${record.id}/versions/${list.body[0].id}`).set(auth(tokens.employee)).send({ snapshot: {} }), 404);
      await expectHttp(request(server).delete(`/employee-bsc/${record.id}/versions/${list.body[0].id}`).set(auth(tokens.employee)), 404);
    });

    await t.test('EVALUATION reopen preserves approved snapshot and re-approves a legacy grade with the current scale', async () => {
      const record = await createBsc('EVAL_REOPEN', employee, await cycle(2));
      await approvePlan(record); await approveEvaluation(record);
      await prisma.employee_bsc.update({ where: { id: record.id }, data: { final_grade: 'A++' } });
      const createdRequest = await expectHttp(request(server).post(`/employee-bsc/${record.id}/reopen-requests`).set(auth(tokens.employee))
        .send({ stage: 'EVALUATION', reason: ' <b>Sửa kết quả</b> ' }), 201);
      assert.equal(createdRequest.body.request_reason, 'Sửa kết quả');
      await expectHttp(request(server).patch(`/employee-bsc/${record.id}/items/${record.item.id}/actual`).set(auth(tokens.employee)).send({ actualValue: 95 }), 403);
      await expectHttp(request(server).post(`/employee-bsc/${record.id}/reopen-requests`).set(auth(tokens.employee)).send({ stage: 'EVALUATION', reason: 'Trùng' }), 409);
      const approved = await expectHttp(request(server).post(`/employee-bsc/reopen-requests/${createdRequest.body.id}/approve`).set(auth(tokens.director)).send({}), 200);
      assert.equal(approved.body.status, 'APPROVED');
      const active = await prisma.employee_bsc.findUniqueOrThrow({ where: { id: record.id }, include: { employee_bsc_items: true } });
      assert.equal(active.plan_status, 'APPROVED'); assert.equal(active.evaluation_status, 'REOPENED');
      assert.equal(active.final_score, null); assert.equal(Number(active.employee_bsc_items[0].actual_value), 90);
      await expectHttp(request(server).patch(`/employee-bsc/${record.id}/items/${record.item.id}`).set(auth(tokens.employee)).send({ targetValue: 120 }), 403);
      await expectHttp(request(server).patch(`/employee-bsc/${record.id}/items/${record.item.id}/actual`).set(auth(tokens.employee)).send({ actualValue: 111, employeeNote: 'Số mới' }), 200);
      await approveEvaluation(record);
      const versions = await prisma.bsc_versions.findMany({ where: { employee_bsc_id: record.id }, orderBy: { version_number: 'asc' } });
      assert.deepEqual(versions.map(row => row.version_type), ['PLAN_APPROVED', 'EVALUATION_APPROVED', 'BEFORE_EVALUATION_REOPEN', 'EVALUATION_APPROVED']);
      const current = await prisma.employee_bsc.findUniqueOrThrow({ where: { id: record.id } });
      assert.equal(Number(current.final_score), 110); assert.equal(current.final_grade, 'A+');
    });

    await t.test('PLAN reopen resets active evaluation, owner edits definition and plan is approved again', async () => {
      const record = await createBsc('PLAN_REOPEN', employee, await cycle(3));
      await approvePlan(record); await approveEvaluation(record);
      const evaluationReopen = await expectHttp(request(server).post(`/employee-bsc/${record.id}/reopen-requests`).set(auth(tokens.employee))
        .send({ stage: 'EVALUATION', reason: 'Yêu cầu cũ sẽ hết hiệu lực' }), 201);
      const reopen = await expectHttp(request(server).post(`/employee-bsc/${record.id}/reopen-requests`).set(auth(tokens.employee))
        .send({ stage: 'PLAN', reason: 'Đổi chỉ tiêu' }), 201);
      await prisma.bsc_cycles.update({ where: { id: record.cycle_id }, data: { status: 'CLOSED' } });
      const closedDecision = await expectHttp(request(server).post(`/employee-bsc/reopen-requests/${reopen.body.id}/approve`).set(auth(tokens.director)).send({}), 409);
      assert.equal(closedDecision.body.code, 'BSC_CYCLE_CLOSED');
      await prisma.bsc_cycles.update({ where: { id: record.cycle_id }, data: { status: 'OPEN' } });
      await expectHttp(request(server).post(`/employee-bsc/reopen-requests/${reopen.body.id}/approve`).set(auth(tokens.director)).send({}), 200);
      const expired = await prisma.bsc_unlock_requests.findUniqueOrThrow({ where: { id: evaluationReopen.body.id } });
      assert.equal(expired.status, 'EXPIRED');
      const reset = await prisma.employee_bsc.findUniqueOrThrow({ where: { id: record.id }, include: { employee_bsc_items: true } });
      assert.equal(reset.plan_status, 'REOPENED'); assert.equal(reset.evaluation_status, 'NOT_STARTED');
      assert.equal(reset.employee_bsc_items[0].actual_value, null); assert.equal(reset.final_score, null);
      await expectHttp(request(server).patch(`/employee-bsc/${record.id}/items/${record.item.id}`).set(auth(tokens.employee)).send({ targetValue: 120 }), 200);
      await expectHttp(request(server).patch(`/employee-bsc/${record.id}/items/${record.item.id}/actual`).set(auth(tokens.employee)).send({ actualValue: 100 }), 403);
      await approvePlan(record);
      const current = await prisma.employee_bsc.findUniqueOrThrow({ where: { id: record.id } });
      assert.equal(current.plan_status, 'APPROVED'); assert.equal(current.evaluation_status, 'DRAFT');
      assert.equal(await prisma.bsc_versions.count({ where: { employee_bsc_id: record.id, version_type: 'PLAN_APPROVED' } }), 2);
    });

    await t.test('reopen reject and concurrency keep a single decision without reset', async () => {
      const rejectedRecord = await createBsc('REJECT', employee, await cycle(4));
      await approvePlan(rejectedRecord);
      const reopen = await expectHttp(request(server).post(`/employee-bsc/${rejectedRecord.id}/reopen-requests`).set(auth(tokens.employee))
        .send({ stage: 'PLAN', reason: 'Xin sửa' }), 201);
      await expectHttp(request(server).post(`/employee-bsc/reopen-requests/${reopen.body.id}/reject`).set(auth(tokens.director)).send({ reason: ' ' }), 400);
      await expectHttp(request(server).post(`/employee-bsc/reopen-requests/${reopen.body.id}/reject`).set(auth(tokens.director)).send({ reason: '<b>Không chấp thuận</b>' }), 200);
      const unchanged = await prisma.employee_bsc.findUniqueOrThrow({ where: { id: rejectedRecord.id } });
      assert.equal(unchanged.plan_status, 'APPROVED');
      assert.equal(await prisma.bsc_versions.count({ where: { employee_bsc_id: rejectedRecord.id, version_type: 'BEFORE_PLAN_REOPEN' } }), 0);

      const staleVersionRecord = await createBsc('STALE_VERSION', employee, await cycle(5));
      await approvePlan(staleVersionRecord);
      const staleVersionRequest = await expectHttp(request(server).post(`/employee-bsc/${staleVersionRecord.id}/reopen-requests`).set(auth(tokens.employee))
        .send({ stage: 'PLAN', reason: 'Ràng buộc phiên bản nguồn' }), 201);
      const sourceVersion = await prisma.bsc_versions.findUniqueOrThrow({ where: { id: staleVersionRequest.body.source_version_id } });
      await prisma.bsc_versions.create({ data: {
        employee_bsc_id: staleVersionRecord.id,
        version_number: sourceVersion.version_number + 1,
        stage: 'PLAN',
        version_type: 'PLAN_APPROVED',
        snapshot: sourceVersion.snapshot,
        created_by: manager.id,
      } });
      const staleVersionDecision = await expectHttp(request(server).post(`/employee-bsc/reopen-requests/${staleVersionRequest.body.id}/approve`).set(auth(tokens.director)).send({}), 409);
      assert.equal(staleVersionDecision.body.code, 'BSC_REOPEN_SOURCE_VERSION_STALE');

      const raceRecord = await createBsc('REQUEST_RACE', employee2, await cycle(5));
      await approvePlan(raceRecord, tokens.employee2);
      const requests = await Promise.all([0, 1].map(() => request(server).post(`/employee-bsc/${raceRecord.id}/reopen-requests`)
        .set(auth(tokens.employee2)).send({ stage: 'PLAN', reason: 'Race request' })));
      httpAssertions += 2; assert.deepEqual(requests.map(row => row.status).sort(), [201, 409]);
      const requestId = requests.find(row => row.status === 201)!.body.id;
      const decisions = await Promise.all([
        request(server).post(`/employee-bsc/reopen-requests/${requestId}/approve`).set(auth(tokens.director)).send({}),
        request(server).post(`/employee-bsc/reopen-requests/${requestId}/reject`).set(auth(tokens.director)).send({ reason: 'Race reject' }),
      ]);
      httpAssertions += 2; assert.deepEqual(decisions.map(row => row.status).sort(), [200, 409]);
      assert.equal(await prisma.bsc_versions.count({ where: { employee_bsc_id: raceRecord.id, version_type: 'BEFORE_PLAN_REOPEN' } }), decisions.find(row => row.status === 200)!.body.status === 'APPROVED' ? 1 : 0);

      const approveRaceRecord = await createBsc('APPROVE_RACE', employee2, await cycle(6, 'OPEN', 2092));
      await approvePlan(approveRaceRecord, tokens.employee2);
      const approveRaceRequest = await expectHttp(request(server).post(`/employee-bsc/${approveRaceRecord.id}/reopen-requests`).set(auth(tokens.employee2))
        .send({ stage: 'PLAN', reason: 'Two approve race' }), 201);
      const approveRace = await Promise.all([0, 1].map(() => request(server)
        .post(`/employee-bsc/reopen-requests/${approveRaceRequest.body.id}/approve`).set(auth(tokens.director)).send({})));
      httpAssertions += 2;
      assert.deepEqual(approveRace.map(row => row.status).sort(), [200, 409]);
      assert.equal(await prisma.bsc_versions.count({ where: { employee_bsc_id: approveRaceRecord.id, version_type: 'BEFORE_PLAN_REOPEN' } }), 1);
      assert.equal(await prisma.bsc_status_histories.count({ where: { employee_bsc_id: approveRaceRecord.id, action: 'APPROVE_PLAN_REOPEN' } }), 1);
    });

    await t.test('duplicate uses version 1, falls back to a blank BSC and keeps current organization', async () => {
      const sourceCycle = await cycle(6), targetCycle1 = await cycle(7), targetCycle2 = await cycle(8), targetCycle3 = await cycle(9), targetCycle4 = await cycle(10), targetCycle5 = await cycle(11);
      const source = await createBsc('DUP_SOURCE', employee, sourceCycle, null);
      await approvePlan(source);
      const reopen = await expectHttp(request(server).post(`/employee-bsc/${source.id}/reopen-requests`).set(auth(tokens.employee))
        .send({ stage: 'PLAN', reason: 'Draft target 150' }), 201);
      await expectHttp(request(server).post(`/employee-bsc/reopen-requests/${reopen.body.id}/approve`).set(auth(tokens.director)).send({}), 200);
      await expectHttp(request(server).patch(`/employee-bsc/${source.id}/items/${source.item.id}`).set(auth(tokens.employee)).send({ targetValue: 150 }), 200);
      const options = await expectHttp(request(server).get(`/employee-bsc/${source.id}/duplicate-options`).set(auth(tokens.employee)), 200);
      assert.equal(options.body.suggestedCycleId, targetCycle1.id);
      assert.equal(options.body.sourceVersion.versionNumber, 1);
      const first = await expectHttp(request(server).post(`/employee-bsc/${source.id}/duplicate`).set(auth(tokens.employee)).send({ targetCycleId: targetCycle1.id }), 201);
      assert.equal(first.body.plan_status, 'DRAFT'); assert.equal(first.body.evaluation_status, 'NOT_STARTED');
      assert.equal(first.body.source_bsc_id, source.id); assert.ok(first.body.source_bsc_version_id);
      assert.equal(Number(first.body.employee_bsc_items[0].target_value), 100);
      assert.equal(first.body.employee_bsc_items[0].actual_value, null); assert.equal(first.body.final_score, null);
      assert.equal(first.body.direct_manager_id, manager.id); assert.equal(first.body.department_id, department.id);
      await expectHttp(request(server).post(`/employee-bsc/${source.id}/plan/submit`).set(auth(tokens.employee)).send({}), 200);
      await expectHttp(request(server).post(`/employee-bsc/${source.id}/plan/approve`).set(auth(tokens.director)).send({}), 200);
      const second = await expectHttp(request(server).post(`/employee-bsc/${source.id}/duplicate`).set(auth(tokens.employee)).send({ targetCycleId: targetCycle2.id }), 201);
      assert.equal(Number(second.body.employee_bsc_items[0].target_value), 100);
      const duplicates = await Promise.all([0, 1].map(() => request(server).post(`/employee-bsc/${source.id}/duplicate`)
        .set(auth(tokens.employee)).send({ targetCycleId: targetCycle3.id })));
      httpAssertions += 2; assert.deepEqual(duplicates.map(row => row.status).sort(), [201, 409]);
      await expectHttp(request(server).post(`/employee-bsc/${source.id}/duplicate`).set(auth(tokens.employee)).send({ targetCycleId: targetCycle1.id }), 409);
      const blankSourceCycle = await cycle(1, 'OPEN', 2093), blankTargetCycle = await cycle(2, 'OPEN', 2093);
      const blankSource = await createBsc('DUP_BLANK_SOURCE', employee, blankSourceCycle, null);
      const blankOptions = await expectHttp(request(server).get(`/employee-bsc/${blankSource.id}/duplicate-options`).set(auth(tokens.employee)), 200);
      assert.equal(blankOptions.body.sourceVersion, null);
      const blankDuplicate = await expectHttp(request(server).post(`/employee-bsc/${blankSource.id}/duplicate`).set(auth(tokens.employee)).send({ targetCycleId: blankTargetCycle.id }), 201);
      assert.equal(blankDuplicate.body.source_bsc_version_id, null);
      assert.equal(blankDuplicate.body.employee_bsc_items.length, 0);
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      await prisma.manager_relationships.updateMany({
        where: { employee_id: employee.id, manager_id: manager.id, is_primary: true },
        data: { end_date: today },
      });
      await expectHttp(request(server).post(`/employee-bsc/${source.id}/duplicate`).set(auth(tokens.employee)).send({ targetCycleId: targetCycle4.id }), 201);
      await prisma.manager_relationships.updateMany({
        where: { employee_id: employee.id, manager_id: manager.id, is_primary: true },
        data: { end_date: new Date('2020-01-02T00:00:00Z') },
      });
      const withoutActiveManager = await expectHttp(request(server).post(`/employee-bsc/${source.id}/duplicate`).set(auth(tokens.employee)).send({ targetCycleId: targetCycle5.id }), 201);
      assert.equal(withoutActiveManager.body.direct_manager_id, manager.id);
    });

    await t.test('duplicate suggestion crosses year, skips CLOSED cycles and returns null without OPEN target', async () => {
      const december = await cycle(12, 'OPEN', 2100);
      const january = await cycle(1, 'OPEN', 2101);
      const february = await cycle(2, 'OPEN', 2101);
      const source = await createBsc('DUP_SUGGESTION', employee2, december, null);
      await approvePlan(source, tokens.employee2);
      const januaryOptions = await expectHttp(request(server).get(`/employee-bsc/${source.id}/duplicate-options`).set(auth(tokens.employee2)), 200);
      assert.equal(januaryOptions.body.suggestedCycleId, january.id);
      await prisma.bsc_cycles.update({ where: { id: january.id }, data: { status: 'CLOSED' } });
      const februaryOptions = await expectHttp(request(server).get(`/employee-bsc/${source.id}/duplicate-options`).set(auth(tokens.employee2)), 200);
      assert.equal(februaryOptions.body.suggestedCycleId, february.id);
      await prisma.bsc_cycles.update({ where: { id: february.id }, data: { status: 'CLOSED' } });
      const noOptions = await expectHttp(request(server).get(`/employee-bsc/${source.id}/duplicate-options`).set(auth(tokens.employee2)), 200);
      assert.equal(noOptions.body.suggestedCycleId, null);
      assert.deepEqual(noOptions.body.cycles, []);
    });

    await t.test('manager change does not change the assigned DIRECTOR reviewer and public payloads remain secret-free', async () => {
      const record = await createBsc('STALE', employee2, await cycle(12));
      await approvePlan(record, tokens.employee2);
      const reopen = await expectHttp(request(server).post(`/employee-bsc/${record.id}/reopen-requests`).set(auth(tokens.employee2))
        .send({ stage: 'PLAN', reason: 'Reviewer đổi' }), 201);
      await prisma.users.update({ where: { id: employee2.id }, data: { direct_manager_id: rootManager.id } });
      const approved = await expectHttp(request(server).post(`/employee-bsc/reopen-requests/${reopen.body.id}/approve`).set(auth(tokens.director)).send({}), 200);
      assert.equal(approved.body.status, 'APPROVED');
      const pending = await expectHttp(request(server).get('/employee-bsc/reopen-requests/pending?stage=PLAN&page=1&limit=10').set(auth(tokens.director)), 200);
      assert.ok(!pending.body.items.some((row: any) => row.id === reopen.body.id));
      assert.doesNotMatch(JSON.stringify(pending.body), /password|token|cookie|authorization|credential|user.?agent|ip.?address/i);
      const audits = await prisma.audit_logs.findMany({ where: { user_id: { in: ids.users } } });
      assert.doesNotMatch(JSON.stringify(audits), /password|token|cookie|authorization|credential|database_url/i);
      assert.ok(httpAssertions >= 45, `Expected at least 45 HTTP assertions, received ${httpAssertions}`);
      t.diagnostic(`HTTP assertions: ${httpAssertions}`);
    });
  } finally {
    if (app) await app.close();
    await cleanup();
    await assertClean();
    await prisma.$disconnect();
  }
});
