import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactText, resolveCorrelationId, sanitizeForLog } from '../src/common/observability/request-context';
import { assertDisposableDatabase, assertFixturePrefix } from '../scripts/lib/database-safety';
import { readBackfillIssues } from '../scripts/report-bsc-workflow-backfill-issues';

test('request correlation id accepts a safe incoming id and replaces unsafe values', () => {
  assert.equal(resolveCorrelationId('pilot-123'), 'pilot-123');
  assert.match(resolveCorrelationId('bad id with spaces'), /^[0-9a-f-]{36}$/);
});

test('UAT and performance cleanup require their own exact prefixes', () => {
  assert.equal(assertFixturePrefix('BSCUAT_123456_A1B2C3D4', 'uat'), 'BSCUAT_123456_A1B2C3D4');
  assert.equal(assertFixturePrefix('BSCPERF_123456_A1B2C3D4', 'performance'), 'BSCPERF_123456_A1B2C3D4');
  assert.throws(() => assertFixturePrefix('BSCUAT_', 'uat'), /Unsafe/);
  assert.throws(() => assertFixturePrefix('BSCUAT_123456_A1B2C3D4', 'performance'), /Unsafe/);
});

test('backfill issue report performs one read-only SELECT and supports zero issues', async () => {
  let query = '';
  const fake = { $queryRaw: async (strings: TemplateStringsArray) => { query = strings.join(''); return []; } };
  const issues = await readBackfillIssues(fake as never);
  assert.deepEqual(issues, []);
  assert.match(query, /^\s*SELECT/i);
  assert.doesNotMatch(query, /INSERT|UPDATE|DELETE|TRUNCATE/i);
});

test('log sanitizer recursively redacts credentials and secrets', () => {
  const sanitized = sanitizeForLog({
    password: 'secret', authorization: 'Bearer token', cookie: 'refresh=x', access_token: 'x', passwordHash: 'hash',
    nested: { database_url: 'postgresql://admin:pw@db/bsc', snapshot: { token: 'x' } },
    safe: 'ok',
  }) as Record<string, unknown>;
  assert.equal(sanitized.password, '[REDACTED]');
  assert.equal(sanitized.authorization, '[REDACTED]');
  assert.equal(sanitized.cookie, '[REDACTED]');
  assert.equal(sanitized.access_token, '[REDACTED]');
  assert.equal(sanitized.passwordHash, '[REDACTED]');
  assert.deepEqual(sanitized.nested, { database_url: '[REDACTED]', snapshot: '[REDACTED]' });
  assert.equal(sanitized.safe, 'ok');
});

test('free-text log redaction removes database URLs and bearer tokens', () => {
  const value = redactText('failed postgresql://admin:secret@db/private Authorization Bearer abc.def.ghi token=xyz');
  assert.doesNotMatch(value, /admin|secret@|abc\.def|xyz/);
});

test('destructive rehearsal guard only accepts an exact disposable database and confirmation', () => {
  const url = 'postgresql://user:secret@localhost:5432/bsc_organization_test_rehearsal_ab12cd34';
  assert.equal(assertDisposableDatabase(url, 'bsc_organization_test_rehearsal_ab12cd34', 'rehearsal').name, 'bsc_organization_test_rehearsal_ab12cd34');
  assert.throws(() => assertDisposableDatabase('postgresql://x:y@localhost/bsc_db', 'bsc_db', 'rehearsal'), /Unsafe/);
  assert.throws(() => assertDisposableDatabase(url, 'wrong', 'rehearsal'), /confirmation/i);
});
