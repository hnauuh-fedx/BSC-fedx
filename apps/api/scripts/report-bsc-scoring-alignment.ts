import { Prisma, PrismaClient } from '@prisma/client';
import { BscClassificationService } from '../src/modules/employee-bsc/services/bsc-classification.service';
import { BscScoringService } from '../src/modules/employee-bsc/services/bsc-scoring.service';

const prisma = new PrismaClient();
const scoring = new BscScoringService(new BscClassificationService());

async function main() {
  type RecordRow = { id: string; bsc_code: string; status: string; final_score: Prisma.Decimal | null; final_grade: string | null };
  type ItemRow = { id: string; employee_bsc_id: string; calculation_method: string; target_value: Prisma.Decimal | null; actual_value: Prisma.Decimal | null; weight: Prisma.Decimal };
  // Use only columns shared by pre/post dual-stage schemas so this audit can run before migrations.
  const records = await prisma.$queryRaw<RecordRow[]>`
    SELECT id, bsc_code, status, final_score, final_grade
    FROM employee_bsc
    WHERE status = 'APPROVED' OR final_score IS NOT NULL
    ORDER BY id
  `;
  const recordIds = records.map((record) => record.id);
  const items = recordIds.length === 0 ? [] : await prisma.$queryRaw<ItemRow[]>`
    SELECT id, employee_bsc_id, calculation_method, target_value, actual_value, weight
    FROM employee_bsc_items
    WHERE employee_bsc_id IN (${Prisma.join(recordIds)})
    ORDER BY employee_bsc_id, id
  `;

  const report = records.map((record) => {
    const recalculated = scoring.scoreBsc(items.filter((item) => item.employee_bsc_id === record.id).map((item) => ({
      itemId: item.id,
      calculationMethod: item.calculation_method,
      targetValue: item.target_value,
      actualValue: item.actual_value,
      weight: item.weight,
    })));
    return {
      bscId: record.id,
      bscCode: record.bsc_code,
      legacyStatus: record.status,
      oldScore: record.final_score?.toString() ?? null,
      oldGrade: record.final_grade,
      newScore: recalculated.isComplete ? recalculated.totalWeightedScore : null,
      newGrade: recalculated.classification,
      isComplete: recalculated.isComplete,
      changed: record.final_score?.toString() !== (recalculated.isComplete ? String(recalculated.totalWeightedScore) : null)
        || record.final_grade !== recalculated.classification,
    };
  });
  console.log(JSON.stringify({ mode: 'DRY_RUN_READ_ONLY', count: report.length, changed: report.filter((row) => row.changed).length, records: report }, null, 2));
}

void main().finally(() => prisma.$disconnect());
