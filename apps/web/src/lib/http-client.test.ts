import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureHttpClient, httpClient } from './http-client';

describe('httpClient', () => {
  afterEach(() => {
    configureHttpClient(null);
    vi.unstubAllGlobals();
  });

  it('accepts a successful response with an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    await expect(httpClient.get('/departments/department-id/manager-assignment')).resolves.toBeUndefined();
  });

  it('parses a successful JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'department-id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    await expect(httpClient.get<{ id: string }>('/departments/department-id')).resolves.toEqual({ id: 'department-id' });
  });
});
