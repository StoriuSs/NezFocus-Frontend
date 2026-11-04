// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
    delete window.__APP_CONFIG__
    vi.unstubAllEnvs()
})

describe('env', () => {
    // Production images are built without addresses: the container writes them
    // into /config.js at start (nginx/40-runtime-config.sh).
    it('prefers the settings the container wrote into /config.js, ignoring an empty one', async () => {
        vi.stubEnv('VITE_API_URL', 'http://localhost:8888/api/v1')
        vi.stubEnv('VITE_SENTRY_DSN', 'https://build-key@o1.ingest.sentry.io/1')
        window.__APP_CONFIG__ = { VITE_API_URL: 'https://api.live.example/api/v1', VITE_SENTRY_DSN: '' }
        vi.resetModules()

        const { env } = await import('../env')

        expect(env.VITE_API_URL).toBe('https://api.live.example/api/v1')
        expect(env.VITE_SENTRY_DSN).toBe('https://build-key@o1.ingest.sentry.io/1')
    })
})
