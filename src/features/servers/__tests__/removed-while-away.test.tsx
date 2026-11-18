import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import i18n from '@/i18n'
import { serverKeys } from '../api/keys'
import { useServerRemovals } from '../server-removals.store'
import type { Server } from '../types'

const toast = Object.assign(vi.fn(), { dismiss: vi.fn() })
vi.mock('sonner', () => ({ toast }))
// The list comes only as a test puts it.
vi.mock('../api/servers.api', () => ({ fetchServers: () => new Promise(() => undefined) }))

/** The unread kicks and bans the inbox holds (undefined: not read yet), and what "Xem" calls. */
const notifications = vi.hoisted(() => ({
    removals: undefined as { id: string; serverId: string; name: string; createdAt: string }[] | undefined,
    open: false,
    openInbox: vi.fn()
}))
vi.mock('@/features/notifications', () => ({
    useUnreadRemovals: () => notifications.removals,
    openInbox: notifications.openInbox,
    useInboxStore: { getState: () => ({ open: notifications.open }) }
}))

const { useRemovedWhileAway } = await import('../hooks/useRemovedWhileAway')

const server = (id: string, name: string) => ({ id, name, channels: [] }) as unknown as Server
const ND = server('nd', 'Nhóm đồ án Mobile')
/** Made a minute ago: a server list read since is newer. */
const AGO = new Date(Date.now() - 60_000).toISOString()
const KICKED = { id: 'n12', serverId: 'cg', name: 'CLB Guitar PTIT', createdAt: AGO }
const BANNED = { id: 'n11', serverId: 'trr', name: 'Toán rời rạc', createdAt: AGO }
const CG = server('cg', 'CLB Guitar PTIT')

function setup(servers: Server[] | undefined, updatedAt?: number) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    if (servers) client.setQueryData(serverKeys.list(), servers, { updatedAt })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const hook = renderHook(() => useRemovedWhileAway(), { wrapper })
    return { client, ...hook }
}

const toldOf = (name: string) =>
    toast.mock.calls.filter(([words]) => words === `Bạn không còn ở ${name}`).map(([, options]) => options)

// 11 S-MOD-02 › Luật bằng chữ (H1): removed while away, the inbox's unread item says it.
describe('useRemovedWhileAway', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        toast.mockReset()
        toast.dismiss.mockReset()
        notifications.openInbox.mockReset()
        notifications.removals = undefined
        notifications.open = false
        useServerRemovals.setState({ queue: [] })
    })

    it('says each server one was put out of or banned from while away, with "Xem" opening the inbox', () => {
        notifications.removals = [KICKED, BANNED]
        setup([ND])

        const [kicked] = toldOf('CLB Guitar PTIT')
        expect(kicked).toEqual(
            expect.objectContaining({
                id: 'server-gone-n12',
                icon: expect.anything(),
                action: expect.objectContaining({ label: 'Xem' })
            })
        )
        expect(toldOf('Toán rời rạc')).toHaveLength(1)
        kicked.action.onClick({ currentTarget: { blur: () => undefined } })
        expect(notifications.openInbox).toHaveBeenCalled()
    })

    it('waits for both the inbox and the server list', async () => {
        const listOnly = setup([ND])
        expect(toast).not.toHaveBeenCalled()
        listOnly.unmount()

        const { client, rerender } = setup(undefined)
        rerender()
        expect(toast).not.toHaveBeenCalled()

        notifications.removals = [KICKED]
        rerender()
        expect(toast).not.toHaveBeenCalled()

        act(() => {
            client.setQueryData(serverKeys.list(), [ND])
        })
        await waitFor(() => expect(toldOf('CLB Guitar PTIT')).toHaveLength(1))
    })

    it('says nothing of a server one is in again, nor of one whose dialog this tab showed, even after', async () => {
        notifications.removals = [KICKED, BANNED]
        useServerRemovals.getState().push({ serverId: 'trr', name: 'Toán rời rạc', by: 'ban', reason: null })
        const { client, rerender } = setup([ND, CG])
        expect(toast).not.toHaveBeenCalled()

        // The dialog read, then one leaves the server joined again: still nothing.
        act(() => useServerRemovals.getState().next())
        rerender()
        act(() => {
            client.setQueryData(serverKeys.list(), [ND])
        })
        await waitFor(() => expect(client.getQueryData(serverKeys.list())).toEqual([ND]))
        rerender()
        expect(toast).not.toHaveBeenCalled()
    })

    it('waits for a list read after the item before taking the server as joined again', async () => {
        notifications.removals = [KICKED]
        // The list held from before the kick, not read again yet.
        const { client } = setup([ND, CG], Date.now() - 120_000)
        expect(toast).not.toHaveBeenCalled()

        act(() => {
            client.setQueryData(serverKeys.list(), [ND])
        })
        await waitFor(() => expect(toldOf('CLB Guitar PTIT')).toHaveLength(1))
    })

    it('says nothing while the inbox is open, which reads the item itself', () => {
        notifications.removals = [KICKED]
        notifications.open = true
        setup([ND])
        expect(toast).not.toHaveBeenCalled()
    })

    it('takes its Toast away once the item is read elsewhere', () => {
        notifications.removals = [KICKED]
        const { rerender } = setup([ND])
        expect(toldOf('CLB Guitar PTIT')).toHaveLength(1)

        notifications.removals = []
        rerender()
        expect(toast.dismiss).toHaveBeenCalledWith('server-gone-n12')
    })

    it('says each item once in a tab, a new one when it comes', () => {
        notifications.removals = [KICKED]
        const { rerender } = setup([ND])
        notifications.removals = [KICKED]
        rerender()
        expect(toldOf('CLB Guitar PTIT')).toHaveLength(1)

        notifications.removals = [BANNED, KICKED]
        rerender()
        expect(toldOf('Toán rời rạc')).toHaveLength(1)
        expect(toast).toHaveBeenCalledTimes(2)
    })
})
