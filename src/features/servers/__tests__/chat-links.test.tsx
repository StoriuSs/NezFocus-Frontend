import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { serverKeys } from '../api/keys'
import { useChatLinks } from '../hooks/useChatLinks'

describe('useChatLinks › server (the profile panel, C-50, D-251)', () => {
    it('draws a server we share from my list, its picture or initials, and opens it as the rail does', () => {
        const client = new QueryClient()
        client.setQueryData(serverKeys.list(), [
            { id: 'ot', name: 'Ôn thi Giải tích 2', iconUrl: null, channels: [] },
            { id: 'cg', name: 'CLB Guitar PTIT', iconUrl: 'https://cdn.example/cg.webp', channels: [] }
        ])
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
        )
        const { result } = renderHook(() => useChatLinks(), { wrapper })

        expect(result.current.server('ot', 'Tên cũ')).toEqual({
            name: 'Ôn thi Giải tích 2',
            iconUrl: null,
            initials: 'ÔT',
            path: '/channels/ot'
        })
        expect(result.current.server('cg', 'CLB Guitar PTIT')).toMatchObject({
            iconUrl: 'https://cdn.example/cg.webp',
            path: '/channels/cg'
        })
        // Not in my list yet (joined in another tab a moment ago): the profile's name.
        expect(result.current.server('nd', 'Nhóm đồ án Mobile')).toEqual({
            name: 'Nhóm đồ án Mobile',
            iconUrl: null,
            initials: 'NĐ',
            path: '/channels/nd'
        })
    })
})
