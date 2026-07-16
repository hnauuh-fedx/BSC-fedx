import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateEnvironment } from '../src/config/env.validation';

const valid = {
  NODE_ENV: 'production',
  API_PORT: '3000',
  DATABASE_URL: 'postgresql://app:secret@db:5432/bsc_staging',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  REFRESH_COOKIE_SAME_SITE: 'lax',
  CORS_ORIGIN: 'https://bsc-staging.example.com',
  TRUST_PROXY: '1',
  LOG_LEVEL: 'info',
};

test('production environment accepts explicit non-placeholder secure values', () => {
  const env = validateEnvironment(valid);
  assert.equal(env.nodeEnv, 'production');
  assert.equal(env.databaseUrl, valid.DATABASE_URL);
});

for (const [name, override, message] of [
  ['placeholder secrets', { JWT_ACCESS_SECRET: '<change-me>' }, /JWT_ACCESS_SECRET/],
  ['short secrets', { JWT_REFRESH_SECRET: 'short' }, /JWT_REFRESH_SECRET/],
  ['production database name', { DATABASE_URL: 'postgresql://app:x@db/bsc_db' }, /production database/i],
  ['test database in production', { DATABASE_URL: 'postgresql://app:x@db/bsc_organization_test' }, /test database/i],
  ['wildcard credentialed CORS', { CORS_ORIGIN: '*' }, /CORS_ORIGIN/],
] as const) {
  test(`production environment rejects ${name}`, () => {
    assert.throws(() => validateEnvironment({ ...valid, ...override }), message);
  });
}

test('test environment fails closed when pointed at bsc_db', () => {
  assert.throws(() => validateEnvironment({ ...valid, NODE_ENV: 'test', DATABASE_URL: 'postgresql://app:x@db/bsc_db' }), /test environment.*bsc_db/i);
});

test('production environment requires distinct JWT secrets', () => {
  assert.throws(() => validateEnvironment({ ...valid, JWT_REFRESH_SECRET: valid.JWT_ACCESS_SECRET }), /must be different/);
});
