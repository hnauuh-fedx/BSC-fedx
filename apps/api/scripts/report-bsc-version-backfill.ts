import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required.');
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

type CountRow = { count: bigint };

async function count(sql: TemplateStringsArray) {
  const [row] = await prisma.$queryRaw<CountRow[]>(sql);
  return Number(row?.count ?? 0);
}

async function main() {
  const parsed = new URL(databaseUrl!);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));

  const approvedPlanRecords = await count`SELECT COUNT(*)::bigint AS count FROM employee_bsc WHERE plan_status = 'APPROVED'`;
  const approvedEvaluationRecords = await count`SELECT COUNT(*)::bigint AS count FROM employee_bsc WHERE evaluation_status = 'APPROVED'`;
  const planVersionRecords = await count`SELECT COUNT(DISTINCT employee_bsc_id)::bigint AS count FROM bsc_versions WHERE version_type = 'PLAN_APPROVED'`;
  const evaluationVersionRecords = await count`SELECT COUNT(DISTINCT employee_bsc_id)::bigint AS count FROM bsc_versions WHERE version_type = 'EVALUATION_APPROVED'`;
  const backfilledPlanVersions = await count`SELECT COUNT(*)::bigint AS count FROM bsc_versions WHERE version_type = 'PLAN_APPROVED' AND snapshot->>'backfilled' = 'true'`;
  const backfilledEvaluationVersions = await count`SELECT COUNT(*)::bigint AS count FROM bsc_versions WHERE version_type = 'EVALUATION_APPROVED' AND snapshot->>'backfilled' = 'true'`;
  const ambiguousEvaluationVersions = await count`SELECT COUNT(*)::bigint AS count FROM bsc_versions WHERE version_type = 'EVALUATION_APPROVED' AND snapshot->>'backfillAmbiguous' = 'true'`;

  const missingPlanVersions = Math.max(0, approvedPlanRecords - planVersionRecords);
  const missingEvaluationVersions = Math.max(0, approvedEvaluationRecords - evaluationVersionRecords);
  console.log(JSON.stringify({
    mode: 'DRY_RUN_READ_ONLY',
    database: { host: parsed.hostname, port: parsed.port || '5432', name: database },
    approved: { plan: approvedPlanRecords, evaluation: approvedEvaluationRecords },
    versions: { planApprovedBscs: planVersionRecords, evaluationApprovedBscs: evaluationVersionRecords },
    backfilled: { plan: backfilledPlanVersions, evaluation: backfilledEvaluationVersions },
    ambiguous: { evaluation: ambiguousEvaluationVersions },
    missing: { plan: missingPlanVersions, evaluation: missingEvaluationVersions },
    status: missingPlanVersions === 0 && missingEvaluationVersions === 0 ? 'COMPLETE' : 'INCOMPLETE',
  }, null, 2));
  if (missingPlanVersions || missingEvaluationVersions) process.exitCode = 1;
}

void main().finally(() => prisma.$disconnect());
