import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMediaQuery } from '@/hooks/useMediaQuery'

/** A matchMedia whose answer the test changes, telling listeners as a browser would. */
function fakeMatchMedia(initial: boolean) {
    let matches = initial
    const listeners = new Set<() => void>()
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((media: string) => ({
        get matches() {
            return matches
        },
        media,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener)
    }))
    return {
        set(next: boolean) {
            matches = next
            listeners.forEach((listener) => listener())
        },
        listenerCount: () => listeners.size,
        restore: () => (window.matchMedia = original)
    }
}

describe('useMediaQuery', () => {
    let media: ReturnType<typeof fakeMatchMedia>
    afterEach(() => media.restore())

    it('answers the query now, and again when the window changes', () => {
        media = fakeMatchMedia(false)
        const { result } = renderHook(() => useMediaQuery('(min-width: 1280px)'))
        expect(result.current).toBe(false)

        act(() => media.set(true))
        expect(result.current).toBe(true)
    })

    it('stops listening when unmounted', () => {
        media = fakeMatchMedia(true)
        const { unmount } = renderHook(() => useMediaQuery('(min-width: 1280px)'))
        expect(media.listenerCount()).toBe(1)
        unmount()
        expect(media.listenerCount()).toBe(0)
    })
})
