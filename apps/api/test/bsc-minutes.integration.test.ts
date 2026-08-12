import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/main';

const prisma = new PrismaClient();
const marker = `BSCMIN_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`.toUpperCase();
const password = 'BscMinutes!Test#1';
const created = { users: [] as string[], roles: [] as string[], permissions: [] as string[] };
const P = { CREATE: 'bsc.minutes.create', VIEW: 'bsc.minutes.view' } as const;

function safeDatabase() {
  try { return decodeURIComponent(new URL(process.env.TEST_DATABASE_URL ?? '').pathname.slice(1)).toLowerCase() === 'bsc_organization_test'; }
  catch { return false; }
}

async function cleanup() {
  await prisma.bsc_minutes.deleteMany({ where: { minutes_number: { startsWith: marker } } });
  if (created.users.length) await prisma.audit_logs.deleteMany({ where: { user_id: { in: created.users } } });
  await prisma.department_bsc.deleteMany({ where: { bsc_code: { startsWith: marker } } });
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

test('BSC minutes persistence integration', { skip: safeDatabase() ? false : 'TEST_DATABASE_URL must target bsc_organization_test' }, async (t) => {
  let app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
  try {
    await cleanup();
    const department = await prisma.departments.create({ data: { code: `${marker}_DEPT`, name: `${marker} Department` } });
    const position = await prisma.positions.create({ data: { code: `${marker}_POS`, name: `${marker} Position`, level: 1 } });
    for (const code of Object.values(P)) {
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
    const editorRole = await makeRole('EDITOR', [P.CREATE, P.VIEW]);
    const viewerRole = await makeRole('VIEWER', [P.VIEW]);
    const emptyGlobalRole = await makeRole('EMPTY_GLOBAL', []);
    const hash = await argon2.hash(password);
    const makeUser = async (name: string, scope: 'GLOBAL' | 'DEPARTMENT', role = editorRole) => {
      const user = await prisma.users.create({ data: {
        employee_code: `${marker}_${name}`, username: `${marker}_${name}`.toLowerCase(), full_name: name,
        email: `${marker.toLowerCase()}_${name.toLowerCase()}@example.test`, password_hash: hash,
        department_id: department.id, position_id: position.id,
      } });
      created.users.push(user.id);
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id, scope_type: scope, scope_id: scope === 'DEPARTMENT' ? department.id : null } });
      return user;
    };
    const director = await makeUser('DIRECTOR', 'GLOBAL');
    const viewer = await makeUser('VIEWER', 'GLOBAL', viewerRole);
    const departmentEditor = await makeUser('DEPARTMENT_EDITOR', 'DEPARTMENT');
    await prisma.user_roles.create({ data: { user_id: departmentEditor.id, role_id: emptyGlobalRole.id, scope_type: 'GLOBAL' } });
    const cycle = await prisma.bsc_cycles.create({ data: { code: `${marker}_C1`, name: `${marker} Cycle`, cycle_type: 'MONTH', year: 2099, month: 1, start_date: new Date('2099-01-01'), status: 'OPEN', created_by: director.id } });
    const otherCycle = await prisma.bsc_cycles.create({ data: { code: `${marker}_C2`, name: `${marker} Other`, cycle_type: 'MONTH', year: 2099, month: 2, start_date: new Date('2099-02-01'), status: 'OPEN', created_by: director.id } });
    const employeeBsc = await prisma.employee_bsc.create({ data: {
      bsc_code: `${marker}_EMP`, cycle_id: cycle.id, employee_id: director.id, department_id: department.id,
      position_id: position.id, created_by: director.id, plan_status: 'APPROVED', evaluation_status: 'APPROVED', final_score: 95, final_grade: 'A',
    } });
    const departmentBsc = await prisma.department_bsc.create({ data: {
      bsc_code: `${marker}_UNIT`, cycle_id: cycle.id, department_id: department.id, responsible_manager_id: director.id,
      reviewer_id: departmentEditor.id, created_by: director.id, plan_status: 'APPROVED', evaluation_status: 'APPROVED', total_score: 96, final_score: 96, final_grade: 'A',
    } });

    const started = await createApp(); app = started.app; await app.init(); const server = app.getHttpServer();
    const login = async (username: string) => (await request(server).post('/auth/login').send({ username, password }).expect(200)).body.accessToken as string;
    const directorToken = await login(director.username);
    const viewerToken = await login(viewer.username);
    const departmentToken = await login(departmentEditor.username);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const payload = {
      cycleId: cycle.id, number: `${marker}_01`, issuePlace: 'Vĩnh Long', date: '2099-01-20', startTime: '08:00', endTime: '10:00',
      location: 'B11.204', chairName: 'Hồ Minh Hải', secretaryName: 'Huỳnh Phương Linh', absentCount: 0,
      subject: 'Đánh giá BSC', meetingContent: 'Nội dung họp', nextMonthAssignment: 'Giao chỉ tiêu', conclusion: 'Thống nhất',
      snapshot: {
        rows: [{ id: employeeBsc.id, employeeName: 'Tên giả', selfScore: '1', selfGrade: 'D', unitScore: '95', unitGrade: 'A', explanation: '' }],
        collectiveRows: [{ id: departmentBsc.id, departmentName: 'Phòng giả', selfScore: '1', selfGrade: 'D', unitScore: '96', unitGrade: 'A', explanation: '' }],
      },
    };

    let minutesId = '';
    await t.test('creates, lists and reopens an immutable snapshot', async () => {
      const createdMinutes = await request(server).post('/bsc-minutes').set(auth(directorToken)).send(payload).expect(201);
      minutesId = createdMinutes.body.id;
      assert.equal(createdMinutes.body.secretary_name, 'Huỳnh Phương Linh');
      assert.equal(createdMinutes.body.version, 1);
      assert.equal(createdMinutes.body.snapshot.rows[0].id, employeeBsc.id);
      assert.equal(createdMinutes.body.snapshot.rows[0].employeeName, director.full_name);
      assert.equal(createdMinutes.body.snapshot.rows[0].selfScore, '95');
      assert.equal(createdMinutes.body.snapshot.rows[0].selfGrade, 'A');
      assert.equal(createdMinutes.body.snapshot.collectiveRows[0].departmentName, department.name);
      assert.equal(createdMinutes.body.snapshot.collectiveRows[0].selfScore, '96');
      const list = await request(server).get(`/bsc-minutes?cycleId=${cycle.id}`).set(auth(directorToken)).expect(200);
      assert.equal(list.body.total, 1);
      const detail = await request(server).get(`/bsc-minutes/${minutesId}`).set(auth(directorToken)).expect(200);
      assert.equal(detail.body.minutes_number, payload.number);
    });

    await t.test('updates with optimistic locking and rejects a stale version', async () => {
      await prisma.employee_bsc.update({ where: { id: employeeBsc.id }, data: { final_score: 70, final_grade: 'C' } });
      const updated = await request(server).patch(`/bsc-minutes/${minutesId}`).set(auth(directorToken)).send({ ...payload, conclusion: 'Kết luận mới', expectedVersion: 1 }).expect(200);
      assert.equal(updated.body.version, 2);
      assert.equal(updated.body.conclusion, 'Kết luận mới');
      assert.equal(updated.body.snapshot.rows[0].selfScore, '95');
      assert.equal(updated.body.snapshot.rows[0].selfGrade, 'A');
      assert.notEqual(updated.body.updated_at, updated.body.created_at);
      await request(server).patch(`/bsc-minutes/${minutesId}`).set(auth(directorToken)).send({ ...payload, expectedVersion: 1 }).expect(409);
      await request(server).patch(`/bsc-minutes/${minutesId}`).set(auth(directorToken)).send({ ...payload, cycleId: otherCycle.id, expectedVersion: 2 }).expect(400);
    });

    await t.test('rejects BSC rows from another cycle and department-only scope', async () => {
      await request(server).post('/bsc-minutes').set(auth(directorToken)).send({ ...payload, cycleId: otherCycle.id }).expect(400);
      await request(server).get('/bsc-minutes').set(auth(departmentToken)).expect(403);
      await request(server).post('/bsc-minutes').set(auth(departmentToken)).send(payload).expect(403);
    });

    await t.test('allows GLOBAL view-only access without allowing writes', async () => {
      await request(server).get('/bsc-minutes').set(auth(viewerToken)).expect(200);
      await request(server).get(`/bsc-minutes/${minutesId}`).set(auth(viewerToken)).expect(200);
      await request(server).post('/bsc-minutes').set(auth(viewerToken)).send(payload).expect(403);
    });

    await t.test('records print/PDF history and audit logs', async () => {
      const beforeOutput = await prisma.bsc_minutes.findUniqueOrThrow({ where: { id: minutesId } });
      await request(server).post(`/bsc-minutes/${minutesId}/output`).set(auth(directorToken)).send({ type: 'PRINT' }).expect(200);
      const pdf = await request(server).post(`/bsc-minutes/${minutesId}/output`).set(auth(directorToken)).send({ type: 'PDF' }).expect(200);
      assert.equal(pdf.body.print_count, 1);
      assert.equal(pdf.body.pdf_export_count, 1);
      assert.equal(new Date(pdf.body.updated_at).toISOString(), beforeOutput.updated_at.toISOString());
      assert.equal(await prisma.bsc_minutes_events.count({ where: { minutes_id: minutesId } }), 2);
      assert.equal(await prisma.audit_logs.count({ where: { entity_id: minutesId, module: 'bsc-minutes' } }), 4);
      const updateAudit = await prisma.audit_logs.findFirstOrThrow({ where: { entity_id: minutesId, action: 'BSC_MINUTES_UPDATED' } });
      assert.match(JSON.stringify(updateAudit.old_data), /Thống nhất/);
      assert.match(JSON.stringify(updateAudit.new_data), /Kết luận mới/);
      assert.match(JSON.stringify(updateAudit.new_data), /GLOBAL/);
    });
  } finally {
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  }
});
