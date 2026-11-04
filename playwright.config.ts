import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against this app, running:
 *
 *   E2E_BASE_URL=http://localhost:3001 pnpm test:e2e
 *
 * (default http://localhost:3001, the dev server). Run it against the
 * production image too: that is where the Content-Security-Policy applies.
 *
 * Every suite also needs the API and its Mailpit (docs/e2e-testing.md).
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: (process.env.E2E_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, ''),
        locale: 'en-US',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    // Firefox too: its CSP enforcement and navigation differ in the details.
    // Install with `pnpm exec playwright install chromium firefox`.
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } }
    ]
})
