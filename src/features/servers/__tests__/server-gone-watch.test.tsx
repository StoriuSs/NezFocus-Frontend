import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AxiosHeaders } from 'axios'
import i18n from '@/i18n'
import { apiError } from '@/test/helpers'
import { serverKeys } from '../api/keys'
import type { Server } from '../types'

const toast = vi.fn()
vi.mock('sonner', () => ({ toast }))

const { useServerGoneWatch } = await import('../hooks/useServerGoneWatch')

const server = (id: string, name: string) => ({ id, name }) as Server
const OT = server('ot', 'Ôn thi Giải tích 2')
const ND = server('nd', 'Nhóm Đề cương')

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    client.setQueryData(serverKeys.list(), [OT, ND])
    renderHook(() => useServerGoneWatch(), { wrapper })
    return { client, wrapper }
}

const notFoundUnder = (url: string) =>
    apiError(404, 'NOT_FOUND_ERROR', { config: { url, headers: new AxiosHeaders() } })

// D-143: no live updates until M2, so a server one is no longer in is noticed here.
describe('useServerGoneWatch', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        toast.mockReset()
    })
    afterEach(() => vi.restoreAllMocks())

    it('says so when a list read from the API no longer has a server', async () => {
        const { client } = setup()
        await client.fetchQuery({ queryKey: serverKeys.list(), queryFn: async () => [ND], staleTime: 0 })
        expect(toast).toHaveBeenCalledWith('You are no longer in Ôn thi Giải tích 2', { id: 'server-gone-ot' })
        expect(toast).toHaveBeenCalledTimes(1)
    })

    it('says nothing about one taken out by hand, as leaving or deleting does', async () => {
        const { client } = setup()
        client.setQueryData<Server[]>(serverKeys.list(), [ND])
        await client.fetchQuery({ queryKey: serverKeys.list(), queryFn: async () => [ND], staleTime: 0 })
        expect(toast).not.toHaveBeenCalled()
    })

    it('reads the list again when a request under /servers/{id} is refused as not found', async () => {
        const { client, wrapper } = setup()
        const invalidate = vi.spyOn(client, 'invalidateQueries')
        const { result } = renderHook(
            () =>
                useMutation({
                    mutationFn: async () => {
                        throw notFoundUnder('/servers/ot/members/me')
                    }
                }),
            { wrapper }
        )
        result.current.mutate()
        await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: serverKeys.list() }))
    })

    it('reads the list again for a query refused the same way, and not for other errors', async () => {
        const { client } = setup()
        const invalidate = vi.spyOn(client, 'invalidateQueries')
        await client
            .fetchQuery({
                queryKey: ['servers', 'members', 'ot'],
                queryFn: async () => {
                    throw apiError(403, 'FORBIDDEN_ERROR', {
                        config: { url: '/servers/ot/members', headers: new AxiosHeaders() }
                    })
                }
            })
            .catch(() => undefined)
        expect(invalidate).not.toHaveBeenCalled()

        await client
            .fetchQuery({
                queryKey: ['servers', 'bans', 'ot'],
                queryFn: async () => {
                    throw notFoundUnder('/servers/ot/bans')
                }
            })
            .catch(() => undefined)
        expect(invalidate).toHaveBeenCalledWith({ queryKey: serverKeys.list() })
    })
})
