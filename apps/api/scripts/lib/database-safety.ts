export type DisposablePurpose = 'rehearsal' | 'restore' | 'uat' | 'performance';

const PATTERNS: Record<DisposablePurpose, RegExp> = {
  rehearsal: /^bsc_organization_test_rehearsal_[a-f0-9]{8}$/,
  restore: /^bsc_organization_test_restore_[a-f0-9]{8}$/,
  uat: /^bsc_organization_test(?:_uat_[a-f0-9]{8})?$/,
  performance: /^bsc_organization_test(?:_perf_[a-f0-9]{8})?$/,
};

export function databaseName(databaseUrl: string): string {
  let parsed: URL;
  try { parsed = new URL(databaseUrl); } catch { throw new Error('Database URL must be valid.'); }
  return decodeURIComponent(parsed.pathname.replace(/^\//, '')).toLowerCase();
}

export function assertDisposableDatabase(databaseUrl: string, confirmation: string, purpose: DisposablePurpose) {
  const name = databaseName(databaseUrl);
  if (name === 'bsc_db' || name.includes('prod') || name.includes('production') || !PATTERNS[purpose].test(name)) {
    throw new Error(`Unsafe ${purpose} database name: ${name || '(empty)'}`);
  }
  if (confirmation !== name) throw new Error(`Exact database confirmation is required for ${name}.`);
  return { name };
}

export function assertFixturePrefix(prefix: string, kind: 'uat' | 'performance'): string {
  const pattern = kind === 'uat' ? /^BSCUAT_\d+_[A-F0-9]{8}$/ : /^BSCPERF_\d+_[A-F0-9]{8}$/;
  if (!pattern.test(prefix)) throw new Error(`Unsafe ${kind} fixture prefix.`);
  return prefix;
}
