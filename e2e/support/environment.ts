const REQUIRED_DATABASE = 'bsc_organization_test';

export function assertE2eDatabase(value: string | undefined): string {
  if (!value) throw new Error('TEST_DATABASE_URL is required for browser E2E tests.');
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL.'); }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '')).toLowerCase();
  if (database !== REQUIRED_DATABASE) {
    throw new Error(`Browser E2E requires database "${REQUIRED_DATABASE}"; received "${database || '(empty)'}".`);
  }
  return value;
}
