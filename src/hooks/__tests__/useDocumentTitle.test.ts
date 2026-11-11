import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDocumentTitle } from '../useDocumentTitle'

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
})
