import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMinuteClock } from '@/hooks/useMinuteClock'

describe('useMinuteClock', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-10-18T14:47:30Z'))
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('moves on as each new minute starts, not before', () => {
        const { result } = renderHook(() => useMinuteClock())
        expect(result.current.getUTCMinutes()).toBe(47)

        act(() => {
            vi.advanceTimersByTime(29_000)
        })
        expect(result.current.getUTCMinutes()).toBe(47)

        act(() => {
            vi.advanceTimersByTime(1_000)
        })
        expect(result.current.getUTCMinutes()).toBe(48)

        act(() => {
            vi.advanceTimersByTime(60_000)
        })
        expect(result.current.getUTCMinutes()).toBe(49)
    })

    it('stops when the component goes away', () => {
        const { unmount } = renderHook(() => useMinuteClock())
        unmount()
        expect(vi.getTimerCount()).toBe(0)
    })
})
