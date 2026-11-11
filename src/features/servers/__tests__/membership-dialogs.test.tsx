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
})
