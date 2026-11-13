import { describe, expect, it, vi } from 'vitest'
import { emitRealtimeEvent, onRealtimeEvent } from '../lib/realtime-events'

describe('Listening to socket events', () => {
    it('hands each event to the listeners of its name only', () => {
        const created = vi.fn()
        const other = vi.fn()
        const stopCreated = onRealtimeEvent('message.created', created)
        const stopOther = onRealtimeEvent('channel.updated', other)

        emitRealtimeEvent('message.created', { nonce: 'n1' })

        expect(created).toHaveBeenCalledWith({ nonce: 'n1' })
        expect(other).not.toHaveBeenCalled()
        stopCreated()
        stopOther()
    })

    it('stops calling a listener once it unsubscribes', () => {
        const listener = vi.fn()
        const stop = onRealtimeEvent('message.created', listener)
        stop()

        emitRealtimeEvent('message.created', {})

        expect(listener).not.toHaveBeenCalled()
    })

    it('keeps telling the others when one listener throws', () => {
        const broken = vi.fn(() => {
            throw new Error('bug')
        })
        const fine = vi.fn()
        const stops = [onRealtimeEvent('ready', broken), onRealtimeEvent('ready', fine)]

        emitRealtimeEvent('ready', undefined)

        expect(fine).toHaveBeenCalled()
        stops.forEach((stop) => stop())
    })
})
