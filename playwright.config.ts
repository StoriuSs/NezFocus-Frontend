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
    // Voice rooms (M4): a fake microphone and camera, allowed without asking.
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }
            }
        },
        {
            name: 'firefox',
            // Study sessions need people in a LiveKit room, which Firefox's fake devices do not reach in Docker (M4 A3).
            testIgnore: 'study.spec.ts',
            use: {
                ...devices['Desktop Firefox'],
                launchOptions: {
                    firefoxUserPrefs: {
                        'media.navigator.streams.fake': true,
                        'media.navigator.permission.disabled': true
                    }
                }
            }
        }
    ]
})
