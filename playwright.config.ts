import { defineConfig, devices } from '@playwright/test';
import { assertE2eDatabase } from './e2e/support/environment';

const testDatabaseUrl = assertE2eDatabase(process.env.TEST_DATABASE_URL);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/support/global-setup.ts',
  globalTeardown: './e2e/support/global-teardown.ts',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run start:e2e --workspace=apps/api',
      url: 'http://127.0.0.1:3100/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        API_PORT: '3100',
        DATABASE_URL: testDatabaseUrl,
        TEST_DATABASE_URL: testDatabaseUrl,
        CORS_ORIGIN: 'http://127.0.0.1:5173',
        REFRESH_COOKIE_PATH: '/api/auth',
      },
    },
    {
      command: 'npm run preview --workspace=apps/web -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173/login',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, VITE_API_PROXY_TARGET: 'http://127.0.0.1:3100' },
    },
  ],
});
