type Sample = { name: string; status: number; durationMs: number; ok: boolean };

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)].toFixed(2));
}

async function sample(name: string, url: string, init?: RequestInit): Promise<Sample> {
  const started = performance.now();
  try {
    const response = await fetch(url, init);
    await response.arrayBuffer();
    return { name, status: response.status, durationMs: performance.now() - started, ok: response.ok };
  } catch { return { name, status: 0, durationMs: performance.now() - started, ok: false }; }
}

async function main() {
  const baseUrl = process.env.PERF_BASE_URL;
  if (!baseUrl || !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[^/]*staging[^/]*)/i.test(baseUrl)) {
    throw new Error('PERF_BASE_URL must target localhost or a staging host.');
  }
  const concurrency = Math.min(100, Math.max(1, Number(process.env.PERF_CONCURRENCY ?? 50)));
  const iterations = Math.min(100, Math.max(1, Number(process.env.PERF_ITERATIONS ?? 20)));
  const headers: Record<string, string> = {};
  if (process.env.PERF_BEARER_TOKEN) headers.Authorization = `Bearer ${process.env.PERF_BEARER_TOKEN}`;
  const cases = [{ name: 'health-ready', path: '/health/ready' }];
  if (process.env.PERF_BEARER_TOKEN) {
    cases.push({ name: 'bsc-list', path: '/employee-bsc?limit=20' }, { name: 'pending-review', path: '/employee-bsc/pending-review?limit=20' }, { name: 'pending-reopen', path: '/employee-bsc/reopen-requests/pending?limit=20' });
    if (process.env.PERF_BSC_ID) {
      cases.push({ name: 'bsc-detail', path: `/employee-bsc/${process.env.PERF_BSC_ID}` }, { name: 'version-list', path: `/employee-bsc/${process.env.PERF_BSC_ID}/versions` });
    }
  }
  const all: Sample[] = [];
  const started = performance.now();
  const endpointSeconds: Record<string, number> = {};
  for (const endpoint of cases) {
    const endpointStarted = performance.now();
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const batch = await Promise.all(Array.from({ length: concurrency }, () => sample(endpoint.name, new URL(endpoint.path, baseUrl).toString(), { headers })));
      all.push(...batch);
    }
    endpointSeconds[endpoint.name] = (performance.now() - endpointStarted) / 1000;
  }
  const durationSeconds = (performance.now() - started) / 1000;
  const report = cases.map(({ name }) => {
    const rows = all.filter((row) => row.name === name); const durations = rows.map((row) => row.durationMs);
    return { name, requests: rows.length, p50Ms: percentile(durations, .5), p95Ms: percentile(durations, .95), p99Ms: percentile(durations, .99), errors: rows.filter((row) => !row.ok).length, throughputRps: Number((rows.length / endpointSeconds[name]).toFixed(2)), statuses: [...new Set(rows.map((row) => row.status))] };
  });
  console.log(JSON.stringify({ mode: 'SAFE_BASELINE_NO_SLA', concurrency, iterations, totalRequests: all.length, durationSeconds: Number(durationSeconds.toFixed(2)), endpoints: report }, null, 2));
  if (all.some((row) => !row.ok)) process.exitCode = 1;
}

void main();
