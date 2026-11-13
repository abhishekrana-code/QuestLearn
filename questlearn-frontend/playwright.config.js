import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke suite configuration.
 *
 * <p>The backend is deliberately not started from here: it needs a database and a
 * jar, and a config file is the wrong place to hide that. `npm run test:e2e`
 * expects the API on :8091 and the dev server on :5180 (the spec checks the API and
 * fails with a plain message if it is missing). In CI the workflow starts both.</p>
 */
export default defineConfig({
  testDir: './e2e',
  // One worker: the spec registers an account and mutates shared demo courses.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5180',
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5180 --strictPort',
    url: 'http://localhost:5180',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
