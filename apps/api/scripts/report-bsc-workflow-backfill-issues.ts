import { PrismaClient } from '@prisma/client';
import { databaseName } from './lib/database-safety';

export type BackfillIssue = {
  issue_id: string; issue_type: 'AMBIGUOUS_LEGACY_WORKFLOW'; employee_bsc_id: string;
  source_state: string; proposed_plan_status: string; proposed_evaluation_status: string;
  reason: string; resolved_status: 'UNRESOLVED'; resolution_note: null; created_at: Date;
};

export async function readBackfillIssues(prisma: PrismaClient): Promise<BackfillIssue[]> {
  return prisma.$queryRaw<BackfillIssue[]>`
    SELECT issue.employee_bsc_id AS issue_id,
      'AMBIGUOUS_LEGACY_WORKFLOW'::text AS issue_type,
      issue.employee_bsc_id,
      issue.legacy_status AS source_state,
      bsc.plan_status AS proposed_plan_status,
      bsc.evaluation_status AS proposed_evaluation_status,
      issue.reason,
      'UNRESOLVED'::text AS resolved_status,
      NULL::text AS resolution_note,
      issue.created_at
    FROM bsc_workflow_backfill_issues issue
    JOIN employee_bsc bsc ON bsc.id = issue.employee_bsc_id
    ORDER BY issue.created_at, issue.employee_bsc_id
  `;
}

async function main() {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required.');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const issues = await readBackfillIssues(prisma);
    console.log(JSON.stringify({ mode: 'READ_ONLY', database: databaseName(url), count: issues.length, issues }, null, 2));
    if (issues.length) process.exitCode = 2;
  } finally { await prisma.$disconnect(); }
}

if (require.main === module) void main();
