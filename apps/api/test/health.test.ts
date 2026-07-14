import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, Controller, Get, Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { HealthModule } from '../src/health/health.module';
import { PrismaService } from '../src/database/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';

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

test('GET /health returns the expected shape when the database is healthy', async () => {
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
    assert.deepEqual(body.database, { status: 'connected' });
    assert.equal(typeof body.timestamp, 'string');
  } finally {
    await app.close();
  }
});

test('Global exception response shape matches the contract', async () => {
  const app = await NestFactory.create(HealthTestModule, { logger: false });
  app.useGlobalFilters(new GlobalExceptionFilter());

  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}/boom/validation`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.statusCode, 400);
    assert.equal(body.code, 'VALIDATION_ERROR');
    assert.equal(body.message, '\u0044\u1EEF li\u1EC7u kh\u00F4ng h\u1EE3p l\u1EC7');
    assert.deepEqual(body.details, []);
    assert.equal(typeof body.timestamp, 'string');
    assert.equal(body.path, '/boom/validation');
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
  } finally {
    await app.close();
  }
});
