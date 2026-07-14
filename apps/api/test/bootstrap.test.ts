import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/main';

test('API application bootstrap', async () => {
  const { app, appConfig } = await createApp();

  try {
    assert.equal(typeof app.getHttpServer, 'function');
    assert.equal(appConfig.apiPort, Number(process.env.API_PORT));
  } finally {
    await app.close();
  }
});
