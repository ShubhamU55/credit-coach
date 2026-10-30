import { defineConfig, devices } from '@playwright/test';

const FAKE_PORT = 54399;
const FAKE_URL = `http://127.0.0.1:${FAKE_PORT}`;

export default defineConfig({
  testDir: './e2e',
  // The fake Supabase keeps its state in memory, so the specs run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/fake-supabase.mjs',
      url: `${FAKE_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // NEXT_PUBLIC_* is inlined at build time, so the fake's URL is passed to the build too.
      command: 'pnpm build && pnpm start',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
      },
    },
  ],
});
