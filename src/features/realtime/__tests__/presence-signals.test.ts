import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDLE_AFTER_MS, startPresenceSignals } from '../lib/presence-signals'

describe('What a tab tells about its presence (REQ-AUTH-07, ARCHITECTURE 3.3)', () => {
    let sent: [string, unknown][]
    let signals: ReturnType<typeof startPresenceSignals>
    const send = (event: string, data?: object) => void sent.push([event, data])
    const use = () => window.dispatchEvent(new KeyboardEvent('keydown'))

    beforeEach(() => {
        vi.useFakeTimers()
        sent = []
        signals = startPresenceSignals(send)
    })
    afterEach(() => {
        signals.stop()
        vi.useRealTimers()
    })

    it('beats when asked (at each ping of the server), not on a timer', () => {
        vi.advanceTimersByTime(60_000)
        expect(sent).toEqual([])
        signals.beat()
        expect(sent).toEqual([['heartbeat', undefined]])
    })

    it('says the tab is unused after 10 minutes without a key, a click or the mouse', () => {
        vi.advanceTimersByTime(IDLE_AFTER_MS - 1000)
        use()
        vi.advanceTimersByTime(IDLE_AFTER_MS - 1000)
        expect(sent.filter(([event]) => event === 'presence.idle')).toEqual([])

        vi.advanceTimersByTime(1000)
        expect(sent.filter(([event]) => event === 'presence.idle')).toEqual([['presence.idle', { idle: true }]])
    })

    it('says it is in use again at the first input, once', () => {
        vi.advanceTimersByTime(IDLE_AFTER_MS)
        use()
        use()
        expect(sent.filter(([event]) => event === 'presence.idle')).toEqual([
            ['presence.idle', { idle: true }],
            ['presence.idle', { idle: false }]
        ])
    })

    it('says it again to a new connection, which starts in use', () => {
        vi.advanceTimersByTime(IDLE_AFTER_MS)
        signals.ready()
        expect(sent.filter(([event]) => event === 'presence.idle')).toHaveLength(2)
    })

    it('stops listening once stopped', () => {
        signals.stop()
        vi.advanceTimersByTime(IDLE_AFTER_MS)
        use()
        expect(sent).toEqual([])
    })
})
