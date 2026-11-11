import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuthStore } from '@/features/auth'
import { expectNoA11yViolations } from '@/test/a11y'
import { queryWrapper } from '@/test/helpers'
import type { MemberPage, Role, Server, ServerMember } from '../types'

const serversApi = { fetchServers: vi.fn() }
vi.mock('@/features/servers/api/servers.api', () => serversApi)
const rolesApi = {
    fetchRoles: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    reorderRoles: vi.fn(),
    grantRole: vi.fn(),
    revokeRole: vi.fn(),
    fetchMembers: vi.fn()
}
vi.mock('@/features/servers/api/roles.api', () => rolesApi)

const { default: ServerSettingsPage } = await import('../pages/ServerSettingsPage')

const bits = (...positions: number[]) => String(positions.reduce((all, bit) => all | (1n << BigInt(bit)), 0n))
const ADMINISTRATOR = 0
const MANAGE_ROLES = 2
const KICK = 4
const MODERATE = 6
const VIEW = 8
const STUDY_ROOMS = 20

const role = (id: string, name: string, position: number, permissions = '0', memberCount = 0): Role => ({
    id,
    name,
    position,
    permissions,
    mentionable: false,
    isEveryone: false,
    memberCount
})

/** ÔT (04 world A): Quản trị, Trưởng nhóm, Điều phối phòng học, Nhóm tài liệu, @everyone. */
const ROLES: Role[] = [
    role('admin', 'Quản trị', 4, bits(ADMINISTRATOR), 1),
    role('lead', 'Trưởng nhóm', 3, bits(MANAGE_ROLES, KICK, MODERATE), 2),
    role('mod', 'Điều phối phòng học', 2, bits(STUDY_ROOMS), 1),
    role('docs', 'Nhóm tài liệu', 1),
    { ...role('everyone', '@everyone', 0, bits(VIEW), 5), isEveryone: true }
]

/** Bình holds Trưởng nhóm: manages roles, kicks and times out. */
const binh: Server = {
    id: 'ot',
    name: 'Ôn thi Giải tích 2',
    iconUrl: null,
    isOwner: false,
    memberCount: 13,
    permissions: bits(MANAGE_ROLES, KICK, MODERATE, VIEW),
    topRolePosition: 3,
    roleIds: ['lead'],
    roles: [],
    timeoutUntil: null,
    welcomeChannelId: null,
    categories: [],
    channels: []
}

const member = (userId: string, displayName: string, roleIds: string[], isOwner = false): ServerMember => ({
    userId,
    username: displayName.toLowerCase(),
    displayName,
    avatarUrl: null,
    isOwner,
    roleIds,
    joinedAt: new Date('2026-11-01T00:00:00Z').toISOString() as never,
    timeoutUntil: null,
    timeoutReason: null
})
const page = (items: ServerMember[]): MemberPage => ({
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
    return <p data-testid='where'>{useLocation().pathname}</p>
}

function renderRoles(path = '/servers/ot/settings/roles', server = binh, roles = ROLES) {
    serversApi.fetchServers.mockResolvedValue([server])
    rolesApi.fetchRoles.mockResolvedValue(roles)
    const router = createMemoryRouter(
        [
            {
                element: (
                    <>
                        <Where />
                        <Outlet />
                    </>
                ),
                children: [
                    { path: '/servers/:serverId/settings/:section?', element: <ServerSettingsPage /> },
                    { path: '/servers/:serverId/settings/:section/:roleId', element: <ServerSettingsPage /> }
                ]
            }
        ],
        { initialEntries: [path] }
    )
    const view = render(
        <TooltipProvider>
            <RouterProvider router={router} />
            <Toaster />
        </TooltipProvider>,
        { wrapper: queryWrapper() }
    )
    return { router, ...view }
}

beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.clearAllMocks()
    useAuthStore.setState({ user: { id: 'binh' } as never })
})

describe('Roles list (S-SET-02)', () => {
    it('lists the roles highest first, locks Bình’s own and the one above, and keeps @everyone last', async () => {
        const { container } = renderRoles()
        const rows = await screen.findAllByRole('link', {
            name: /Quản trị|Trưởng nhóm|Điều phối|Nhóm tài liệu|@everyone/
        })
        expect(rows.map((row) => row.textContent)).toEqual([
            'Quản trịAbove you',
            'Trưởng nhómYour highest role',
            'Điều phối phòng học1 member',
            'Nhóm tài liệuNo one yet',
            '@everyoneEvery member'
        ])
        expect(screen.getByText(/You can only manage roles below Trưởng nhóm\./)).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Roles — 4' })).toBeInTheDocument()
        await expectNoA11yViolations(container)
    })

    it('moves a role by keyboard among those below theirs, and saves the order with the one seen', async () => {
        rolesApi.reorderRoles.mockResolvedValue(undefined)
        renderRoles()
        const docs = await screen.findByRole('link', { name: /Nhóm tài liệu/ })
        docs.focus()
        fireEvent.keyDown(docs, { key: ' ' })
        // Up past Điều phối, then again: Trưởng nhóm is Bình's own, so it stops there.
        fireEvent.keyDown(docs, { key: 'ArrowUp' })
        fireEvent.keyDown(docs, { key: 'ArrowUp' })
        fireEvent.keyDown(docs, { key: ' ' })
        await waitFor(() =>
            expect(rolesApi.reorderRoles).toHaveBeenCalledWith(
                'ot',
                ['admin', 'lead', 'docs', 'mod'],
                ['admin', 'lead', 'mod', 'docs']
            )
        )
    })

    it('puts the order back and says so when it is refused', async () => {
        rolesApi.reorderRoles.mockRejectedValue(new Error('offline'))
        renderRoles()
        const docs = await screen.findByRole('link', { name: /Nhóm tài liệu/ })
        fireEvent.keyDown(docs, { key: ' ' })
        fireEvent.keyDown(docs, { key: 'ArrowUp' })
        fireEvent.keyDown(docs, { key: ' ' })
        expect(await screen.findByText('Couldn’t save the change')).toBeInTheDocument()
        await waitFor(() =>
            expect(screen.getAllByRole('link').map((row) => row.textContent?.split(/\d| member|No one/)[0])).toContain(
                'Điều phối phòng học'
            )
        )
    })

    it('still says so when the order is refused again after leaving the list', async () => {
        rolesApi.reorderRoles.mockRejectedValue(new Error('offline'))
        const user = userEvent.setup()
        const { router } = renderRoles()
        const docs = await screen.findByRole('link', { name: /Nhóm tài liệu/ })
        fireEvent.keyDown(docs, { key: ' ' })
        fireEvent.keyDown(docs, { key: 'ArrowUp' })
        fireEvent.keyDown(docs, { key: ' ' })
        const again = await screen.findByRole('button', { name: 'Try again' })
        await act(() => router.navigate('/servers/ot/settings/roles/docs'))
        await user.click(again)
        await waitFor(() => expect(rolesApi.reorderRoles).toHaveBeenCalledTimes(2))
        // A new toast, not the one clicked (still fading out).
        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Try again' }).some((button) => button !== again)).toBe(true)
        )
    })

    it('checks a new name before asking, then opens the new role', async () => {
        rolesApi.createRole.mockResolvedValue('new-role')
        const user = userEvent.setup()
        const { router } = renderRoles()
        await user.click(await screen.findByRole('button', { name: 'Create role' }))
        const dialog = screen.getByRole('dialog', { name: 'Create role' })
        await user.type(within(dialog).getByLabelText('Role name'), 'trưởng nhóm')
        await user.click(within(dialog).getByRole('button', { name: 'Create role' }))
        expect(within(dialog).getByText('This server already has a role Trưởng nhóm')).toBeInTheDocument()
        expect(rolesApi.createRole).not.toHaveBeenCalled()

        rolesApi.fetchRoles.mockResolvedValue([...ROLES, role('new-role', 'Nhóm đề', 3)])
        await user.clear(within(dialog).getByLabelText('Role name'))
        await user.type(within(dialog).getByLabelText('Role name'), '  Nhóm đề ')
        await user.click(within(dialog).getByRole('button', { name: 'Create role' }))
        await waitFor(() => expect(router.state.location.pathname).toBe('/servers/ot/settings/roles/new-role'))
        expect(rolesApi.createRole).toHaveBeenCalledWith('ot', 'Nhóm đề', expect.any(String))
    })
})

describe('Edit role (S-SET-02 edit-role)', () => {
    it('saves a permission they hold at once, and locks one they lack (D-148)', async () => {
        rolesApi.updateRole.mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderRoles('/servers/ot/settings/roles/docs')
        const kick = await screen.findByRole('switch', { name: 'Kick members' })
        await user.click(kick)
        expect(rolesApi.updateRole).toHaveBeenCalledWith('ot', 'docs', { permissions: bits(KICK) })
        const ban = screen.getByRole('switch', { name: 'Ban members' })
        expect(ban).toHaveAttribute('aria-disabled', 'true')
        await user.click(ban)
        expect(rolesApi.updateRole).toHaveBeenCalledTimes(1)
    })

    it('offers Try again for a refused permission, on top of what was saved since (04 › Lưu thay đổi)', async () => {
        let saved = '0'
        const user = userEvent.setup()
        renderRoles('/servers/ot/settings/roles/docs')
        rolesApi.fetchRoles.mockImplementation(async () =>
            ROLES.map((one) => (one.id === 'docs' ? { ...one, permissions: saved } : one))
        )
        rolesApi.updateRole
            .mockRejectedValueOnce(new Error('offline'))
            .mockImplementation(async (_server: string, _role: string, body: { permissions: string }) => {
                saved = body.permissions
            })
        await user.click(await screen.findByRole('switch', { name: 'Kick members' }))
        const again = await screen.findByRole('button', { name: 'Try again' })
        await waitFor(() => expect(screen.getByRole('switch', { name: 'Kick members' })).not.toBeChecked())

        await user.click(screen.getByRole('switch', { name: 'Time out members' }))
        await waitFor(() => expect(screen.getByRole('switch', { name: 'Time out members' })).toBeChecked())
        await user.click(again)
        await waitFor(() =>
            expect(rolesApi.updateRole).toHaveBeenLastCalledWith('ot', 'docs', { permissions: bits(KICK, MODERATE) })
        )
    })

    it('tries a refused permission again after the tab was left, on top of what was saved since', async () => {
        let saved = '0'
        const user = userEvent.setup()
        renderRoles('/servers/ot/settings/roles/docs')
        rolesApi.fetchRoles.mockImplementation(async () =>
            ROLES.map((one) => (one.id === 'docs' ? { ...one, permissions: saved } : one))
        )
        rolesApi.fetchMembers.mockResolvedValue(page([]))
        rolesApi.updateRole
            .mockRejectedValueOnce(new Error('offline'))
            .mockImplementation(async (_server: string, _role: string, body: { permissions: string }) => {
                saved = body.permissions
            })
        await user.click(await screen.findByRole('switch', { name: 'Kick members' }))
        const again = await screen.findByRole('button', { name: 'Try again' })
        await user.click(screen.getByRole('tab', { name: /Members/ }))
        await user.click(await screen.findByRole('tab', { name: /Permissions/ }))
        await user.click(await screen.findByRole('switch', { name: 'Time out members' }))
        await waitFor(() => expect(saved).toBe(bits(MODERATE)))
        await user.click(again)
        await waitFor(() =>
            expect(rolesApi.updateRole).toHaveBeenLastCalledWith('ot', 'docs', { permissions: bits(KICK, MODERATE) })
        )
    })

    it('still says so when "mention" is refused again after the tab was left', async () => {
        rolesApi.updateRole.mockRejectedValue(new Error('offline'))
        rolesApi.fetchMembers.mockResolvedValue(page([]))
        const user = userEvent.setup()
        renderRoles('/servers/ot/settings/roles/docs')
        await user.click(await screen.findByRole('switch', { name: 'Let anyone mention @Nhóm tài liệu' }))
        const again = await screen.findByRole('button', { name: 'Try again' })
        await user.click(screen.getByRole('tab', { name: /Members/ }))
        await user.click(again)
        await waitFor(() => expect(rolesApi.updateRole).toHaveBeenCalledTimes(2))
        // A new toast, not the one clicked (still fading out).
        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Try again' }).some((button) => button !== again)).toBe(true)
        )
    })

    it('offers Try again when "mention" is refused', async () => {
        rolesApi.updateRole.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderRoles('/servers/ot/settings/roles/docs')
        await user.click(await screen.findByRole('switch', { name: 'Let anyone mention @Nhóm tài liệu' }))
        expect(await screen.findByText('Couldn’t save the change')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Try again' }))
        await waitFor(() => expect(rolesApi.updateRole).toHaveBeenCalledTimes(2))
        expect(rolesApi.updateRole).toHaveBeenLastCalledWith('ot', 'docs', { mentionable: true })
    })

    it('greys out the other switches while Administrator is on', async () => {
        renderRoles('/servers/ot/settings/roles/admin', { ...binh, isOwner: true })
        expect(await screen.findByText('Administrator already includes every permission below.')).toBeInTheDocument()
        expect(screen.getByRole('switch', { name: 'Administrator' })).toBeEnabled()
        expect(screen.getByRole('switch', { name: 'Kick members' })).toBeDisabled()
    })

    it('opens their own highest role read-only, with no Delete', async () => {
        renderRoles('/servers/ot/settings/roles/lead')
        expect(await screen.findByText('This is your highest role, so you can only view it.')).toBeInTheDocument()
        expect(screen.getByLabelText('Role name')).toHaveAttribute('readonly')
        expect(screen.getByRole('switch', { name: 'Kick members' })).toBeDisabled()
        expect(screen.queryByRole('button', { name: 'Delete role' })).not.toBeInTheDocument()
    })

    it('locks Delete for a role carrying a permission they lack (D-148)', async () => {
        const user = userEvent.setup()
        renderRoles('/servers/ot/settings/roles/mod')
        const locked = await screen.findByRole('button', { name: 'Delete role' })
        expect(locked).toHaveAttribute('aria-disabled', 'true')
        await user.click(locked)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('deletes a role after asking, back to the list', async () => {
        rolesApi.deleteRole.mockResolvedValue(undefined)
        const user = userEvent.setup()
        const { router } = renderRoles('/servers/ot/settings/roles/docs')
        await user.click(await screen.findByRole('button', { name: 'Delete role' }))
        const dialog = screen.getByRole('dialog', { name: 'Delete role Nhóm tài liệu?' })
        await user.click(within(dialog).getByRole('button', { name: 'Delete role' }))
        await waitFor(() => expect(router.state.location.pathname).toBe('/servers/ot/settings/roles'))
        expect(rolesApi.deleteRole).toHaveBeenCalledWith('ot', 'docs')
    })

    it('shows only the permissions of @everyone, with no name, tabs or Delete', async () => {
        renderRoles('/servers/ot/settings/roles/everyone')
        expect(
            await screen.findByText('Permissions of everyone in the server. Other roles add to these.')
        ).toBeInTheDocument()
        expect(screen.queryByLabelText('Role name')).not.toBeInTheDocument()
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Delete role' })).not.toBeInTheDocument()
    })
})

describe('Role members (S-SET-02 role-members, members-add)', () => {
    it('takes a role back at once, with Undo giving it again', async () => {
        rolesApi.fetchMembers.mockResolvedValue(page([member('chi', 'Chi', ['docs'])]))
        rolesApi.revokeRole.mockResolvedValue(undefined)
        rolesApi.grantRole.mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderRoles('/servers/ot/settings/roles/docs?tab=members')
        await user.click(await screen.findByRole('button', { name: 'Remove Nhóm tài liệu from Chi' }))
        expect(rolesApi.revokeRole).toHaveBeenCalledWith('ot', 'docs', 'chi')
        await user.click(await screen.findByRole('button', { name: 'Undo' }))
        await waitFor(() => expect(rolesApi.grantRole).toHaveBeenCalledWith('ot', 'docs', ['chi']))
    })

    it('offers Try again when taking the role back is refused (04 › Toast)', async () => {
        rolesApi.fetchMembers.mockResolvedValue(page([member('chi', 'Chi', ['docs'])]))
        rolesApi.revokeRole.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderRoles('/servers/ot/settings/roles/docs?tab=members')
        await user.click(await screen.findByRole('button', { name: 'Remove Nhóm tài liệu from Chi' }))
        expect(await screen.findByText('Couldn’t save the change')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Try again' }))
        await waitFor(() => expect(rolesApi.revokeRole).toHaveBeenCalledTimes(2))
        expect(rolesApi.revokeRole).toHaveBeenLastCalledWith('ot', 'docs', 'chi')
    })

    it('offers Try again when Undo is refused', async () => {
        rolesApi.fetchMembers.mockResolvedValue(page([member('chi', 'Chi', ['docs'])]))
        rolesApi.revokeRole.mockResolvedValue(undefined)
        rolesApi.grantRole.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderRoles('/servers/ot/settings/roles/docs?tab=members')
        await user.click(await screen.findByRole('button', { name: 'Remove Nhóm tài liệu from Chi' }))
        await user.click(await screen.findByRole('button', { name: 'Undo' }))
        await user.click(await screen.findByRole('button', { name: 'Try again' }))
        await waitFor(() => expect(rolesApi.grantRole).toHaveBeenCalledTimes(2))
        expect(rolesApi.grantRole).toHaveBeenLastCalledWith('ot', 'docs', ['chi'])
    })

    it('says the role was taken back when Try again works after the tab was left', async () => {
        rolesApi.fetchMembers.mockResolvedValue(page([member('chi', 'Chi', ['docs'])]))
        rolesApi.revokeRole.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderRoles('/servers/ot/settings/roles/docs?tab=members')
        await user.click(await screen.findByRole('button', { name: 'Remove Nhóm tài liệu from Chi' }))
        const again = await screen.findByRole('button', { name: 'Try again' })
        await user.click(screen.getByRole('tab', { name: /Permissions/ }))
        await user.click(again)
        expect(await screen.findByText('Removed Nhóm tài liệu from Chi')).toBeInTheDocument()
    })

    it('still offers Try again when Undo is refused after the tab was left', async () => {
        rolesApi.fetchMembers.mockResolvedValue(page([member('chi', 'Chi', ['docs'])]))
        rolesApi.revokeRole.mockResolvedValue(undefined)
        rolesApi.grantRole.mockRejectedValue(new Error('offline'))
        const user = userEvent.setup()
        renderRoles('/servers/ot/settings/roles/docs?tab=members')
        await user.click(await screen.findByRole('button', { name: 'Remove Nhóm tài liệu from Chi' }))
        const undo = await screen.findByRole('button', { name: 'Undo' })
        await user.click(screen.getByRole('tab', { name: /Permissions/ }))
        await user.click(undo)
        expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    })

    it('asks before Bình takes a role giving him Manage roles off himself', async () => {
        rolesApi.fetchMembers.mockResolvedValue(page([member('binh', 'Bình', ['lead', 'docs'])]))
        rolesApi.revokeRole.mockResolvedValue(undefined)
        const managing = ROLES.map((r) => (r.id === 'docs' ? { ...r, permissions: bits(MANAGE_ROLES) } : r))
        const user = userEvent.setup()
        renderRoles('/servers/ot/settings/roles/docs?tab=members', binh, managing)
        await user.click(await screen.findByRole('button', { name: 'Remove Nhóm tài liệu from Bình' }))
        const dialog = screen.getByRole('dialog', { name: 'Remove Nhóm tài liệu from yourself?' })
        expect(rolesApi.revokeRole).not.toHaveBeenCalled()
        await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
        await waitFor(() => expect(rolesApi.revokeRole).toHaveBeenCalledWith('ot', 'docs', 'binh'))
    })

    it('adds the people ticked in one request, locking those who have it or rank above', async () => {
        rolesApi.fetchMembers.mockImplementation(async (_server: string, query: { roleId?: string }) =>
            query.roleId
                ? page([])
                : page([
                      member('an', 'An', ['admin'], true),
                      member('chi', 'Chi', ['docs']),
                      member('dung', 'Dũng', []),
                      member('ha', 'Hà', ['lead'])
                  ])
        )
        rolesApi.grantRole.mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderRoles('/servers/ot/settings/roles/docs?tab=members')
        await user.click(await screen.findByRole('button', { name: 'Add members' }))
        const dialog = screen.getByRole('dialog', { name: 'Add to Nhóm tài liệu' })
        const box = async (name: string) =>
            within((await within(dialog).findByText(name)).closest('label')!).getByRole('checkbox')
        expect(await box('Chi')).toBeChecked()
        expect(await box('Chi')).toBeDisabled()
        expect(await box('An')).toBeDisabled()
        expect(await box('Hà')).toBeDisabled()
        expect(within(dialog).getByRole('button', { name: 'Add' })).toBeDisabled()
        await user.click(await box('Dũng'))
        await user.click(within(dialog).getByRole('button', { name: 'Add (1)' }))
        await waitFor(() => expect(rolesApi.grantRole).toHaveBeenCalledWith('ot', 'docs', ['dung']))
        expect(await screen.findByText('Added 1 person to Nhóm tài liệu')).toBeInTheDocument()
    })
})
