import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tones = { playTones: vi.fn() }
vi.mock('../tones', () => tones)

const { playCallEnd, startCallLoop } = await import('../call-sounds')

// DESIGN.md › Sound, D-241: the ring, the ringback and the end, made by the browser.
describe('the call sounds', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        tones.playTones.mockClear()
    })
    afterEach(() => vi.useRealTimers())

    it('rings two notes now and every 2 seconds until stopped', () => {
        const stop = startCallLoop('ring')
        expect(tones.playTones).toHaveBeenCalledTimes(1)
        expect(tones.playTones.mock.calls[0]?.[0]).toMatchObject({ notes: [659.3, 830.6], volume: 0.35 })
        vi.advanceTimersByTime(4000)
        expect(tones.playTones).toHaveBeenCalledTimes(3)
        stop()
        vi.advanceTimersByTime(4000)
        expect(tones.playTones).toHaveBeenCalledTimes(3)
    })

    it('rings back one quieter A4 every 3 seconds, and ends with two notes going down', () => {
        const stop = startCallLoop('ringback')
        expect(tones.playTones.mock.calls[0]?.[0]).toMatchObject({ notes: [440], length: 1, volume: 0.2 })
        vi.advanceTimersByTime(3000)
        expect(tones.playTones).toHaveBeenCalledTimes(2)
        stop()
        playCallEnd()
        expect(tones.playTones.mock.calls[2]?.[0]).toMatchObject({ notes: [659.3, 523.3], volume: 0.3 })
    })
})
