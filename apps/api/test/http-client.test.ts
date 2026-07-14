import assert from 'node:assert/strict';
import test from 'node:test';
import { configureHttpClient, httpClient } from '../../web/src/lib/http-client';

test('concurrent 401 responses share one refresh and retry once with the new memory token', async () => {
  const originalFetch = globalThis.fetch;
  let token = 'expired', refreshCalls = 0, protectedCalls = 0;
  globalThis.fetch = async (_input, init) => {
    protectedCalls += 1;
    const authorization = new Headers(init?.headers).get('Authorization');
    return authorization === 'Bearer current'
      ? new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  };
  configureHttpClient({ getAccessToken: () => token, refresh: async () => { refreshCalls += 1; await new Promise(resolve => setTimeout(resolve, 5)); token = 'current'; return token; }, onUnauthenticated: () => assert.fail('must stay authenticated') });
  try { const results = await Promise.all([httpClient.get<{ ok: boolean }>('/users'), httpClient.get<{ ok: boolean }>('/departments')]); assert.deepEqual(results, [{ ok: true }, { ok: true }]); assert.equal(refreshCalls, 1); assert.equal(protectedCalls, 4); }
  finally { configureHttpClient(null); globalThis.fetch = originalFetch; }
});

test('failed refresh clears auth without retry loop', async () => {
  const originalFetch = globalThis.fetch; let calls = 0, cleared = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } }); };
  configureHttpClient({ getAccessToken: () => 'expired', refresh: async () => null, onUnauthenticated: () => { cleared += 1; } });
  try { await assert.rejects(() => httpClient.get('/users')); assert.equal(calls, 1); assert.equal(cleared, 1); }
  finally { configureHttpClient(null); globalThis.fetch = originalFetch; }
});
