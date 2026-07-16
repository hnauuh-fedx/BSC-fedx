import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/main';

const runLiveDbTests = process.env.RUN_LIVE_DB_TESTS === '1';

const runTest = runLiveDbTests ? test : test.skip;

runTest('Live GET /health/ready call against PostgreSQL', async () => {
  const { app } = await createApp();

  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}/health/ready`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.deepEqual(body.database, { status: 'connected' });
  } finally {
    await app.close();
  }
});
