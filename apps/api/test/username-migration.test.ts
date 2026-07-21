import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';

function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;

  for (let index = 0; index < sql.length; index += 1) {
    if (sql.slice(index, index + 2) === '$$') {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      index += 1;
      continue;
    }

    const character = sql[index];
    current += character;
    if (character === ';' && !inDollarQuote) {
      statements.push(current.trim());
      current = '';
    }
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

test('username migration backfills valid unique values for adversarial legacy codes', {
  skip: process.env.RUN_LIVE_DB_TESTS !== '1',
}, async () => {
  const prisma = new PrismaClient();
  const addUsernameSql = await readFile(path.resolve(__dirname, '../prisma/migrations/20260721170000_add_username_login/migration.sql'), 'utf8');
  const enforceFormatSql = await readFile(path.resolve(__dirname, '../prisma/migrations/20260721171000_enforce_username_format/migration.sql'), 'utf8');

  try {
    const usernames = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "users" ("id" UUID PRIMARY KEY, "employee_code" VARCHAR(50) UNIQUE NOT NULL) ON COMMIT DROP');
      await tx.$executeRawUnsafe(`INSERT INTO "users" ("id", "employee_code") VALUES
        ('00000000-0000-4000-8000-000000000001', 'foo'),
        ('00000000-0000-4000-8000-000000000002', 'FOO'),
        ('00000000-0000-4000-8000-000000000003', 'foo_2'),
        ('00000000-0000-4000-8000-000000000004', '@@')`);
      for (const statement of splitSqlStatements(addUsernameSql)) await tx.$executeRawUnsafe(statement);
      for (const statement of splitSqlStatements(enforceFormatSql)) await tx.$executeRawUnsafe(statement);
      return tx.$queryRawUnsafe<Array<{ username: string }>>('SELECT "username" FROM "users" ORDER BY "id"');
    });

    assert.equal(new Set(usernames.map(item => item.username)).size, usernames.length);
    for (const { username } of usernames) assert.match(username, /^[a-z0-9._-]{3,50}$/);
    assert.deepEqual(usernames.slice(0, 3).map(item => item.username), ['foo', 'foo_2', 'foo_2_2']);
  } finally {
    await prisma.$disconnect();
  }
});
