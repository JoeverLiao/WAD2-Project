import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://localhost:5173'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,

  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', {
      outputFolder: 'playwright-report',
      open: 'never',
    }],
  ],

  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    timezoneId: 'Asia/Singapore',
    locale: 'en-SG',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'auth',
      testMatch: '**/auth.spec.js',
    },
    {
      name: 'chromium',
      testIgnore: '**/auth.spec.js',
      dependencies: ['auth'],
    },
  ],

  // Start Express separately on port 3000.
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})