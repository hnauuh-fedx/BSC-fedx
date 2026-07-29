import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/main';
import { DEPARTMENT_BSC_PERMISSIONS } from '../src/modules/department-bsc/department-bsc.permissions';

const prisma = new PrismaClient();
const marker = `DEPTBSC_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`.toUpperCase();
const password = 'DepartmentBsc!1';
const tracked = { users: [] as string[], roles: [] as string[], permissions: [] as string[] };

function safeDatabase(): boolean {
  try { return decodeURIComponent(new URL(process.env.TEST_DATABASE_URL ?? '').pathname.slice(1)).toLowerCase() === 'bsc_organization_test'; }
  catch { return false; }
}

async function cleanup() {
  const departments = await prisma.departments.findMany({ where: { code: { startsWith: marker } }, select: { id: true } });
  await prisma.department_bsc.deleteMany({ where: { department_id: { in: departments.map((row) => row.id) } } });
  await prisma.bsc_cycles.deleteMany({ where: { code: { startsWith: marker } } });
  if (tracked.users.length) {
    await prisma.audit_logs.deleteMany({ where: { user_id: { in: tracked.users } } });
    await prisma.department_manager_assignments.deleteMany({ where: { manager_id: { in: tracked.users } } });
    await prisma.auth_refresh_tokens.deleteMany({ where: { user_id: { in: tracked.users } } });
    await prisma.user_roles.deleteMany({ where: { user_id: { in: tracked.users } } });
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

test('department BSC is owned by the assigned department manager and reviewed by a director', { skip: safeDatabase() ? false : 'TEST_DATABASE_URL is not configured with exact bsc_organization_test' }, async (t) => {
  let app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
  try {
    await cleanup();
    const [department, outsideDepartment, position] = await Promise.all([
      prisma.departments.create({ data: { code: `${marker}_D1`, name: 'Phòng Kinh doanh' } }),
      prisma.departments.create({ data: { code: `${marker}_D2`, name: 'Phòng ngoài phạm vi' } }),
      prisma.positions.create({ data: { code: `${marker}_POS`, name: 'Trưởng phòng', level: 50 } }),
    ]);
    for (const code of Object.values(DEPARTMENT_BSC_PERMISSIONS)) {
      const existing = await prisma.permissions.findUnique({ where: { code } });
      const permission = await prisma.permissions.upsert({ where: { code }, create: { code, name: code, module: 'bsc' }, update: {} });
      if (!existing) tracked.permissions.push(permission.id);
    }
    const makeRole = async (code: string, permissions: string[]) => {
      const role = await prisma.roles.create({ data: { code: `${marker}_${code}`, name: code, hierarchy_level: 1, is_system: false } });
      tracked.roles.push(role.id);
      const rows = await prisma.permissions.findMany({ where: { code: { in: permissions } } });
      await prisma.role_permissions.createMany({ data: rows.map((row) => ({ role_id: role.id, permission_id: row.id })) });
      return role;
    };
    const managerRole = await makeRole('MANAGER', [DEPARTMENT_BSC_PERMISSIONS.CREATE, DEPARTMENT_BSC_PERMISSIONS.VIEW,
      DEPARTMENT_BSC_PERMISSIONS.EDIT, DEPARTMENT_BSC_PERMISSIONS.SUBMIT_PLAN, DEPARTMENT_BSC_PERMISSIONS.SUBMIT_EVALUATION,
      DEPARTMENT_BSC_PERMISSIONS.REQUEST_REOPEN, DEPARTMENT_BSC_PERMISSIONS.DUPLICATE, DEPARTMENT_BSC_PERMISSIONS.EXPORT]);
    const directorRole = await makeRole('DIRECTOR', [DEPARTMENT_BSC_PERMISSIONS.VIEW,
      DEPARTMENT_BSC_PERMISSIONS.APPROVE_PLAN, DEPARTMENT_BSC_PERMISSIONS.RETURN_PLAN,
      DEPARTMENT_BSC_PERMISSIONS.APPROVE_EVALUATION, DEPARTMENT_BSC_PERMISSIONS.RETURN_EVALUATION,
      DEPARTMENT_BSC_PERMISSIONS.REVIEW_REOPEN,
      'department.view', 'department.manage']);
    const hash = await argon2.hash(password);
    const makeUser = async (name: string, departmentId: string, roleId: string, scope: 'DEPARTMENT' | 'GLOBAL') => {
      const user = await prisma.users.create({ data: { employee_code: `${marker}_${name}`, username: String(`${marker}_${name}`).toLowerCase(), full_name: name,
        email: `${marker.toLowerCase()}_${name.toLowerCase()}@example.test`, password_hash: hash,
        department_id: departmentId, position_id: position.id } });
      tracked.users.push(user.id);
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: roleId, scope_type: scope,
        scope_id: scope === 'DEPARTMENT' ? departmentId : null } });
      return user;
    };
    const manager = await makeUser('MANAGER', department.id, managerRole.id, 'DEPARTMENT');
    const replacementManager = await makeUser('REPLACEMENT_MANAGER', department.id, managerRole.id, 'DEPARTMENT');
    const otherManager = await makeUser('OTHER_MANAGER', outsideDepartment.id, managerRole.id, 'DEPARTMENT');
    const director = await makeUser('DIRECTOR', department.id, directorRole.id, 'GLOBAL');
    const cycle = await prisma.bsc_cycles.create({ data: { code: `${marker}_CYCLE`, name: 'Tháng thử nghiệm', cycle_type: 'MONTH',
      year: 2099, month: 1, start_date: new Date('2020-01-01'), end_date: new Date('2199-12-31'), status: 'OPEN', created_by: director.id } });

    const created = await createApp(); app = created.app; await app.init();
    const server = app.getHttpServer();
    const login = async (username: string) => (await request(server).post('/auth/login').send({ username, password }).expect(200)).body.accessToken as string;
    const tokens = { manager: await login(manager.username), replacementManager: await login(replacementManager.username), otherManager: await login(otherManager.username), director: await login(director.username) };
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    await t.test('an authorized administrator records the active department manager assignment', async () => {
      const response = await request(server).post(`/departments/${department.id}/manager-assignment`).set(auth(tokens.director))
        .send({ managerId: manager.id, reason: 'Phân công trưởng phòng thử nghiệm' }).expect(201);
      assert.equal(response.body.manager_id, manager.id);
      const current = await request(server).get(`/departments/${department.id}/manager-assignment`).set(auth(tokens.director)).expect(200);
      assert.equal(current.body.manager.full_name, manager.full_name);
    });

    let bscId = '';
    let itemId = '';
    await t.test('only the assigned manager creates one BSC for the department and cycle', async () => {
      const response = await request(server).post('/department-bsc').set(auth(tokens.manager)).send({ cycleId: cycle.id }).expect(201);
      bscId = response.body.id;
      assert.equal(response.body.department_id, department.id);
      assert.equal(response.body.responsible_manager_id, manager.id);
      await request(server).post('/department-bsc').set(auth(tokens.manager)).send({ cycleId: cycle.id }).expect(409);
      await request(server).post('/department-bsc').set(auth(tokens.otherManager)).send({ cycleId: cycle.id }).expect(403);
    });

    await t.test('PLAN locks KPI definitions and the director is the only reviewer', async () => {
      await request(server).post(`/department-bsc/${bscId}/plan/submit`).set(auth(tokens.manager)).send({}).expect(400);
      const item = await request(server).post(`/department-bsc/${bscId}/items`).set(auth(tokens.manager)).send({
        kpiCode: 'DT', kpiName: 'Doanh thu phòng', targetValue: 100, weight: 100,
        description: 'Chi tieu doanh thu cua phong', goalGroupCode: 'COMMON',
        measurementUnit: 'VND', measurementFrequency: 'Thang', targetText: 'Dat muc tieu',
        calculationMethod: 'ACTUAL_DIV_TARGET', sortOrder: 7,
      }).expect(201);
      itemId = item.body.id;
      await request(server).post(`/department-bsc/${bscId}/plan/submit`).set(auth(tokens.manager)).send({}).expect(200);
      await request(server).post(`/department-bsc/${bscId}/items`).set(auth(tokens.manager)).send({
        kpiCode: 'LOCKED', kpiName: 'Khong duoc them', targetValue: 1, weight: 1,
      }).expect(403);
      await request(server).delete(`/department-bsc/${bscId}/items/${itemId}`).set(auth(tokens.manager)).expect(403);
      await request(server).patch(`/department-bsc/${bscId}/items/${itemId}`).set(auth(tokens.manager)).send({ targetValue: 120 }).expect(403);
      await request(server).post(`/department-bsc/${bscId}/plan/approve`).set(auth(tokens.manager)).send({}).expect(403);
      await request(server).post(`/department-bsc/${bscId}/plan/return`).set(auth(tokens.director)).send({ reason: '   ' }).expect(400);
      const returned = await request(server).post(`/department-bsc/${bscId}/plan/return`).set(auth(tokens.director))
        .send({ reason: 'Bo sung noi dung ke hoach' }).expect(200);
      assert.equal(returned.body.plan_status, 'RETURNED');
      await request(server).post(`/department-bsc/${bscId}/plan/approve`).set(auth(tokens.director)).send({}).expect(409);
      await request(server).patch(`/department-bsc/${bscId}/items/${itemId}`).set(auth(tokens.manager)).send({ targetValue: 100 }).expect(200);
      await request(server).post(`/department-bsc/${bscId}/plan/submit`).set(auth(tokens.manager)).send({}).expect(200);
      const approved = await request(server).post(`/department-bsc/${bscId}/plan/approve`).set(auth(tokens.director)).send({}).expect(200);
      assert.equal(approved.body.plan_status, 'APPROVED');
      assert.equal(approved.body.evaluation_status, 'DRAFT');
    });

    await t.test('EVALUATION calculates the official score only when the director approves', async () => {
      await request(server).post(`/department-bsc/${bscId}/evaluation/submit`).set(auth(tokens.manager)).send({}).expect(400);
      await request(server).patch(`/department-bsc/${bscId}/items/${itemId}/actual`).set(auth(tokens.manager))
        .send({ actualValue: 95, managerNote: 'Kết quả đã đối soát' }).expect(200);
      const submitted = await request(server).post(`/department-bsc/${bscId}/evaluation/submit`).set(auth(tokens.manager)).send({}).expect(200);
      assert.equal(submitted.body.final_score, null);
      await request(server).patch(`/department-bsc/${bscId}/items/${itemId}/actual`).set(auth(tokens.manager))
        .send({ actualValue: 99 }).expect(403);
      await request(server).post(`/department-bsc/${bscId}/evaluation/return`).set(auth(tokens.director)).send({ reason: '' }).expect(400);
      const returned = await request(server).post(`/department-bsc/${bscId}/evaluation/return`).set(auth(tokens.director))
        .send({ reason: 'Bo sung ket qua thuc hien' }).expect(200);
      assert.equal(returned.body.evaluation_status, 'RETURNED');
      await request(server).patch(`/department-bsc/${bscId}/items/${itemId}`).set(auth(tokens.manager)).send({ targetValue: 120 }).expect(403);
      await request(server).patch(`/department-bsc/${bscId}/items/${itemId}/actual`).set(auth(tokens.manager))
        .send({ actualValue: 95, managerNote: 'Da bo sung ket qua' }).expect(200);
      await request(server).post(`/department-bsc/${bscId}/evaluation/submit`).set(auth(tokens.manager)).send({}).expect(200);
      const approved = await request(server).post(`/department-bsc/${bscId}/evaluation/approve`).set(auth(tokens.director)).send({}).expect(200);
      assert.equal(approved.body.final_score, 100);
      assert.equal(approved.body.final_grade, 'A');
      const histories = await prisma.department_bsc_status_histories.count({ where: { department_bsc_id: bscId } });
      const versions = await prisma.department_bsc_versions.count({ where: { department_bsc_id: bscId } });
      assert.equal(histories, 8);
      assert.equal(versions, 8);
      const approvedVersion = await prisma.department_bsc_versions.findFirstOrThrow({ where: { department_bsc_id: bscId }, orderBy: { version_number: 'desc' } });
      const snapshot = approvedVersion.snapshot as { bsc: { evaluation_status: string; final_score: string | number | null }; items: Array<{ weighted_score: string | number }> };
      assert.equal(snapshot.bsc.evaluation_status, 'APPROVED');
      assert.equal(Number(snapshot.bsc.final_score), 100);
      assert.equal(Number(snapshot.items[0]?.weighted_score), 100);
      await request(server).patch(`/department-bsc/${bscId}/items/${itemId}`).set(auth(tokens.manager))
        .send({ targetValue: 120 }).expect(403);
      await request(server).patch(`/department-bsc/${bscId}/items/${itemId}/actual`).set(auth(tokens.manager))
        .send({ actualValue: 99 }).expect(403);
      await request(server).post(`/department-bsc/${bscId}/items`).set(auth(tokens.manager)).send({
        kpiCode: 'APPROVED', kpiName: 'Khong duoc them', targetValue: 1, weight: 1,
      }).expect(403);
      await request(server).delete(`/department-bsc/${bscId}/items/${itemId}`).set(auth(tokens.manager)).expect(403);
      const exported = await request(server).get(`/department-bsc/${bscId}/export`).set(auth(tokens.manager)).expect(200);
      assert.match(exported.headers['content-type'], /spreadsheetml/);
    });

    await t.test('reopen requires a request, director approval, audit history and a new snapshot', async () => {
      const reopen = await request(server).post(`/department-bsc/${bscId}/reopen-requests`).set(auth(tokens.manager))
        .send({ stage: 'EVALUATION', reason: 'Cập nhật kết quả đã đối soát lại' }).expect(201);
      const pending = await request(server).get('/department-bsc/reopen-requests/pending').set(auth(tokens.director)).expect(200);
      assert.equal(pending.body.some((row: { id: string }) => row.id === reopen.body.id), true);
      const approvedReopen = await request(server).post(`/department-bsc/reopen-requests/${reopen.body.id}/approve`).set(auth(tokens.director))
        .send({ reason: '<b>Dong y mo lai</b>' }).expect(200);
      assert.equal(approvedReopen.body.review_reason, 'Dong y mo lai');
      const detail = await request(server).get(`/department-bsc/${bscId}`).set(auth(tokens.manager)).expect(200);
      assert.equal(detail.body.evaluation_status, 'REOPENED');
      assert.equal(detail.body.final_score, null);
      assert.equal(await prisma.department_bsc_status_histories.count({ where: { department_bsc_id: bscId } }), 9);
      assert.equal(await prisma.department_bsc_versions.count({ where: { department_bsc_id: bscId } }), 9);
    });

    await t.test('a new active department manager receives an editable BSC handover', async () => {
      await request(server).post(`/departments/${department.id}/manager-assignment`).set(auth(tokens.director))
        .send({ managerId: replacementManager.id, reason: 'Thay đổi trưởng phòng giữa kỳ' }).expect(201);
      await request(server).patch(`/department-bsc/${bscId}/items/${itemId}/actual`).set(auth(tokens.manager))
        .send({ actualValue: 96 }).expect(403);
      await request(server).patch(`/department-bsc/${bscId}/items/${itemId}/actual`).set(auth(tokens.replacementManager))
        .send({ actualValue: 96, managerNote: 'Trưởng phòng mới tiếp nhận' }).expect(200);
      const row = await prisma.department_bsc.findUniqueOrThrow({ where: { id: bscId } });
      assert.equal(row.responsible_manager_id, replacementManager.id);
    });

    await t.test('concurrent review requests commit only one state transition and snapshot', async () => {
      await request(server).post(`/department-bsc/${bscId}/evaluation/submit`).set(auth(tokens.replacementManager)).send({}).expect(200);
      const beforeVersions = await prisma.department_bsc_versions.count({ where: { department_bsc_id: bscId } });
      const results = await Promise.all([
        request(server).post(`/department-bsc/${bscId}/evaluation/approve`).set(auth(tokens.director)).send({}),
        request(server).post(`/department-bsc/${bscId}/evaluation/approve`).set(auth(tokens.director)).send({}),
      ]);
      assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
      assert.equal(await prisma.department_bsc_versions.count({ where: { department_bsc_id: bscId } }), beforeVersions + 1);
    });

    await t.test('rejecting a reopen request requires a non-empty reason', async () => {
      const reopen = await request(server).post(`/department-bsc/${bscId}/reopen-requests`).set(auth(tokens.replacementManager))
        .send({ stage: 'EVALUATION', reason: 'Yêu cầu kiểm tra quy tắc từ chối' }).expect(201);
      await request(server).post(`/department-bsc/reopen-requests/${reopen.body.id}/reject`).set(auth(tokens.director))
        .send({ reason: '   ' }).expect(400);
      const pending = await prisma.department_bsc_unlock_requests.findUniqueOrThrow({ where: { id: reopen.body.id } });
      assert.equal(pending.status, 'PENDING');
      const rejected = await request(server).post(`/department-bsc/reopen-requests/${reopen.body.id}/reject`).set(auth(tokens.director))
        .send({ reason: 'Chưa đủ căn cứ điều chỉnh' }).expect(200);
      assert.equal(rejected.body.status, 'REJECTED');
      assert.equal(rejected.body.review_reason, 'Chưa đủ căn cứ điều chỉnh');
    });

    await t.test('duplicate uses the first approved PLAN version instead of later reopened edits', async () => {
      const reopen = await request(server).post(`/department-bsc/${bscId}/reopen-requests`).set(auth(tokens.replacementManager))
        .send({ stage: 'PLAN', reason: 'Điều chỉnh kế hoạch kỳ hiện tại' }).expect(201);
      await request(server).post(`/department-bsc/reopen-requests/${reopen.body.id}/approve`).set(auth(tokens.director)).send({}).expect(200);
      await request(server).patch(`/department-bsc/${bscId}/items/${itemId}`).set(auth(tokens.replacementManager))
        .send({ kpiName: 'KPI đã chỉnh sửa sau khi mở lại', targetValue: 150 }).expect(200);
      const targetCycle = await prisma.bsc_cycles.create({ data: { code: `${marker}_TARGET`, name: 'Tháng sao chép', cycle_type: 'MONTH',
        year: 2099, month: 2, start_date: new Date('2020-01-01'), end_date: new Date('2199-12-31'), status: 'OPEN', created_by: director.id } });
      const duplicated = await request(server).post(`/department-bsc/${bscId}/duplicate`).set(auth(tokens.replacementManager))
        .send({ targetCycleId: targetCycle.id }).expect(201);
      const detail = await request(server).get(`/department-bsc/${duplicated.body.id}`).set(auth(tokens.replacementManager)).expect(200);
      assert.equal(detail.body.plan_status, 'DRAFT');
      assert.equal(detail.body.evaluation_status, 'NOT_STARTED');
      assert.equal(detail.body.department_bsc_items[0].kpi_name, 'Doanh thu phòng');
      assert.equal(detail.body.department_bsc_items[0].description, 'Chi tieu doanh thu cua phong');
      assert.equal(detail.body.department_bsc_items[0].goal_group_code, 'COMMON');
      assert.equal(detail.body.department_bsc_items[0].measurement_unit, 'VND');
      assert.equal(detail.body.department_bsc_items[0].measurement_frequency, 'Thang');
      assert.equal(detail.body.department_bsc_items[0].target_value, 100);
      assert.equal(detail.body.department_bsc_items[0].target_text, 'Dat muc tieu');
      assert.equal(detail.body.department_bsc_items[0].weight, 100);
      assert.equal(detail.body.department_bsc_items[0].calculation_method, 'ACTUAL_DIV_TARGET');
      assert.equal(detail.body.department_bsc_items[0].sort_order, 7);
      assert.equal(detail.body.department_bsc_items[0].actual_value, null);
      assert.equal(detail.body.department_bsc_items[0].actual_text, null);
      assert.equal(detail.body.department_bsc_items[0].manager_note, null);
      assert.equal(detail.body.department_bsc_items[0].achievement_percent, 0);
      assert.equal(detail.body.department_bsc_items[0].weighted_score, 0);
    });

    await t.test('department BSC approval persists the new D and A+ boundaries', async () => {
      const approveWithActual = async (month: number, actualValue: number, expectedGrade: 'D' | 'A+') => {
        const gradeCycle = await prisma.bsc_cycles.create({ data: {
          code: `${marker}_GRADE_${month}`, name: `Tháng xếp loại ${month}`, cycle_type: 'MONTH',
          year: 2099, month, start_date: new Date('2020-01-01'), end_date: new Date('2199-12-31'),
          status: 'OPEN', created_by: director.id,
        } });
        const gradeBsc = await request(server).post('/department-bsc').set(auth(tokens.replacementManager))
          .send({ cycleId: gradeCycle.id }).expect(201);
        const gradeItem = await request(server).post(`/department-bsc/${gradeBsc.body.id}/items`).set(auth(tokens.replacementManager))
          .send({ kpiCode: `GRADE_${month}`, kpiName: `KPI xếp loại ${month}`, targetValue: 100, weight: 100 }).expect(201);
        await request(server).post(`/department-bsc/${gradeBsc.body.id}/plan/submit`).set(auth(tokens.replacementManager)).send({}).expect(200);
        await request(server).post(`/department-bsc/${gradeBsc.body.id}/plan/approve`).set(auth(tokens.director)).send({}).expect(200);
        await request(server).patch(`/department-bsc/${gradeBsc.body.id}/items/${gradeItem.body.id}/actual`).set(auth(tokens.replacementManager))
          .send({ actualValue }).expect(200);
        await request(server).post(`/department-bsc/${gradeBsc.body.id}/evaluation/submit`).set(auth(tokens.replacementManager)).send({}).expect(200);
        const approvedGrade = await request(server).post(`/department-bsc/${gradeBsc.body.id}/evaluation/approve`).set(auth(tokens.director)).send({}).expect(200);
        assert.equal(approvedGrade.body.final_grade, expectedGrade);
        const persisted = await prisma.department_bsc.findUniqueOrThrow({ where: { id: gradeBsc.body.id }, select: { final_grade: true } });
        assert.equal(persisted.final_grade, expectedGrade);
      };

      await approveWithActual(3, 60, 'D');
      await approveWithActual(4, 111, 'A+');
    });
  } finally {
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  }
});
