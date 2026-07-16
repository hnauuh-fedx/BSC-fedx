import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, Controller, Get, Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { HealthModule } from '../src/health/health.module';
import { PrismaService } from '../src/database/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { requestContextMiddleware } from '../src/common/observability/request-context';

const prismaMock = {
  $queryRaw: async () => Promise.resolve([{ '?column?': 1 }]),
};

@Controller('boom')
class BoomController {
  @Get()
  boom(): never {
    throw new Error('unhandled');
  }

  @Get('validation')
  validation(): never {
    throw new BadRequestException();
  }
}

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: prismaMock }],
  exports: [PrismaService],
})
class PrismaMockModule {}

@Module({
  imports: [PrismaMockModule, HealthModule],
  controllers: [BoomController],
})
class HealthTestModule {}

test('GET /health is a lightweight liveness check and does not query the database', async () => {
  let queries = 0;
  prismaMock.$queryRaw = async () => { queries += 1; return [{ '?column?': 1 }]; };
  const app = await NestFactory.create(HealthTestModule, { logger: false });
  app.useGlobalFilters(new GlobalExceptionFilter());

  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.status, 'ok');
    assert.deepEqual(body, { status: 'ok' });
    assert.equal(queries, 0);
  } finally {
    prismaMock.$queryRaw = async () => [{ '?column?': 1 }];
    await app.close();
  }
});

test('GET /health/live is public and never queries the database', async () => {
  let queries = 0;
  prismaMock.$queryRaw = async () => { queries += 1; return [{ '?column?': 1 }]; };
  const app = await NestFactory.create(HealthTestModule, { logger: false });
  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/health/live`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.equal(queries, 0);
  } finally { await app.close(); }
});

test('GET /health/ready returns non-2xx without leaking database errors', async () => {
  prismaMock.$queryRaw = async () => { throw new Error('postgresql://admin:secret@db/private'); };
  const app = await NestFactory.create(HealthTestModule, { logger: false });
  app.useGlobalFilters(new GlobalExceptionFilter());
  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/health/ready`);
    const raw = await response.text();
    assert.equal(response.status, 503);
    assert.doesNotMatch(raw, /admin|secret|postgresql/i);
  } finally {
    prismaMock.$queryRaw = async () => [{ '?column?': 1 }];
    await app.close();
  }
});

test('Global exception response shape matches the contract', async () => {
  const app = await NestFactory.create(HealthTestModule, { logger: false });
  app.use(requestContextMiddleware({ log() {}, error() {} } as never));
  app.useGlobalFilters(new GlobalExceptionFilter());

  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}/boom/validation`, { headers: { 'x-correlation-id': 'uat-correlation-123' } });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.statusCode, 400);
    assert.equal(body.code, 'VALIDATION_ERROR');
    assert.equal(body.message, '\u0044\u1EEF li\u1EC7u kh\u00F4ng h\u1EE3p l\u1EC7');
    assert.deepEqual(body.details, []);
    assert.equal(typeof body.timestamp, 'string');
    assert.equal(body.path, '/boom/validation');
    assert.equal(body.correlationId, 'uat-correlation-123');
    assert.equal(response.headers.get('x-correlation-id'), 'uat-correlation-123');
  } finally {
    await app.close();
  }
});

test('Unknown errors are normalized without leaking stacks', async () => {
  const app = await NestFactory.create(HealthTestModule, { logger: false });
  app.useGlobalFilters(new GlobalExceptionFilter());

  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}/boom`);
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.statusCode, 500);
    assert.equal(body.code, 'INTERNAL_SERVER_ERROR');
    assert.equal(body.message, '\u004C\u1ED7i h\u1EC7 th\u1ED1ng');
    assert.deepEqual(body.details, []);
    assert.equal(typeof body.timestamp, 'string');
    assert.equal(body.path, '/boom');
    assert.equal(typeof body.correlationId, 'string');
  } finally {
    await app.close();
  }
});
