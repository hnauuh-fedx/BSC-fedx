import { Prisma, PrismaClient } from '@prisma/client';
import { BscClassificationService } from '../src/modules/employee-bsc/services/bsc-classification.service';

const prisma = new PrismaClient();
const classification = new BscClassificationService();

type GradeRow = {
  id: string;
  bsc_code: string;
  final_score: Prisma.Decimal | null;
  final_grade: string | null;
};

function assess(kind: 'EMPLOYEE' | 'DEPARTMENT', rows: GradeRow[]) {
  return rows.map((row) => {
    const proposedGrade = row.final_score === null ? null : classification.classify(row.final_score);
    return {
      kind,
      bscId: row.id,
      bscCode: row.bsc_code,
      finalScore: row.final_score?.toString() ?? null,
      currentGrade: row.final_grade,
      proposedGrade,
      changed: row.final_grade !== proposedGrade,
    };
  });
}

async function main() {
  const [employeeBsc, departmentBsc] = await Promise.all([
    prisma.employee_bsc.findMany({
      where: { evaluation_status: 'APPROVED' },
      select: { id: true, bsc_code: true, final_score: true, final_grade: true },
      orderBy: { id: 'asc' },
    }),
    prisma.department_bsc.findMany({
      where: { evaluation_status: 'APPROVED' },
      select: { id: true, bsc_code: true, final_score: true, final_grade: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  const records = [
    ...assess('EMPLOYEE', employeeBsc),
    ...assess('DEPARTMENT', departmentBsc),
  ];

  console.log(JSON.stringify({
    mode: 'DRY_RUN_READ_ONLY',
    scale: {
      D: 'score < 70',
      C: '70 <= score < 80',
      B: '80 <= score < 90',
      A: '90 <= score <= 100',
      'A+': 'score > 100',
    },
    count: records.length,
    changed: records.filter((record) => record.changed).length,
    records: records.filter((record) => record.changed),
  }, null, 2));
}

void main().finally(() => prisma.$disconnect());
