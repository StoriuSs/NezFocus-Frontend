import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import * as Sentry from '@sentry/react'

/**
 * The real SDK, with a transport that records what would be sent: what the
 * browser reports, and that nothing secret is in it.
 */
const bodies: string[] = []

vi.mock('@sentry/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@sentry/react')>()
    return {
        ...actual,
        init: (options: Parameters<typeof actual.init>[0]) =>
            actual.init({
                ...options,
                transport: (transportOptions) =>
                    actual.createTransport(transportOptions, async (request) => {
                        bodies.push(
                            typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body)
                        )
                        return { statusCode: 200 }
                    })
            })
    }
})

type Item = { type?: string } & Record<string, unknown>

/** Every event sent so far (envelopes are a header line, then item header and payload lines). */
function sentEvents(): Record<string, unknown>[] {
    return bodies.flatMap((body) => {
        const lines = body
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line) as Item)
        return lines.flatMap((line, i) => {
            const payload = lines[i + 1]
            return i > 0 && line.type === 'event' && payload ? [payload] : []
        })
    })
}

const exceptionValue = (event: Record<string, unknown>) => {
    const { values } = event.exception as { values: { value: string }[] }
    return values[values.length - 1]?.value
}

function Throws({ error }: { error: Error }): never {
    throw error
}

describe('error tracking with the real SDK', () => {
    let root: Root
    const container = document.createElement('div')

    beforeAll(async () => {
        vi.stubEnv('VITE_SENTRY_DSN', 'https://public@o1.ingest.us.sentry.io/2')
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const tracking = await import('@/lib/error-tracking')
        await tracking.initErrorTracking()
        tracking.setErrorTrackingUser('kc-subject-1')
        root = createRoot(container, tracking.rootErrorHandlers())
    })

    afterAll(async () => {
        act(() => root.unmount())
        await Sentry.close()
        vi.unstubAllEnvs()
    })

    it('reports a render error with its component stack, as the signed-in user, without secrets', async () => {
        // An OAuth sign-in can return with the code in the fragment.
        window.history.pushState(null, '', '/callback#state=s&session_state=x&code=secret-code')
        window.history.pushState(null, '', '/profile?access_token=secret-token&tab=1')

        const { ErrorBoundary } = await import('@/components/ErrorBoundary')
        act(() =>
            root.render(
                <ErrorBoundary>
                    <Throws error={new TypeError('profile render failed')} />
                </ErrorBoundary>
            )
        )
        await Sentry.flush(2000)

        const events = sentEvents()
        expect(events.map(exceptionValue)).toEqual(['profile render failed'])
        const sent = events[0]
        if (!sent) throw new Error('no event was sent')
        expect(sent.user).toEqual({ id: 'kc-subject-1' })
        // The component stack comes as a linked "React ErrorBoundary" exception.
        const linked = (sent.exception as { values: { type: string; stacktrace?: unknown }[] }).values[0]
        expect(linked?.type).toBe('React ErrorBoundary TypeError')
        expect(JSON.stringify(linked?.stacktrace)).toContain('Throws')
        expect((sent.request as { url: string }).url).toBe(
            'http://localhost:3000/profile?access_token=%5BREDACTED%5D&tab=1'
        )

        // The navigations were recorded, scrubbed.
        const navigations = (sent.breadcrumbs as { category: string; data?: object }[])
            .filter((crumb) => crumb.category === 'navigation')
            .map((crumb) => crumb.data)
        expect(navigations).toEqual(
            expect.arrayContaining([
                { from: '/', to: '/callback' },
                { from: '/callback', to: '/profile?access_token=%5BREDACTED%5D&tab=1' }
            ])
        )

        const everything = bodies.join('\n')
        expect(everything).not.toContain('secret-code')
        expect(everything).not.toContain('secret-token')
        expect(everything).not.toContain('session_state=x')
    })
})
