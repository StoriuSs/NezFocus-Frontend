import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDocumentTitle, useTitleClock, useTitleCount } from '../useDocumentTitle'

describe('useDocumentTitle (X-01)', () => {
    it('shows the page with the product after it, and the product alone once the page closes', () => {
        const { unmount } = renderHook(() => useDocumentTitle('Sign in'))
        expect(document.title).toBe('Sign in · NezFocus')
        unmount()
        expect(document.title).toBe('NezFocus')
    })

    it('shows the product alone while the page has no title yet, then follows it', () => {
        const { rerender } = renderHook(({ title }: { title: string | null }) => useDocumentTitle(title), {
            initialProps: { title: null as string | null }
        })
        expect(document.title).toBe('NezFocus')
        rerender({ title: 'Nhóm đồ án Mobile' })
        expect(document.title).toBe('Nhóm đồ án Mobile · NezFocus')
    })

    it('starts with the unread number while there is one, whatever the page (REQ-MSG-09, X-01)', () => {
        const count = renderHook(({ n }: { n: number }) => useTitleCount(n), { initialProps: { n: 3 } })
        expect(document.title).toBe('(3) NezFocus')

        const page = renderHook(() => useDocumentTitle('Page not found'))
        expect(document.title).toBe('(3) Page not found · NezFocus')
        page.unmount()

        count.rerender({ n: 0 })
        expect(document.title).toBe('NezFocus')
        count.rerender({ n: 124 })
        expect(document.title).toBe('(99+) NezFocus')
        count.unmount()
        expect(document.title).toBe('NezFocus')
    })

    it("puts the session's clock in the page's place, the number still first, and gives the page back (07 S-ROOM-05)", () => {
        const page = renderHook(() => useDocumentTitle('Page not found'))
        const count = renderHook(() => useTitleCount(2))
        const clock = renderHook(({ text }: { text: string | null }) => useTitleClock(text), {
            initialProps: { text: '18:42 · Tập trung' as string | null }
        })
        expect(document.title).toBe('(2) 18:42 · Tập trung · NezFocus')
        clock.rerender({ text: '18:41 · Tập trung' })
        expect(document.title).toBe('(2) 18:41 · Tập trung · NezFocus')
        clock.rerender({ text: null })
        expect(document.title).toBe('(2) Page not found · NezFocus')
        clock.rerender({ text: '18:41 · Tạm dừng' })
        clock.unmount()
        expect(document.title).toBe('(2) Page not found · NezFocus')
        count.unmount()
        page.unmount()
    })
})
