import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type CodeDatabase = PrismaService | Prisma.TransactionClient;
type GeneratedCodeKind = 'USER' | 'DEPARTMENT' | 'BSC_CYCLE';

const CODE_PREFIXES: Record<GeneratedCodeKind, string> = {
  USER: 'NV',
  DEPARTMENT: 'DV',
  BSC_CYCLE: 'KY',
};

export async function generateCode(db: CodeDatabase, kind: GeneratedCodeKind): Promise<string> {
  let rows: Array<{ value: bigint }>;
  switch (kind) {
    case 'USER':
      rows = await db.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('users_employee_code_seq') AS value`;
      break;
    case 'DEPARTMENT':
      rows = await db.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('departments_code_seq') AS value`;
      break;
    case 'BSC_CYCLE':
      rows = await db.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('bsc_cycles_code_seq') AS value`;
      break;
  }

  return `${CODE_PREFIXES[kind]}${rows[0].value.toString().padStart(6, '0')}`;
}

export function isGeneratedCode(kind: GeneratedCodeKind, code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return normalized.startsWith(CODE_PREFIXES[kind])
    && /^\d+$/.test(normalized.slice(CODE_PREFIXES[kind].length));
}
