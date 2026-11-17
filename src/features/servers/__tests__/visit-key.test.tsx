import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { useVisitKey } from '../hooks/useVisitKey'

const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/channels/s/c/messages/m']}>{children}</MemoryRouter>
)

function setUp() {
    return renderHook(() => ({ visit: useVisitKey(), navigate: useNavigate() }), { wrapper })
}

describe('useVisitKey: a link followed to the page, not a detail opened over it', () => {
    it('stays the same while only the search changes (`?task=` opened, then closed)', () => {
        const { result } = setUp()
        const first = result.current.visit

        act(() => void result.current.navigate('/channels/s/c/messages/m?task=t1'))
        expect(result.current.visit).toBe(first)
        act(() => void result.current.navigate('/channels/s/c/messages/m'))
        expect(result.current.visit).toBe(first)
    })

    it('changes when the same link is followed again, or another page opens', () => {
        const { result } = setUp()
        const first = result.current.visit

        act(() => void result.current.navigate('/channels/s/c/messages/m'))
        const again = result.current.visit
        expect(again).not.toBe(first)
        act(() => void result.current.navigate('/channels/s/c/messages/n?task=t1'))
        expect(result.current.visit).not.toBe(again)
    })
})
