import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { assertDisposableDatabase, databaseName, DisposablePurpose } from './lib/database-safety';

const TABLES = ['users', 'departments', 'positions', 'bsc_cycles', 'employee_bsc', 'employee_bsc_items', 'bsc_reviews', 'bsc_status_histories', 'audit_logs', 'bsc_versions', 'bsc_unlock_requests'] as const;

function safeDiagnostic(value: unknown) {
  return String(value).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]').slice(0, 500);
}

function connectionArgs(url: URL) {
  return ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username), '-d', decodeURIComponent(url.pathname.slice(1))];
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, input?: Buffer) {
  const result = spawnSync(command, args, { env, input, stdio: input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${safeDiagnostic(result.stderr)}`);
}

function dockerPostgresTool(tool: 'pg_dump' | 'pg_restore', url: string, backup: string) {
  const parsed = new URL(url);
  const args = ['run', '--rm', '-i', '-e', 'PGPASSWORD', process.env.PG_TOOL_IMAGE ?? 'postgres:18-alpine', tool,
    '-h', ['localhost', '127.0.0.1'].includes(parsed.hostname) ? 'host.docker.internal' : parsed.hostname,
    '-p', parsed.port || '5432', '-U', decodeURIComponent(parsed.username), '-d', decodeURIComponent(parsed.pathname.slice(1)), '--no-owner'];
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) };
  if (tool === 'pg_dump') {
    const result = spawnSync('docker', [...args, '--format=custom'], { env, encoding: null, maxBuffer: 512 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`container pg_dump failed (${result.status}): ${safeDiagnostic(result.stderr)}`);
    writeFileSync(backup, result.stdout as Buffer);
  } else {
    const result = spawnSync('docker', [...args, '--no-privileges'], { env, input: readFileSync(backup), encoding: null, maxBuffer: 512 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`container pg_restore failed (${result.status}): ${safeDiagnostic(result.stderr)}`);
  }
}

async function counts(client: PrismaClient) {
  const result: Record<string, number> = {};
  for (const table of TABLES) {
    const rows = await client.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM "${table}"`);
    result[table] = Number(rows[0]?.count ?? 0);
  }
  return result;
}

async function operationalSnapshot(client: PrismaClient) {
  const [databaseSize, migrations, backfill, digest, duplicateVersions] = await Promise.all([
    client.$queryRaw<Array<{ bytes: bigint }>>`SELECT pg_database_size(current_database())::bigint AS bytes`,
    client.$queryRaw<Array<{ applied: bigint; failed: bigint }>>`SELECT
      COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::bigint AS applied,
      COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::bigint AS failed
      FROM "_prisma_migrations"`,
    client.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM bsc_workflow_backfill_issues`,
    client.$queryRaw<Array<{ digest: string }>>`SELECT md5(COALESCE(string_agg(concat_ws('|', id::text, employee_id::text,
      direct_manager_id::text, plan_status, evaluation_status, employee_total_score::text,
      manager_total_score::text, final_score::text, final_grade), E'\n' ORDER BY id), '')) AS digest FROM employee_bsc`,
    client.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM (
      SELECT employee_bsc_id, version_number FROM bsc_versions GROUP BY employee_bsc_id, version_number HAVING COUNT(*) > 1
    ) duplicates`,
  ]);
  return {
    databaseBytes: Number(databaseSize[0]?.bytes ?? 0),
    appliedMigrations: Number(migrations[0]?.applied ?? 0), failedMigrations: Number(migrations[0]?.failed ?? 0),
    backfillIssues: Number(backfill[0]?.count ?? 0), employeeBscInvariantDigest: digest[0]?.digest ?? '',
    duplicateVersions: Number(duplicateVersions[0]?.count ?? 0),
  };
}

async function main() {
  const started = Date.now();
  const source = process.env.TEST_DATABASE_URL;
  const mode = (process.argv.includes('--restore') ? 'restore' : 'rehearsal') as DisposablePurpose;
  if (!source || databaseName(source) !== 'bsc_organization_test') throw new Error('Source must be exact bsc_organization_test via TEST_DATABASE_URL.');
  const suffix = randomBytes(4).toString('hex');
  const targetName = `bsc_organization_test_${mode}_${suffix}`;
  assertDisposableDatabase(new URL(`/${targetName}`, source).toString(), targetName, mode);
  const sourceUrl = new URL(source); const targetUrl = new URL(source); targetUrl.pathname = `/${targetName}`;
  const sourcePgUrl = new URL(source); sourcePgUrl.searchParams.delete('schema');
  const targetPgUrl = new URL(targetUrl); targetPgUrl.searchParams.delete('schema');
  const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
  const work = mkdtempSync(path.join(tmpdir(), 'bsc-rehearsal-')); const backup = path.join(work, 'backup.dump');
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  const sourceClient = new PrismaClient({ datasources: { db: { url: source } } });
  let target: PrismaClient | undefined;
  let report: Record<string, unknown> | undefined;
  let cleanupVerified = false;
  try {
    const before = await counts(sourceClient);
    const beforeSnapshot = await operationalSnapshot(sourceClient);
    const useNativeTools = process.env.USE_NATIVE_PG_TOOLS === '1';
    if (useNativeTools) run('pg_dump', ['--format=custom', '--no-owner', '--file', backup, ...connectionArgs(sourcePgUrl)], { ...process.env, PGPASSWORD: decodeURIComponent(sourcePgUrl.password) });
    else dockerPostgresTool('pg_dump', sourcePgUrl.toString(), backup);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${targetName}"`);
    if (useNativeTools) run('pg_restore', ['--no-owner', '--no-privileges', ...connectionArgs(targetPgUrl), backup], { ...process.env, PGPASSWORD: decodeURIComponent(targetPgUrl.password) });
    else dockerPostgresTool('pg_restore', targetPgUrl.toString(), backup);
    const deploy = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, DATABASE_URL: targetUrl.toString() }, stdio: 'pipe', shell: process.platform === 'win32' });
    if (deploy.status !== 0) throw new Error(`prisma migrate deploy failed (${deploy.status}): ${safeDiagnostic(deploy.stderr)}`);
    target = new PrismaClient({ datasources: { db: { url: targetUrl.toString() } } });
    const after = await counts(target);
    const afterSnapshot = await operationalSnapshot(target);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Restored row counts differ from source.');
    if (afterSnapshot.failedMigrations !== 0) throw new Error('Restored database has pending/failed migrations.');
    if (beforeSnapshot.employeeBscInvariantDigest !== afterSnapshot.employeeBscInvariantDigest) throw new Error('BSC owner/reviewer/workflow/score invariant changed.');
    if (beforeSnapshot.backfillIssues !== afterSnapshot.backfillIssues) throw new Error('Backfill ambiguity count changed.');
    if (afterSnapshot.duplicateVersions !== 0) throw new Error('Duplicate BSC versions detected.');
    report = { mode: mode.toUpperCase(), source: 'bsc_organization_test', target: targetName, backupBytes: statSync(backup).size,
      durationMs: Date.now() - started, counts: { before, after }, operational: { before: beforeSnapshot, after: afterSnapshot },
      smoke: { organizationRead: true, bscRead: true, versionRead: true }, pendingMigrations: 0 };
  } finally {
    const cleanupErrors: unknown[] = [];
    await target?.$disconnect().catch((error) => cleanupErrors.push(error));
    await sourceClient.$disconnect().catch((error) => cleanupErrors.push(error));
    await admin.$queryRawUnsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${targetName}' AND pid <> pg_backend_pid()`).catch((error) => cleanupErrors.push(error));
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${targetName}"`).catch((error) => cleanupErrors.push(error));
    const [remaining] = await admin.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM pg_database WHERE datname = '${targetName}'`).catch((error) => { cleanupErrors.push(error); return [{ count: 1n }]; });
    cleanupVerified = Number(remaining?.count ?? 1) === 0;
    await admin.$disconnect().catch((error) => cleanupErrors.push(error));
    try { rmSync(work, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length) throw new Error(`Rehearsal cleanup failed in ${cleanupErrors.length} step(s).`);
  }
  if (report) console.log(JSON.stringify({ ...report, cleanupVerified }, null, 2));
}

if (require.main === module) void main();
