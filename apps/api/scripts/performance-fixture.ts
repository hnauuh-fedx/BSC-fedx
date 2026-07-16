import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { assertDisposableDatabase, assertFixturePrefix, databaseName } from './lib/database-safety';

const url = process.env.TEST_DATABASE_URL ?? '';
const prisma = new PrismaClient({ datasources: { db: { url } } });
const prefix = (process.env.PERF_FIXTURE_PREFIX ?? `BSCPERF_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`).toUpperCase();
const code = (suffix: string) => `${prefix}_${suffix}`.slice(0, 50);

async function cleanup() {
  assertDisposableDatabase(url, databaseName(url), 'performance');
  assertFixturePrefix(prefix, 'performance');
  const users = await prisma.users.findMany({ where: { employee_code: { startsWith: prefix } }, select: { id: true } });
  const ids = users.map((row) => row.id);
  if (ids.length) {
    await prisma.employee_bsc.deleteMany({ where: { employee_id: { in: ids } } });
    await prisma.manager_relationships.deleteMany({ where: { OR: [{ employee_id: { in: ids } }, { manager_id: { in: ids } }] } });
    await prisma.users.updateMany({ where: { direct_manager_id: { in: ids } }, data: { direct_manager_id: null } });
    await prisma.bsc_cycles.deleteMany({ where: { code: { startsWith: prefix } } });
    await prisma.users.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.bsc_cycles.deleteMany({ where: { code: { startsWith: prefix } } });
  await prisma.departments.deleteMany({ where: { code: { startsWith: prefix } } });
  await prisma.positions.deleteMany({ where: { code: { startsWith: prefix } } });
  const remaining = {
    users: await prisma.users.count({ where: { employee_code: { startsWith: prefix } } }),
    bscs: await prisma.employee_bsc.count({ where: { bsc_code: { startsWith: prefix } } }),
    cycles: await prisma.bsc_cycles.count({ where: { code: { startsWith: prefix } } }),
    departments: await prisma.departments.count({ where: { code: { startsWith: prefix } } }),
    positions: await prisma.positions.count({ where: { code: { startsWith: prefix } } }),
  };
  return { prefix, deletedUsers: ids.length, remaining, cleanupVerified: Object.values(remaining).every((count) => count === 0) };
}

async function seed() {
  assertDisposableDatabase(url, databaseName(url), 'performance'); assertFixturePrefix(prefix, 'performance');
  await cleanup();
  const hash = await argon2.hash(randomUUID());
  const department = await prisma.departments.create({ data: { code: code('DEPT'), name: `${prefix} performance` } });
  const position = await prisma.positions.create({ data: { code: code('POS'), name: `${prefix} performance`, level: 1 } });
  const manager = await prisma.users.create({ data: { employee_code: code('MANAGER'), full_name: `${prefix} manager`, email: `${prefix.toLowerCase()}_manager@perf.example.test`, password_hash: hash, department_id: department.id, position_id: position.id } });
  const employees = [];
  for (let i = 0; i < 100; i += 1) employees.push(await prisma.users.create({ data: { employee_code: code(`E${i}`), full_name: `${prefix} employee ${i}`, email: `${prefix.toLowerCase()}_e${i}@perf.example.test`, password_hash: hash, department_id: department.id, position_id: position.id, direct_manager_id: manager.id } }));
  const cycles = [];
  for (let i = 0; i < 10; i += 1) cycles.push(await prisma.bsc_cycles.create({ data: { code: code(`C${i}`), name: `${prefix} cycle ${i}`, cycle_type: 'MONTH', year: 2070 + i, month: 1, start_date: new Date(`${2070 + i}-01-01`), end_date: new Date(`${2070 + i}-01-31`), submission_deadline: new Date('2099-12-31'), status: 'OPEN', created_by: manager.id } }));
  let bscCount = 0; let itemCount = 0; let versionCount = 0; let pendingCount = 0;
  for (const [employeeIndex, employee] of employees.entries()) for (const [cycleIndex, cycle] of cycles.entries()) {
    const sequence = employeeIndex * cycles.length + cycleIndex;
    const variant = sequence % 4;
    const planStatus = variant === 0 ? 'DRAFT' : 'APPROVED';
    const evaluationStatus = variant === 0 ? 'NOT_STARTED' : variant === 1 ? 'DRAFT' : variant === 2 ? 'SUBMITTED' : 'APPROVED';
    const record = await prisma.employee_bsc.create({ data: { bsc_code: code(`B${employeeIndex}_${cycleIndex}`), cycle_id: cycle.id, employee_id: employee.id, department_id: department.id, position_id: position.id, direct_manager_id: manager.id, created_by: employee.id, status: evaluationStatus === 'APPROVED' ? 'APPROVED' : planStatus, plan_status: planStatus, evaluation_status: evaluationStatus, final_score: evaluationStatus === 'APPROVED' ? 90 : null, final_grade: evaluationStatus === 'APPROVED' ? 'A' : null } });
    await prisma.employee_bsc_items.createMany({ data: Array.from({ length: 5 }, (_, itemIndex) => ({ employee_bsc_id: record.id, kpi_code: code(`K${employeeIndex}_${cycleIndex}_${itemIndex}`), kpi_name: `Performance KPI ${itemIndex}`, target_value: 100, actual_value: variant === 0 ? null : 90, weight: 20, calculation_method: 'ACTUAL_DIV_TARGET', assigned_by: manager.id })) });
    if (planStatus === 'APPROVED') {
      await prisma.bsc_versions.create({ data: { employee_bsc_id: record.id, version_number: 1, stage: 'PLAN', version_type: 'PLAN_APPROVED', snapshot: { fixture: prefix }, created_by: manager.id } }); versionCount += 1;
    }
    if (evaluationStatus === 'APPROVED') {
      await prisma.bsc_versions.create({ data: { employee_bsc_id: record.id, version_number: 2, stage: 'EVALUATION', version_type: 'EVALUATION_APPROVED', snapshot: { fixture: prefix }, created_by: manager.id } }); versionCount += 1;
      if (sequence % 100 === 3) {
        await prisma.bsc_unlock_requests.create({ data: { employee_bsc_id: record.id, stage: 'EVALUATION', requested_by: employee.id, reviewer_id: manager.id, request_reason: 'Performance pending queue', status: 'PENDING' } }); pendingCount += 1;
      }
    }
    bscCount += 1; itemCount += 5;
  }
  console.log(JSON.stringify({ prefix, database: databaseName(url), users: 101, bscs: bscCount, items: itemCount, versions: versionCount, pendingReopen: pendingCount, cleanup: `PERF_FIXTURE_PREFIX=${prefix} npm run performance:cleanup --workspace=apps/api` }, null, 2));
}

async function main() { const cleanupMode = process.argv.includes('--cleanup'); try { cleanupMode ? console.log(JSON.stringify(await cleanup(), null, 2)) : await seed(); } catch (error) { if (!cleanupMode) await cleanup().catch(() => undefined); throw error; } finally { await prisma.$disconnect(); } }
void main();
