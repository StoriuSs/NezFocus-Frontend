import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectionBanner } from '../lib/connection-banner'
import { useRealtimeStore } from '../realtime.store'

describe('Which connection Banner shows (S-SHELL-01, C-16)', () => {
    const NOW = 1_000_000
    const online = { browserOnline: true, socket: 'connected' as const, downSince: null }

    it('shows none while connected, or while first loading', () => {
        expect(connectionBanner(online, NOW)).toBeNull()
        expect(connectionBanner({ ...online, socket: 'idle' }, NOW)).toBeNull()
    })

    it('shows reconnecting only once the socket has been down 3 seconds', () => {
        expect(connectionBanner({ browserOnline: true, socket: 'down', downSince: NOW - 2999 }, NOW)).toBeNull()
        expect(connectionBanner({ browserOnline: true, socket: 'down', downSince: NOW - 3000 }, NOW)).toBe(
            'reconnecting'
        )
    })

    it('shows offline when the browser has no network, never both', () => {
        expect(connectionBanner({ ...online, browserOnline: false }, NOW)).toBe('offline')
        expect(connectionBanner({ browserOnline: false, socket: 'down', downSince: NOW - 60_000 }, NOW)).toBe('offline')
    })
})

describe('The connection state', () => {
    beforeEach(() => useRealtimeStore.getState().reset())
    afterEach(() => vi.useRealTimers())

    it('remembers when the socket first went down, not each later failure', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1000)
        useRealtimeStore.getState().setSocket('down')
        vi.setSystemTime(5000)
        useRealtimeStore.getState().setSocket('down')
        expect(useRealtimeStore.getState().downSince).toBe(1000)

        useRealtimeStore.getState().setSocket('connected')
        expect(useRealtimeStore.getState()).toMatchObject({ socket: 'connected', downSince: null })
    })

    it('follows the browser online and offline, and starts afresh on reset', () => {
        useRealtimeStore.getState().setBrowserOnline(false)
        useRealtimeStore.getState().setSocket('connected')
        useRealtimeStore.getState().reset()
        expect(useRealtimeStore.getState()).toMatchObject({ socket: 'idle', downSince: null, browserOnline: true })
    })
})
