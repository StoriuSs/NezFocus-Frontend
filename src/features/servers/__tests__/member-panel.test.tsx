import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'
import { expectNoA11yViolations } from '@/test/a11y'
import type { MemberQuery } from '../api/roles.api'
import type { MemberPage, ServerMember } from '../types'

const fetchMembers = vi.fn<(serverId: string, query: MemberQuery) => Promise<MemberPage>>()
vi.mock('../api/roles.api', () => ({ fetchMembers }))

const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')
const { MemberPanel } = await import('../components/member-panel/MemberPanel')

const member = (
    userId: string,
    displayName: string,
    status: ServerMember['status'],
    extra: Partial<ServerMember> = {}
) =>
    ({
        userId,
        username: `${userId}.tran`,
        displayName,
        avatarUrl: null,
        isOwner: false,
        roleIds: [],
        joinedAt: '2026-11-01T00:00:00.000Z',
        timeoutUntil: null,
        timeoutReason: null,
        status,
        ...extra
    }) satisfies ServerMember

const page = (items: ServerMember[], total: number, current = 1): MemberPage => ({
    items,
    meta: {
        currentPage: current,
        itemsPerPage: 100,
        totalItems: total,
        totalPages: Math.ceil(total / 100),
        hasNextPage: current * 100 < total,
        hasPreviousPage: current > 1
    }
})

/** Who the server holds: An (the owner) and Bình online, Chi away, Dũng offline. */
let online: ServerMember[]
let offline: ServerMember[]

function renderPanel() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={client}>
            <MemberPanel serverId='ot' />
        </QueryClientProvider>
    )
}
const group = (name: RegExp) => screen.getByRole('region', { name })
/** A row as read: its name, username and the owner's mark. */
const said = (row: HTMLElement) =>
    [...row.querySelectorAll('.truncate, .sr-only')].map((part) => part.textContent).join(' ')
const names = (region: HTMLElement) => within(region).getAllByRole('listitem').map(said)
const dotOf = (region: HTMLElement, name: string) =>
    within(region)
        .getAllByRole('listitem')
        .find((row) => said(row).startsWith(`${name} `))
        ?.querySelector('[data-presence]')
        ?.getAttribute('data-presence')

describe('The Members panel (S-SHELL-01, C-13, D-175)', () => {
    beforeEach(() => {
        online = [
            member('an', 'An', 'online', { isOwner: true }),
            member('binh', 'Bình', 'online'),
            member('chi', 'Chi', 'idle')
        ]
        offline = [member('dung', 'Dũng', 'offline')]
        fetchMembers.mockReset()
        fetchMembers.mockImplementation(async (_serverId, query) =>
            query.presence === 'online' ? page(online, online.length) : page(offline, offline.length)
        )
    })

    it('lists those online then those offline, each by name, with their counts and dots', async () => {
        renderPanel()

        const on = await screen.findByRole('region', { name: 'Online — 3' })
        expect(names(on)).toEqual(['An an.tran Owner', 'Bình binh.tran', 'Chi chi.tran'])
        expect(dotOf(on, 'Chi')).toBe('idle')
        expect(names(group(/^Offline — 1$/))).toEqual(['Dũng dung.tran'])
        expect(fetchMembers).toHaveBeenCalledWith('ot', expect.objectContaining({ presence: 'online', sort: 'name' }))
        await expectNoA11yViolations()
    })

    it('shows an account waiting to be deleted as a deleted account, with no username (D-182)', async () => {
        offline = [
            member('dung', 'Dũng', 'offline'),
            member('em', 'Em', 'offline', { username: null, displayName: null })
        ]
        renderPanel()

        const off = await screen.findByRole('region', { name: 'Offline — 2' })
        expect(names(off)).toEqual(['Dũng dung.tran', 'Deleted account'])
    })

    it('leaves out the offline group when no one is offline', async () => {
        offline = []
        renderPanel()
        await screen.findByRole('region', { name: 'Online — 3' })
        expect(screen.queryByRole('region', { name: /^Offline/ })).toBeNull()
    })

    it('changes a dot at once while the member stays online, without reading again', async () => {
        renderPanel()
        await screen.findByRole('region', { name: 'Online — 3' })
        fetchMembers.mockClear()

        act(() => emitRealtimeEvent('presence.updated', { userId: 'binh', status: 'dnd' }))

        await waitFor(() => expect(dotOf(group(/^Online/), 'Bình')).toBe('dnd'))
        expect(fetchMembers).not.toHaveBeenCalled()
    })

    it('reads the groups again a moment after someone moves between them', async () => {
        renderPanel()
        await screen.findByRole('region', { name: 'Online — 3' })
        fetchMembers.mockClear()
        online = online.filter((one) => one.userId !== 'binh')
        offline = [member('binh', 'Bình', 'offline'), ...offline]

        act(() => emitRealtimeEvent('presence.updated', { userId: 'binh', status: 'offline' }))
        act(() => emitRealtimeEvent('presence.updated', { userId: 'chi', status: 'offline' }))
        expect(fetchMembers).not.toHaveBeenCalled()

        await waitFor(() => expect(names(group(/^Offline — 2$/))).toEqual(['Bình binh.tran', 'Dũng dung.tran']), {
            timeout: 3000
        })
        // Once for the burst: each group read one time.
        expect(fetchMembers).toHaveBeenCalledTimes(2)
    })

    it('reads nothing again for someone of another server coming online: every offline member is listed', async () => {
        renderPanel()
        await screen.findByRole('region', { name: 'Online — 3' })
        fetchMembers.mockClear()

        act(() => emitRealtimeEvent('presence.updated', { userId: 'stranger', status: 'online' }))
        await new Promise((resolve) => setTimeout(resolve, 1200))

        expect(fetchMembers).not.toHaveBeenCalled()
    })

    it('keeps the members read when the next page fails, offering to try it again', async () => {
        const many = Array.from({ length: 150 }, (_, index) => member(`m${index}`, `Người ${index}`, 'offline'))
        fetchMembers.mockImplementation(async (_serverId, query) => {
            if (query.presence === 'online') return page(online, online.length)
            if (query.page === 2) throw new Error('offline')
            return page(many.slice(0, 100), 150)
        })
        renderPanel()

        expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
        expect(within(group(/^Offline — 150$/)).getAllByRole('listitem')).toHaveLength(100)
    })

    it('loads the next 100 offline as the end of the group comes', async () => {
        const many = Array.from({ length: 150 }, (_, index) => member(`m${index}`, `Người ${index}`, 'offline'))
        fetchMembers.mockImplementation(async (_serverId, query) =>
            query.presence === 'online'
                ? page(online, online.length)
                : page(many.slice(((query.page ?? 1) - 1) * 100, (query.page ?? 1) * 100), 150, query.page)
        )
        renderPanel()

        await waitFor(() => expect(within(group(/^Offline — 150$/)).getAllByRole('listitem')).toHaveLength(150))
        expect(fetchMembers).toHaveBeenCalledWith('ot', expect.objectContaining({ presence: 'offline', page: 2 }))
    })

    it('offers to try again when the list could not be read', async () => {
        fetchMembers.mockRejectedValue(new Error('offline'))
        renderPanel()
        expect(await screen.findByText('Could not load the members')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    })
})
