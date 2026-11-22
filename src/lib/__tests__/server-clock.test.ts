import { afterEach, describe, expect, it, vi } from 'vitest'
import { noteServerTime, serverNow } from '../server-clock'

afterEach(() => {
    vi.useRealTimers()
    noteServerTime(new Date().toISOString())
})

describe("the server's clock (D-18)", () => {
    it("keeps how far this machine's clock is from the server's, and counts on from it", () => {
        vi.useFakeTimers({ now: Date.parse('2026-11-22T14:47:00.000Z') })
        // This machine is 18 seconds behind.
        noteServerTime('2026-11-22T14:47:18.000Z')
        expect(serverNow()).toBe(Date.parse('2026-11-22T14:47:18.000Z'))
        vi.advanceTimersByTime(5000)
        expect(serverNow()).toBe(Date.parse('2026-11-22T14:47:23.000Z'))
    })

    it('ignores a time it cannot read, or none', () => {
        vi.useFakeTimers({ now: Date.parse('2026-11-22T14:47:00.000Z') })
        noteServerTime('2026-11-22T14:47:10.000Z')
        noteServerTime(null)
        noteServerTime(undefined)
        noteServerTime('not a time')
        expect(serverNow()).toBe(Date.parse('2026-11-22T14:47:10.000Z'))
    })
})
