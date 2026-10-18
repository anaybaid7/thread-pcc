import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end: the real app in a real browser.
 *   saved     Next.js production server + THREAD API on an in-memory PostgreSQL (PGlite)
 *   practice  the static GitHub Pages build, served under /thread-pcc
 * Build first: `make e2e` does both builds and runs this.
 */
export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome', viewport: { width: 1360, height: 900 }, trace: 'retain-on-failure' },
  projects: [
    { name: 'saved', use: { baseURL: 'http://127.0.0.1:3010' }, testMatch: /saved\.spec\.ts/ },
    { name: 'practice', use: { baseURL: 'http://127.0.0.1:3011/thread-pcc/' }, testMatch: /practice\.spec\.ts/ },
    { name: 'phone', use: { ...devices['Pixel 7'], channel: process.env.CI ? undefined : 'chrome', baseURL: 'http://127.0.0.1:3011/thread-pcc/' }, testMatch: /practice\.spec\.ts/ },
  ],
  webServer: [
    { command: 'PORT=8010 PGLITE_DIR=memory npm run start -w server', url: 'http://127.0.0.1:8010/api/health', reuseExistingServer: false, cwd: '..', timeout: 60_000 },
    { command: 'npx next start --port 3010', url: 'http://127.0.0.1:3010', reuseExistingServer: false, cwd: '../web', timeout: 60_000 },
    { command: 'PORT=3011 node scripts/serve-static.mjs', url: 'http://127.0.0.1:3011/thread-pcc/', reuseExistingServer: false, cwd: '..', timeout: 30_000 },
  ],
})
