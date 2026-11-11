import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Navigate, RouterProvider, useLocation, useParams } from 'react-router-dom'
import { Toaster } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError, mockAuthStore, queryWrapper } from '@/test/helpers'
import type { Server, ServerMember } from '../types'

const serversApi = {
    fetchServers: vi.fn(),
    leaveServer: vi.fn(),
    deleteServer: vi.fn(),
    transferOwnership: vi.fn()
}
vi.mock('@/features/servers/api/servers.api', () => serversApi)
const rolesApi = { fetchMembers: vi.fn() }
vi.mock('@/features/servers/api/roles.api', () => rolesApi)
const authState = { user: { id: 'an', email: 'an@example.test', username: 'an' }, logout: vi.fn() }
vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))

const { default: MembershipDialogs } = await import('../components/membership/MembershipDialogs')
const { useMembershipDialogs } = await import('../membership-dialogs.store')
const { useServers } = await import('../api/useServers')

const ROLES = [
    { id: 'admin', name: 'Quản trị', position: 3, administrator: true },
    { id: 'lead', name: 'Trưởng nhóm', position: 2, administrator: false }
]

const server = (id: string, name: string, extra: Partial<Server> = {}): Server => ({
    id,
    name,
    iconUrl: null,
    isOwner: false,
    memberCount: 13,
    permissions: '0',
    topRolePosition: 0,
    roleIds: [],
    roles: ROLES,
    timeoutUntil: null,
    welcomeChannelId: null,
    categories: [],
    channels: [],
    ...extra
})

const OT = server('ot', 'Ôn thi Giải tích 2', { isOwner: true })
const ND = server('nd', 'Nhóm Đề cương')
const CG = server('cg', 'Cờ vua Giải trí')

const member = (userId: string, name: string, extra: Partial<ServerMember> = {}): ServerMember => ({
    userId,
    username: `${userId}.tran`,
    displayName: name,
    avatarUrl: null,
    isOwner: false,
    roleIds: [],
    joinedAt: '2026-10-01T00:00:00Z',
    timeoutUntil: null,
    timeoutReason: null,
    ...extra
})
const BINH = member('binh', 'Bình', { roleIds: ['lead'] })
const PHONG = member('phong', 'Phong', { timeoutUntil: '2099-01-01T15:30:00Z' })
const page = (items: ServerMember[]) => ({
    items,
    meta: {
        currentPage: 1,
        itemsPerPage: 50,
        totalItems: items.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false
    }
})

function Where() {
    return <output>{useLocation().pathname}</output>
}

/** As the server's pages do: a server no longer in the list sends them to /study. */
function ServerPage() {
    const { serverId } = useParams()
    const servers = useServers()
    if (serverId && servers.data && !servers.data.some((server) => server.id === serverId)) {
        return <Navigate to='/study' replace />
    }
    return null
}

function renderAt(path: string, servers: Server[] = [OT, ND, CG]) {
    serversApi.fetchServers.mockResolvedValue(servers)
    const shell = (
        <>
            <MembershipDialogs />
            <ServerPage />
            <Where />
        </>
    )
    const router = createMemoryRouter(
        [
            { path: '/channels/:serverId/:channelId?', element: shell },
            { path: '/servers/:serverId/settings/:section', element: shell },
            { path: '/study', element: shell }
        ],
        { initialEntries: [path] }
    )
    render(
        <TooltipProvider>
            <RouterProvider router={router} />
            <Toaster />
        </TooltipProvider>,
        // The app's stale time (query-client.ts): a list read once is not read again by itself.
        { wrapper: queryWrapper({ staleTime: 5 * 60 * 1000 }) }
    )
}
/** As OWNERSHIP_TRANSFER_REQUIRED names them (`data.servers`). */
const BLOCKING_ONE = [{ id: 'ot', name: 'Ôn thi Giải tích 2', memberCount: 13 }]

// By its text: an open dialog hides the rest of the page from the accessibility tree.
const where = () => screen.getByText((_, element) => element?.tagName === 'OUTPUT')

describe('leaving, handing over and deleting a server (03 S-SRV-04, 04 S-SET-07)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        for (const fn of [...Object.values(serversApi), ...Object.values(rolesApi)]) fn.mockReset()
    })
    afterEach(() => useMembershipDialogs.getState().hide())

    describe('leave', () => {
        it('asks a member once, the focus on Cancel; left, the page opens the next server', async () => {
            serversApi.leaveServer.mockResolvedValue(undefined)
            renderAt('/channels/nd')
            useMembershipDialogs.getState().show({ kind: 'leave', serverId: 'nd' })

            const dialog = await screen.findByRole('dialog', { name: 'Leave Nhóm Đề cương?' })
            expect(within(dialog).getByText('You will need a new invite to come back.')).toBeInTheDocument()
            await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus())
            await expectNoA11yViolations()

            await userEvent.click(within(dialog).getByRole('button', { name: 'Leave server' }))

            expect(await screen.findByText('Left Nhóm Đề cương')).toBeInTheDocument()
            expect(serversApi.leaveServer).toHaveBeenCalledWith('nd')
            expect(where()).toHaveTextContent('/channels/cg')
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
            expect(useMembershipDialogs.getState().open).toBeNull()
        })

        it('stays on a page of another server', async () => {
            serversApi.leaveServer.mockResolvedValue(undefined)
            renderAt('/channels/ot')
            useMembershipDialogs.getState().show({ kind: 'leave', serverId: 'nd' })
            await userEvent.click(await screen.findByRole('button', { name: 'Leave server' }))
            expect(await screen.findByText('Left Nhóm Đề cương')).toBeInTheDocument()
            expect(where()).toHaveTextContent('/channels/ot')
        })

        it('goes to /study after the last server', async () => {
            serversApi.leaveServer.mockResolvedValue(undefined)
            renderAt('/channels/nd', [ND])
            useMembershipDialogs.getState().show({ kind: 'leave', serverId: 'nd' })
            await userEvent.click(await screen.findByRole('button', { name: 'Leave server' }))
            await waitFor(() => expect(where()).toHaveTextContent('/study'))
        })

        it('keeps the dialog and says so when offline', async () => {
            serversApi.leaveServer.mockRejectedValue(new (await import('axios')).AxiosError('offline'))
            renderAt('/channels/nd')
            useMembershipDialogs.getState().show({ kind: 'leave', serverId: 'nd' })
            await userEvent.click(await screen.findByRole('button', { name: 'Leave server' }))
            expect(
                await screen.findByText('Couldn’t leave the server · Check your connection and try again')
            ).toBeInTheDocument()
            expect(screen.getByRole('dialog', { name: 'Leave Nhóm Đề cương?' })).toBeInTheDocument()
        })

        it('tells the owner to hand it over first, without asking the API, and leads there', async () => {
            renderAt('/channels/ot')
            useMembershipDialogs.getState().show({ kind: 'leave', serverId: 'ot' })

            const dialog = await screen.findByRole('dialog', { name: 'Transfer ownership before leaving' })
            const transfer = within(dialog).getByRole('button', { name: 'Transfer ownership' })
            await waitFor(() => expect(transfer).toHaveFocus())
            await expectNoA11yViolations()

            await userEvent.click(transfer)
            expect(useMembershipDialogs.getState().open).toEqual({ kind: 'transfer', serverId: 'ot', thenLeave: true })
            expect(serversApi.leaveServer).not.toHaveBeenCalled()
        })

        it('offers an owner alone in it to delete it (SRV-EDGE `owner-alone`)', async () => {
            renderAt('/channels/ot', [{ ...OT, memberCount: 1 }])
            useMembershipDialogs.getState().show({ kind: 'leave', serverId: 'ot' })
            const dialog = await screen.findByRole('dialog', { name: 'You are the only member' })
            // The safe button has the focus: the other one deletes (C-14).
            await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Not now' })).toHaveFocus())
            await expectNoA11yViolations()
            await userEvent.click(within(dialog).getByRole('button', { name: 'Delete server' }))
            expect(await screen.findByRole('dialog', { name: 'Delete Ôn thi Giải tích 2?' })).toBeInTheDocument()
        })

        it('takes "not found" as left: sent again after a lost answer, it moves on all the same', async () => {
            serversApi.leaveServer.mockRejectedValue(apiError(404, 'NOT_FOUND_ERROR'))
            renderAt('/channels/nd')
            useMembershipDialogs.getState().show({ kind: 'leave', serverId: 'nd' })
            await userEvent.click(await screen.findByRole('button', { name: 'Leave server' }))
            expect(await screen.findByText('Left Nhóm Đề cương')).toBeInTheDocument()
            expect(where()).toHaveTextContent('/channels/cg')
        })

        it('cuts a long server name in the Toast at 24 characters (C-16)', async () => {
            serversApi.leaveServer.mockResolvedValue(undefined)
            const long = server('nd', 'Câu lạc bộ Ôn thi Giải tích 2 buổi tối K22')
            renderAt('/channels/ot', [OT, long, CG])
            useMembershipDialogs.getState().show({ kind: 'leave', serverId: 'nd' })
            await userEvent.click(await screen.findByRole('button', { name: 'Leave server' }))
            expect(await screen.findByText('Left Câu lạc bộ Ôn thi Giải t…')).toBeInTheDocument()
        })

        it('drops a dialog whose server is not in the list', async () => {
            renderAt('/channels/ot')
            await screen.findByText('/channels/ot', { selector: 'output' })
            useMembershipDialogs.getState().show({ kind: 'leave', serverId: 'gone' })
            await waitFor(() => expect(useMembershipDialogs.getState().open).toBeNull())
        })
    })

    describe('delete', () => {
        it('waits for the name, case and accents left out, then deletes and opens the next server', async () => {
            serversApi.deleteServer.mockResolvedValue(undefined)
            renderAt('/servers/ot/settings/overview')
            useMembershipDialogs.getState().show({ kind: 'delete', serverId: 'ot' })

            const dialog = await screen.findByRole('dialog', { name: 'Delete Ôn thi Giải tích 2?' })
            expect(within(dialog).getByText(/goes for all 13 members/)).toBeInTheDocument()
            const submit = within(dialog).getByRole('button', { name: 'Delete server' })
            expect(submit).toBeDisabled()
            await expectNoA11yViolations()

            const field = within(dialog).getByLabelText('Type Ôn thi Giải tích 2 to confirm')
            await userEvent.type(field, 'on thi giai tich')
            expect(submit).toBeDisabled()
            await userEvent.type(field, ' 2')
            await userEvent.click(submit)

            expect(await screen.findByText('Deleted Ôn thi Giải tích 2')).toBeInTheDocument()
            expect(serversApi.deleteServer).toHaveBeenCalledWith('ot', 'on thi giai tich 2')
            expect(where()).toHaveTextContent('/channels/nd')
        })

        it('takes "not found" as deleted, and moves on', async () => {
            serversApi.deleteServer.mockRejectedValue(apiError(404, 'NOT_FOUND_ERROR'))
            renderAt('/channels/ot')
            useMembershipDialogs.getState().show({ kind: 'delete', serverId: 'ot' })
            const dialog = await screen.findByRole('dialog', { name: 'Delete Ôn thi Giải tích 2?' })
            await userEvent.type(within(dialog).getByRole('textbox'), 'Ôn thi Giải tích 2')
            await userEvent.click(within(dialog).getByRole('button', { name: 'Delete server' }))
            expect(await screen.findByText('Deleted Ôn thi Giải tích 2')).toBeInTheDocument()
            expect(where()).toHaveTextContent('/channels/nd')
        })

        it('reads the list again when the name changed meanwhile, and says to type the new one', async () => {
            serversApi.deleteServer.mockRejectedValue(
                apiError(422, 'VALIDATION_ERROR', { data: { rule: 'name_mismatch' } })
            )
            renderAt('/channels/ot')
            useMembershipDialogs.getState().show({ kind: 'delete', serverId: 'ot' })
            const dialog = await screen.findByRole('dialog', { name: 'Delete Ôn thi Giải tích 2?' })
            serversApi.fetchServers.mockResolvedValue([{ ...OT, name: 'Giải tích 2 (K22)' }, ND, CG])
            await userEvent.type(within(dialog).getByRole('textbox'), 'Ôn thi Giải tích 2')
            await userEvent.click(within(dialog).getByRole('button', { name: 'Delete server' }))
            expect(
                await screen.findByText('The server was renamed meanwhile. Type its new name to confirm.')
            ).toBeInTheDocument()
            expect(await screen.findByRole('dialog', { name: 'Delete Giải tích 2 (K22)?' })).toBeInTheDocument()
        })

        it('says why under the field when refused', async () => {
            serversApi.deleteServer.mockRejectedValue(apiError(403, 'FORBIDDEN_ERROR'))
            renderAt('/channels/ot')
            useMembershipDialogs.getState().show({ kind: 'delete', serverId: 'ot' })
            const dialog = await screen.findByRole('dialog', { name: 'Delete Ôn thi Giải tích 2?' })
            await userEvent.type(within(dialog).getByRole('textbox'), 'Ôn thi Giải tích 2')
            await userEvent.click(within(dialog).getByRole('button', { name: 'Delete server' }))
            expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
            expect(where()).toHaveTextContent('/channels/ot')
        })
    })

    describe('transfer', () => {
        it('lists who may take it, by name; someone timed out shows why and cannot be chosen', async () => {
            rolesApi.fetchMembers.mockResolvedValue(page([BINH, PHONG]))
            renderAt('/servers/ot/settings/overview')
            useMembershipDialogs.getState().show({ kind: 'transfer', serverId: 'ot' })

            const dialog = await screen.findByRole('dialog', { name: 'Transfer ownership' })
            const binh = await within(dialog).findByRole('button', { name: /Bình/ })
            expect(binh).toHaveTextContent('Trưởng nhóm')
            const phong = within(dialog).getByRole('button', { name: /Phong/ })
            expect(phong).toBeDisabled()
            expect(phong).toHaveTextContent(/Timed out until .* · Remove the timeout to choose them/)
            expect(rolesApi.fetchMembers).toHaveBeenCalledWith('ot', {
                q: undefined,
                sort: 'name',
                order: 'asc',
                limit: 50,
                transferable: true
            })
            await expectNoA11yViolations()
        })

        it('says so when nobody else is in it', async () => {
            rolesApi.fetchMembers.mockResolvedValue(page([]))
            renderAt('/servers/ot/settings/overview')
            useMembershipDialogs.getState().show({ kind: 'transfer', serverId: 'ot' })
            expect(await screen.findByText('No other members yet')).toBeInTheDocument()
        })

        it('moves between the rows with ↓ from the search box', async () => {
            rolesApi.fetchMembers.mockResolvedValue(page([BINH, member('chi', 'Chi')]))
            renderAt('/channels/ot')
            useMembershipDialogs.getState().show({ kind: 'transfer', serverId: 'ot' })
            const dialog = await screen.findByRole('dialog', { name: 'Transfer ownership' })
            await within(dialog).findByRole('button', { name: /Bình/ })
            within(dialog).getByRole('textbox', { name: 'Search by name or username' }).focus()
            await userEvent.keyboard('{ArrowDown}')
            expect(within(dialog).getByRole('button', { name: /Bình/ })).toHaveFocus()
            await userEvent.keyboard('{ArrowDown}')
            expect(within(dialog).getByRole('button', { name: /Chi/ })).toHaveFocus()
        })

        it('asks the password for the one chosen, hands it over, and moves a page no longer theirs', async () => {
            rolesApi.fetchMembers.mockResolvedValue(page([BINH]))
            serversApi.transferOwnership.mockResolvedValue(undefined)
            renderAt('/servers/ot/settings/overview')
            useMembershipDialogs.getState().show({ kind: 'transfer', serverId: 'ot' })
            await userEvent.click(await screen.findByRole('button', { name: /Bình/ }))

            const dialog = await screen.findByRole('dialog', { name: 'Transfer ownership to Bình?' })
            const submit = within(dialog).getByRole('button', { name: 'Transfer ownership' })
            expect(submit).toBeDisabled()
            expect(within(dialog).getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument()
            await expectNoA11yViolations()

            // Handed over, An keeps Trưởng nhóm: kick only, so Overview is no longer theirs.
            serversApi.fetchServers.mockResolvedValue([
                { ...OT, isOwner: false, permissions: String(1n << 4n) },
                ND,
                CG
            ])
            await userEvent.type(within(dialog).getByLabelText('Your password'), 'Correct-Horse-1')
            await userEvent.click(submit)

            expect(await screen.findByText('Bình now owns the server')).toBeInTheDocument()
            expect(serversApi.transferOwnership).toHaveBeenCalledWith('ot', 'binh', 'Correct-Horse-1')
            expect(where()).toHaveTextContent('/servers/ot/settings/members')
            expect(useMembershipDialogs.getState().open).toBeNull()
        })

        it('goes back to the choice from the password step', async () => {
            rolesApi.fetchMembers.mockResolvedValue(page([BINH]))
            renderAt('/channels/ot')
            useMembershipDialogs.getState().show({ kind: 'transfer', serverId: 'ot' })
            await userEvent.click(await screen.findByRole('button', { name: /Bình/ }))
            const dialog = await screen.findByRole('dialog', { name: 'Transfer ownership to Bình?' })
            await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
            expect(await screen.findByRole('dialog', { name: 'Transfer ownership' })).toBeInTheDocument()
        })

        it('says a wrong password under the field, emptied', async () => {
            serversApi.transferOwnership.mockRejectedValue(apiError(400, 'AUTH_CURRENT_PASSWORD_INVALID'))
            renderAt('/channels/ot')
            useMembershipDialogs
                .getState()
                .show({ kind: 'transfer', serverId: 'ot', recipient: { userId: 'binh', name: 'Bình' } })
            const dialog = await screen.findByRole('dialog', { name: 'Transfer ownership to Bình?' })
            const field = within(dialog).getByLabelText('Your password')
            await userEvent.type(field, 'Wrong-Horse-1')
            await userEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }))
            expect(await within(dialog).findByText("That password isn't right")).toBeInTheDocument()
            expect(field).toHaveValue('')
        })

        it('says why the API refuses the one chosen: an account waiting to be deleted (D-161)', async () => {
            serversApi.transferOwnership.mockRejectedValue(
                apiError(422, 'VALIDATION_ERROR', { data: { rule: 'recipient_pending_deletion' } })
            )
            renderAt('/channels/ot')
            useMembershipDialogs
                .getState()
                .show({ kind: 'transfer', serverId: 'ot', recipient: { userId: 'binh', name: 'Bình' } })
            const dialog = await screen.findByRole('dialog', { name: 'Transfer ownership to Bình?' })
            await userEvent.type(within(dialog).getByLabelText('Your password'), 'Correct-Horse-1')
            await userEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }))
            expect(
                await within(dialog).findByText('Bình’s account is waiting to be deleted, so it can’t take ownership.')
            ).toBeInTheDocument()
        })

        it('reads the members again when the one chosen left meanwhile', async () => {
            rolesApi.fetchMembers.mockResolvedValue(page([BINH]))
            serversApi.transferOwnership.mockRejectedValue(apiError(404, 'NOT_FOUND_ERROR'))
            renderAt('/channels/ot')
            useMembershipDialogs.getState().show({ kind: 'transfer', serverId: 'ot' })
            await userEvent.click(await screen.findByRole('button', { name: /Bình/ }))
            const dialog = await screen.findByRole('dialog', { name: 'Transfer ownership to Bình?' })
            await userEvent.type(within(dialog).getByLabelText('Your password'), 'Correct-Horse-1')
            rolesApi.fetchMembers.mockResolvedValue(page([]))
            await userEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }))
            expect(await within(dialog).findByText('Bình is no longer in the server.')).toBeInTheDocument()

            await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
            expect(await screen.findByText('No other members yet')).toBeInTheDocument()
        })

        it('asks to leave even when the list cannot be read again after handing over', async () => {
            serversApi.transferOwnership.mockResolvedValue(undefined)
            renderAt('/channels/ot')
            useMembershipDialogs.getState().show({
                kind: 'transfer',
                serverId: 'ot',
                recipient: { userId: 'binh', name: 'Bình' },
                thenLeave: true
            })
            const dialog = await screen.findByRole('dialog', { name: 'Transfer ownership to Bình?' })
            serversApi.fetchServers.mockRejectedValue(new (await import('axios')).AxiosError('offline'))
            await userEvent.type(within(dialog).getByLabelText('Your password'), 'Correct-Horse-1')
            await userEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }))
            expect(await screen.findByRole('dialog', { name: 'Leave Ôn thi Giải tích 2?' })).toBeInTheDocument()
        })

        it('asks to leave once handed over, from the leave flow', async () => {
            serversApi.transferOwnership.mockResolvedValue(undefined)
            renderAt('/channels/ot')
            useMembershipDialogs.getState().show({
                kind: 'transfer',
                serverId: 'ot',
                recipient: { userId: 'binh', name: 'Bình' },
                thenLeave: true
            })
            const dialog = await screen.findByRole('dialog', { name: 'Transfer ownership to Bình?' })
            serversApi.fetchServers.mockResolvedValue([{ ...OT, isOwner: false }, ND, CG])
            await userEvent.type(within(dialog).getByLabelText('Your password'), 'Correct-Horse-1')
            await userEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }))
            expect(await screen.findByRole('dialog', { name: 'Leave Ôn thi Giải tích 2?' })).toBeInTheDocument()
        })
    })

    describe('deleting the account (10 S-ME-03 `delete-blocked-owner`)', () => {
        const BLOCKING = [
            { id: 'ot', name: 'Ôn thi Giải tích 2', memberCount: 13 },
            { id: 'nd', name: 'Nhóm Đề cương', memberCount: 6 }
        ]

        it('lists the servers to hand over first, each with its members, the focus on the first', async () => {
            renderAt('/study')
            useMembershipDialogs.getState().show({ kind: 'deletionBlocked', servers: BLOCKING })

            const dialog = await screen.findByRole('dialog', { name: 'Hand over your servers first' })
            expect(dialog).toHaveTextContent('You own 2 servers that have other members.')
            const ot = within(dialog).getByRole('button', { name: /Ôn thi Giải tích 2/ })
            expect(ot).toHaveTextContent('13 members')
            expect(within(dialog).getByRole('button', { name: /Nhóm Đề cương/ })).toHaveTextContent('6 members')
            await waitFor(() => expect(ot).toHaveFocus())
            await expectNoA11yViolations()
        })

        it('opens the handover of the server chosen, in its place', async () => {
            rolesApi.fetchMembers.mockResolvedValue(page([BINH]))
            renderAt('/study')
            useMembershipDialogs.getState().show({ kind: 'deletionBlocked', servers: BLOCKING })
            const dialog = await screen.findByRole('dialog', { name: 'Hand over your servers first' })

            await userEvent.click(within(dialog).getByRole('button', { name: /Nhóm Đề cương/ }))

            const picker = await screen.findByRole('dialog', { name: 'Transfer ownership' })
            expect(picker).toHaveTextContent('Nhóm Đề cương')
            expect(screen.queryByRole('dialog', { name: 'Hand over your servers first' })).not.toBeInTheDocument()
        })

        it('closes with Close', async () => {
            renderAt('/study')
            useMembershipDialogs.getState().show({ kind: 'deletionBlocked', servers: BLOCKING })
            const dialog = await screen.findByRole('dialog', { name: 'Hand over your servers first' })
            // The footer's, before the corner ×, which has the same name.
            await userEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]!)
            expect(useMembershipDialogs.getState().open).toBeNull()
        })
    })

    describe('serverOwnership (auth port, S-ME-03)', () => {
        const mine = (id: string, memberCount: number) => server(id, id, { isOwner: true, memberCount })

        it('reads the list again, so a member who joined since decides it', async () => {
            const { serverOwnership } = await import('../api/serverOwnership')
            const { QueryClient } = await import('@tanstack/react-query')
            const { serverKeys } = await import('../api/keys')
            const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
            queryClient.setQueryData(serverKeys.list(), [mine('ot', 1)])
            serversApi.fetchServers.mockResolvedValue([mine('ot', 2), mine('solo', 1), ND])

            const owned = await serverOwnership.owned(queryClient)

            expect(owned.blocking).toEqual([{ id: 'ot', name: 'ot', memberCount: 2 }])
            expect(owned.alone).toEqual([{ id: 'solo', name: 'solo', memberCount: 1 }])
        })

        it('goes by the list it has when it cannot read it, and by none without one', async () => {
            const { serverOwnership } = await import('../api/serverOwnership')
            const { QueryClient } = await import('@tanstack/react-query')
            const { serverKeys } = await import('../api/keys')
            const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
            serversApi.fetchServers.mockRejectedValue(new Error('offline'))

            expect(await serverOwnership.owned(queryClient)).toEqual({ blocking: [], alone: [] })
            queryClient.setQueryData(serverKeys.list(), [mine('ot', 13)])
            expect((await serverOwnership.owned(queryClient)).blocking).toEqual([
                { id: 'ot', name: 'ot', memberCount: 13 }
            ])
        })

        it('offline, goes by the list it has rather than wait for the connection', async () => {
            const { serverOwnership } = await import('../api/serverOwnership')
            const { QueryClient, onlineManager } = await import('@tanstack/react-query')
            const { serverKeys } = await import('../api/keys')
            const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
            queryClient.setQueryData(serverKeys.list(), [mine('ot', 13)])
            serversApi.fetchServers.mockRejectedValue(new (await import('axios')).AxiosError('offline'))
            onlineManager.setOnline(false)
            try {
                const owned = await Promise.race([
                    serverOwnership.owned(queryClient),
                    new Promise((resolve) => setTimeout(() => resolve('still waiting'), 500))
                ])
                expect(owned).toEqual({ blocking: [{ id: 'ot', name: 'ot', memberCount: 13 }], alone: [] })
            } finally {
                onlineManager.setOnline(true)
            }
        })

        it('shows the servers the API named, and reads the list again for their handover', async () => {
            const { serverOwnership } = await import('../api/serverOwnership')
            const { QueryClient } = await import('@tanstack/react-query')
            const { serverKeys } = await import('../api/keys')
            const queryClient = new QueryClient()
            queryClient.setQueryData(serverKeys.list(), [OT])

            serverOwnership.showBlocked(BLOCKING_ONE, queryClient)

            expect(useMembershipDialogs.getState().open).toEqual({ kind: 'deletionBlocked', servers: BLOCKING_ONE })
            expect(queryClient.getQueryState(serverKeys.list())?.isInvalidated).toBe(true)
        })
    })
})
