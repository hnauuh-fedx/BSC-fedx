const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const env = {
  ...process.env,
  NODE_ENV: 'test',
  API_PORT: '3100',
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  CORS_ORIGIN: 'http://127.0.0.1:5173',
  REFRESH_COOKIE_PATH: '/api/auth',
  VITE_API_PROXY_TARGET: 'http://127.0.0.1:3100',
};

function start(args, cwd) {
  return spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true });
}

async function waitFor(url, process, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`E2E server exited early with code ${process.exitCode}: ${url}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for E2E server: ${url}`);
}

async function stop(process) {
  if (!process || process.exitCode !== null) return;
  const exited = new Promise((resolve) => process.once('exit', resolve));
  process.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (process.exitCode === null) process.kill('SIGKILL');
}

async function main() {
  let api;
  let web;
  try {
    api = start(['-r', 'ts-node/register/transpile-only', 'src/main.ts'], path.join(root, 'apps/api'));
    await waitFor('http://127.0.0.1:3100/health', api);
    web = start([path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5173'], path.join(root, 'apps/web'));
    await waitFor('http://127.0.0.1:5173/login', web);

    const playwright = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)], {
      cwd: root,
      env: { ...env, E2E_EXTERNAL_SERVERS: '1' },
      stdio: 'inherit',
      windowsHide: true,
    });
    const code = await new Promise((resolve, reject) => {
      playwright.once('error', reject);
      playwright.once('exit', (exitCode) => resolve(exitCode ?? 1));
    });
    process.exitCode = code;
  } finally {
    await stop(web);
    await stop(api);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
