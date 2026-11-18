import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AxiosHeaders } from 'axios'
import i18n from '@/i18n'
import { aboutGonePlace } from '@/lib/gone-places'
import { apiError } from '@/test/helpers'
import { serverKeys } from '../api/keys'
import type { Server } from '../types'

const toast = vi.fn()
vi.mock('sonner', () => ({ toast }))

const { useServerGoneWatch } = await import('../hooks/useServerGoneWatch')

const server = (id: string, name: string) => ({ id, name, channels: [{ id: `${id}-chung` }] }) as Server
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

// D-143: a server one is no longer in, noticed from requests and from the list read again (its Toast is the inbox's since M3 L8, H1).
describe('useServerGoneWatch', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        toast.mockReset()
    })
    afterEach(() => vi.restoreAllMocks())

    it('says nothing itself when a list read from the API no longer has a server: the inbox says it (H1, D-187)', async () => {
        const { client } = setup()
        await client.fetchQuery({ queryKey: serverKeys.list(), queryFn: async () => [ND], staleTime: 0 })
        expect(toast).not.toHaveBeenCalled()
    })

    it('lets go of what was read about it: its lists and the histories of its channels (gone while offline)', async () => {
        const { client } = setup()
        client.setQueryData(serverKeys.roles('ot'), [])
        client.setQueryData(['messages', 'channel', 'ot-chung'], { pages: [], pageParams: [] })
        await client.fetchQuery({ queryKey: serverKeys.list(), queryFn: async () => [ND], staleTime: 0 })
        expect(client.getQueryData(serverKeys.roles('ot'))).toBeUndefined()
        expect(client.getQueryData(['messages', 'channel', 'ot-chung'])).toBeUndefined()
        // A change about it still on its way fails without a Toast (11 S-MOD-02 E9).
        expect(aboutGonePlace(notFoundUnder('/servers/ot/members'))).toBe(true)
        expect(aboutGonePlace(notFoundUnder('/channels/ot-chung/messages'))).toBe(true)
    })

    it('lets a server joined again show its errors again, at once (not two minutes later)', async () => {
        const { client } = setup()
        await client.fetchQuery({ queryKey: serverKeys.list(), queryFn: async () => [ND], staleTime: 0 })
        expect(aboutGonePlace(notFoundUnder('/servers/ot/members'))).toBe(true)

        // Invited back: the list has it again (joining puts it in by hand).
        client.setQueryData<Server[]>(serverKeys.list(), [ND, OT])

        expect(aboutGonePlace(notFoundUnder('/servers/ot/members'))).toBe(false)
        expect(aboutGonePlace(notFoundUnder('/channels/ot-chung/messages'))).toBe(false)
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
