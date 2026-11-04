import { describe, expect, it, vi } from 'vitest'

describe('error tracking', () => {
    // Ad blockers block the Sentry SDK's chunk routinely: the app starts waiting
    // for it (main.tsx), so a failed load must not stop the app from starting.
    // 15s, not the default 5s: importing error-tracking evaluates a large
    // module graph, and once, on a machine busy with other test runs, it took
    // longer than 5s and the test timed out.
    it('lets the app start without error tracking when the SDK cannot be loaded', { timeout: 15_000 }, async () => {
        vi.stubEnv('VITE_SENTRY_DSN', 'https://public@o1.ingest.us.sentry.io/2')
        vi.doMock('@sentry/react', () => {
            throw new Error('Failed to fetch dynamically imported module')
        })
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
        const tracking = await import('@/lib/error-tracking')

        await expect(tracking.initErrorTracking()).resolves.toBeUndefined()
        expect(tracking.rootErrorHandlers()).toEqual({})
        expect(() => tracking.reportError(new TypeError('boom'))).not.toThrow()
        expect(errors).toHaveBeenCalled()
    })
})
