import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePanel } from '../RightPanel'

/** A window 1280 or wider: the panel is a column beside the content. */
function wide() {
    vi.spyOn(window, 'matchMedia').mockImplementation(
        (query) =>
            ({
                matches: true,
                media: query,
                addEventListener: () => undefined,
                removeEventListener: () => undefined
            }) as unknown as MediaQueryList
    )
}

describe('A right panel as a column (C-08)', () => {
    beforeEach(() => {
        localStorage.clear()
        wide()
    })
    afterEach(() => vi.restoreAllMocks())

    it('starts open, and remembers being closed', () => {
        const first = renderHook(() => usePanel('members'))
        expect(first.result.current[0].open).toBe(true)
        act(() => first.result.current[0].toggle())
        expect(renderHook(() => usePanel('members')).result.current[0].open).toBe(false)
    })

    it('starts closed when asked (the pins, SRS 1.71), and remembers being opened', () => {
        const first = renderHook(() => usePanel('pins', { startClosed: true }))
        expect(first.result.current[0].open).toBe(false)
        act(() => first.result.current[0].toggle())
        expect(first.result.current[0].open).toBe(true)
        expect(renderHook(() => usePanel('pins', { startClosed: true })).result.current[0].open).toBe(true)
    })
})
