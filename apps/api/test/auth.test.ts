import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as argon2 from 'argon2';
import request from 'supertest';
import { Global, Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { PrismaService } from '../src/database/prisma.service';
import { AuthController } from '../src/modules/auth/controllers/auth.controller';
import { AuthRepository } from '../src/modules/auth/repositories/auth.repository';
import { AuthService } from '../src/modules/auth/services/auth.service';
import { JwtAccessGuard } from '../src/modules/auth/guards/jwt-access.guard';
import { JwtAccessStrategy } from '../src/modules/auth/strategies/jwt-access.strategy';

process.env.NODE_ENV = 'test';
process.env.API_PORT = '3001';
process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars!';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.CORS_ORIGIN = 'http://localhost:5173';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as typeof import('cookie-parser');
const password = 'Correct!Horse#1';

async function createApp() {
  const passwordHash = await argon2.hash(password);
  const user = { id: 'user-uuid-1', employee_code: 'EMP001', full_name: 'Test User', email: 'user@example.test', password_hash: passwordHash, status: 'ACTIVE', deleted_at: null, department_id: 'd1', position_id: 'p1', user_roles_user_roles_user_idTousers: [] as Array<never> };
  let storedHash = '';
  let storedJti = '';
  let revoked = false;
  const auditPayloads: unknown[] = [];
  const prisma = {
    users: { findUnique: async () => user, update: async () => ({}) },
    auth_refresh_tokens: {
      create: async ({ data }: { data: { token_hash: string; jti: string } }) => { storedHash = data.token_hash; storedJti = data.jti; return {}; },
      findUnique: async () => ({ jti: storedJti, token_hash: storedHash, user_id: user.id, expires_at: new Date(Date.now() + 86_400_000), revoked_at: revoked ? new Date() : null }),
      update: async () => { revoked = true; return {}; }, updateMany: async () => ({}),
    },
    audit_logs: { create: async ({ data }: { data: unknown }) => { auditPayloads.push(data); return {}; } },
  };
  @Global()
  @Module({ providers: [{ provide: PrismaService, useValue: prisma }], exports: [PrismaService] })
  class PrismaMockModule {}
  @Module({ imports: [PrismaMockModule, PassportModule.register({ defaultStrategy: 'jwt-access' }), JwtModule.register({})], controllers: [AuthController], providers: [AuthService, AuthRepository, JwtAccessStrategy, JwtAccessGuard] })
  class TestAuthModule {}
  const app = await NestFactory.create(TestAuthModule, { logger: false });
  app.use(cookieParser()); app.useGlobalFilters(new GlobalExceptionFilter()); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return { app, agent: request.agent(app.getHttpServer()), user, getStoredHash: () => storedHash, auditPayloads };
}

function cookie(response: request.Response): string {
  const value = response.headers['set-cookie']?.[0];
  assert.ok(value, 'login must set a refresh cookie');
  return value;
}

test('login only returns access data and writes an HttpOnly refresh cookie', async () => {
  const { app, agent, user, getStoredHash } = await createApp();
  try {
    const response = await agent.post('/auth/login').send({ email: user.email, password }).expect(200);
    assert.equal(typeof response.body.accessToken, 'string');
    for (const forbidden of ['refreshToken', 'password_hash', 'token_hash']) assert.equal(JSON.stringify(response.body).includes(forbidden), false);
    const setCookie = cookie(response);
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Lax/); assert.match(setCookie, /Path=\/auth/);
    const rawToken = /^refresh_token=([^;]+)/.exec(setCookie)?.[1];
    assert.ok(rawToken); assert.notEqual(getStoredHash(), rawToken); assert.equal(await argon2.verify(getStoredHash(), rawToken), true);
  } finally { await app.close(); }
});

test('agent refreshes through cookie, logout clears it, and revoked token cannot refresh', async () => {
  const { app, agent, user } = await createApp();
  try {
    await agent.post('/auth/login').send({ email: user.email, password }).expect(200);
    const refreshed = await agent.post('/auth/refresh').set('Origin', 'http://localhost:5173').expect(200);
    const logout = await agent.post('/auth/logout').set('Origin', 'http://localhost:5173').set('Authorization', `Bearer ${refreshed.body.accessToken}`).expect(200);
    const cleared = logout.headers['set-cookie']?.[0] ?? '';
    assert.match(cleared, /refresh_token=;/); assert.match(cleared, /HttpOnly/); assert.match(cleared, /SameSite=Lax/); assert.match(cleared, /Path=\/auth/);
    await agent.post('/auth/refresh').set('Origin', 'http://localhost:5173').expect(401);
  } finally { await app.close(); }
});

test('refresh requires an exact allowed Origin or Referer', async () => {
  const { app, agent, user } = await createApp();
  try {
    await agent.post('/auth/login').send({ email: user.email, password }).expect(200);
    await agent.post('/auth/refresh').set('Origin', 'http://localhost:5173').expect(200);
    await agent.post('/auth/refresh').set('Referer', 'http://localhost:5173/login').expect(200);
    await agent.post('/auth/refresh').set('Origin', 'http://localhost:5173.attacker.test').expect(403);
    await agent.post('/auth/refresh').set('Origin', 'http://attacker.test').expect(403);
    await agent.post('/auth/refresh').set('Origin', 'not a url').expect(403);
  } finally { await app.close(); }
});

test('production requires Origin or Referer and marks refresh cookie Secure', async () => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  const { app, agent, user } = await createApp();
  try {
    const login = await agent.post('/auth/login').send({ email: user.email, password }).expect(200);
    assert.match(cookie(login), /Secure/);
    await agent.post('/auth/refresh').set('Cookie', cookie(login).split(';')[0]).expect(403);
    const logout = await request(app.getHttpServer()).post('/auth/logout').set('Origin', 'http://localhost:5173').set('Cookie', cookie(login).split(';')[0]).set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    assert.match(logout.headers['set-cookie'][0] as string, /Secure/); assert.match(logout.headers['set-cookie'][0] as string, /SameSite=Lax/); assert.match(logout.headers['set-cookie'][0] as string, /Path=\/auth/);
  } finally { await app.close(); process.env.NODE_ENV = previous; }
});

test('rate limiter returns 429, expires entries, and disposes the cleanup timer', async () => {
  const previousMax = process.env.RATE_LIMIT_MAX_ATTEMPTS; const previousWindow = process.env.RATE_LIMIT_WINDOW_MS;
  process.env.RATE_LIMIT_MAX_ATTEMPTS = '1'; process.env.RATE_LIMIT_WINDOW_MS = '250';
  const { app, agent } = await createApp();
  try {
    await agent.post('/auth/login').send({ email: 'wrong@example.test', password: 'wrong' }).expect(401);
    await agent.post('/auth/login').send({ email: 'wrong@example.test', password: 'wrong' }).expect(429);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await agent.post('/auth/login').send({ email: 'wrong@example.test', password: 'wrong' }).expect(401);
    const service = app.get(AuthService); service.cleanupExpiredRateLimits(Date.now() + 10);
    const timer = (service as unknown as { rateLimitCleanupTimer: NodeJS.Timeout }).rateLimitCleanupTimer;
    await app.close(); assert.equal((timer as unknown as { _destroyed?: boolean })._destroyed, true);
  } finally { if (app) await app.close().catch(() => undefined); process.env.RATE_LIMIT_MAX_ATTEMPTS = previousMax; process.env.RATE_LIMIT_WINDOW_MS = previousWindow; }
});

test('audit payloads never include a password or token', async () => {
  const { app, agent, auditPayloads } = await createApp();
  try {
    await agent.post('/auth/login').send({ email: 'wrong@example.test', password: 'do-not-log-me' }).expect(401);
    const serialized = JSON.stringify(auditPayloads);
    for (const secret of ['do-not-log-me', 'password', 'token', 'refresh_token']) assert.equal(serialized.includes(secret), false);
  } finally { await app.close(); }
});
