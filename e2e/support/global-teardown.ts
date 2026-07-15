import { cleanupFixture, prisma, readState, removeState } from './fixture';

export default async function globalTeardown() {
  const db = prisma();
  try {
    let state;
    try { state = await readState(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    await cleanupFixture(db, state);
    await removeState();
  } finally { await db.$disconnect(); }
}
