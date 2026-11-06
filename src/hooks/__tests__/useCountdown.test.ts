import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCountdown } from '@/hooks/useCountdown'

describe('useCountdown', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-10-18T21:47:00Z'))
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('counts whole seconds down to the moment, then stays at 0', async () => {
        const until = Date.now() + 41_500
        const { result } = renderHook(() => useCountdown(until))
        expect(result.current).toBe(42)

        await act(async () => {
            vi.advanceTimersByTime(1000)
        })
        expect(result.current).toBe(41)

        await act(async () => {
            vi.advanceTimersByTime(60_000)
        })
        expect(result.current).toBe(0)
    })

    it('is 0 without a moment, or with one already past', () => {
        expect(renderHook(() => useCountdown(null)).result.current).toBe(0)
        const past = Date.now() - 5000
        expect(renderHook(() => useCountdown(past)).result.current).toBe(0)
    })

    it('starts again from a new moment', async () => {
        const { result, rerender } = renderHook(({ until }) => useCountdown(until), {
            initialProps: { until: Date.now() + 10_000 }
        })
        await act(async () => {
            vi.advanceTimersByTime(8000)
        })
        expect(result.current).toBe(2)

        const later = Date.now() + 60_000
        rerender({ until: later })
        expect(result.current).toBe(60)
    })
})
