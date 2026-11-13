import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import { Toaster } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuthStore } from '@/features/auth'
import { expectNoA11yViolations } from '@/test/a11y'
import { queryWrapper } from '@/test/helpers'
import type { BanItem, BanPage, MemberPage, Role, Server, ServerMember } from '../types'

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
const moderationApi = {
    kickMember: vi.fn(),
    timeoutMember: vi.fn(),
    banMember: vi.fn(),
    unbanMember: vi.fn(),
    fetchBans: vi.fn()
}
vi.mock('@/features/servers/api/moderation.api', () => moderationApi)

const { default: ServerSettingsPage } = await import('../pages/ServerSettingsPage')

const bits = (...positions: number[]) => String(positions.reduce((all, bit) => all | (1n << BigInt(bit)), 0n))
const MANAGE_ROLES = 2
const KICK = 4
const BAN = 5
const MODERATE = 6
const VIEW = 8

/** ÔT (04 world A): Quản trị on top, Trưởng nhóm, Nhóm tài liệu. */
const serverRoles: Server['roles'] = [
    { id: 'admin', name: 'Quản trị', position: 3, administrator: true },
    { id: 'lead', name: 'Trưởng nhóm', position: 2, administrator: false },
    { id: 'docs', name: 'Nhóm tài liệu', position: 1, administrator: false }
]

/** Bình holds Trưởng nhóm: kicks and times out, no roles to hand out, no bans (S-SET-03 `moderator`). */
const binh: Server = {
    id: 'ot',
    name: 'Ôn thi Giải tích 2',
    iconUrl: null,
    isOwner: false,
    memberCount: 13,
    permissions: bits(KICK, MODERATE, VIEW),
    topRolePosition: 2,
    roleIds: ['lead'],
    roles: serverRoles,
    timeoutUntil: null,
    welcomeChannelId: null,
    categories: [],
    channels: []
}
/** An owns it: every bit. */
const an: Server = {
    ...binh,
    isOwner: true,
    permissions: bits(0, MANAGE_ROLES, KICK, BAN, MODERATE, VIEW),
    roleIds: []
}

const member = (userId: string, displayName: string, roleIds: string[], extra: Partial<ServerMember> = {}) =>
    ({
        userId,
        username: displayName.toLowerCase(),
        displayName,
        avatarUrl: null,
        isOwner: false,
        roleIds,
        joinedAt: '2026-10-02T03:00:00Z',
        timeoutUntil: null,
        timeoutReason: null,
        ...extra
    }) as ServerMember

const MEMBERS = [
    member('an', 'An', [], { isOwner: true }),
    member('binh', 'Bình', ['lead']),
    member('dung', 'Dũng', []),
    member('phong', 'Phong', [], { timeoutUntil: '2999-01-01T15:30:00Z', timeoutReason: 'Gửi tin liên tục' })
]

const meta = (total: number, page = 1, limit = 50) => ({
    currentPage: page,
    itemsPerPage: limit,
    totalItems: total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1
})
const page = (items: ServerMember[], total = items.length): MemberPage => ({ items, meta: meta(total) })

const ROLES: Role[] = [
    {
        id: 'admin',
        name: 'Quản trị',
        position: 3,
        permissions: bits(0),
        mentionable: false,
        isEveryone: false,
        memberCount: 0
    },
    {
        id: 'lead',
        name: 'Trưởng nhóm',
        position: 2,
        permissions: bits(KICK),
        mentionable: false,
        isEveryone: false,
        memberCount: 1
    },
    {
        id: 'docs',
        name: 'Nhóm tài liệu',
        position: 1,
        permissions: '0',
        mentionable: false,
        isEveryone: false,
        memberCount: 0
    },
    {
        id: 'everyone',
        name: '@everyone',
        position: 0,
        permissions: bits(VIEW),
        mentionable: false,
        isEveryone: true,
        memberCount: 4
    }
]

const refused = (type: string, status: number, data: object | null = null) =>
    new AxiosError('refused', String(status), undefined, undefined, {
        status,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { meta: { type, code: String(status) }, data }
    })

function renderPage(path: string, server: Server, me = 'binh') {
    useAuthStore.setState({ user: { id: me } as never })
    serversApi.fetchServers.mockResolvedValue([server])
    const router = createMemoryRouter(
        [{ path: '/servers/:serverId/settings/:section?', element: <ServerSettingsPage /> }],
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

const rowOf = async (name: string) =>
    (await screen.findAllByRole('row')).find((row) => within(row).queryByText(name, { exact: true }))!

beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.clearAllMocks()
    rolesApi.fetchMembers.mockResolvedValue(page(MEMBERS))
    rolesApi.fetchRoles.mockResolvedValue(ROLES)
})

describe('Members (S-SET-03)', () => {
    it('shows Bình a ⋯ only on those below, with what his bits allow, and no "+" (moderator)', async () => {
        const user = userEvent.setup()
        const { container } = renderPage('/servers/ot/settings/members', binh)
        expect(await screen.findByText('4 members')).toBeInTheDocument()
        expect(rolesApi.fetchMembers).toHaveBeenCalledWith(
            'ot',
            expect.objectContaining({ sort: 'name', order: 'asc', page: 1, limit: 50 })
        )
        expect(within(await rowOf('An')).getByText('Server owner')).toBeInTheDocument()
        expect(within(await rowOf('An')).queryByRole('button', { name: /Actions for/ })).toBeNull()
        expect(within(await rowOf('Bình')).queryByRole('button', { name: /Actions for/ })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Assign roles' })).toBeNull()
        // Roles are read from the server, not from GET /roles, which needs MANAGE_ROLES.
        expect(rolesApi.fetchRoles).not.toHaveBeenCalled()
        expect(within(await rowOf('Bình')).getByText('Trưởng nhóm')).toBeInTheDocument()

        await user.click(within(await rowOf('Dũng')).getByRole('button', { name: 'Actions for Dũng' }))
        const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent)
        expect(items).toEqual(['Time out', 'Kick from server'])
        await user.keyboard('{Escape}')
        await expectNoA11yViolations(container)
    })

    it('reads the time zone from the settings in the cache, never asking for them and logging nothing', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        try {
            renderPage('/servers/ot/settings/members', binh)
            expect(await screen.findByText('4 members')).toBeInTheDocument()
            expect(logged.mock.calls.filter(([message]) => String(message).includes('queryFn'))).toEqual([])
        } finally {
            logged.mockRestore()
        }
    })

    it('offers the owner a handover at the end of ⋯, set apart, but not to someone timed out (Q15, D-91)', async () => {
        const { useMembershipDialogs } = await import('../membership-dialogs.store')
        const user = userEvent.setup()
        renderPage('/servers/ot/settings/members', an, 'an')

        await user.click(within(await rowOf('Dũng')).getByRole('button', { name: 'Actions for Dũng' }))
        const menu = await screen.findByRole('menu')
        expect(
            within(menu)
                .getAllByRole('menuitem')
                .map((item) => item.textContent)
        ).toEqual(['Time out', 'Kick from server', 'Ban from server', 'Transfer ownership'])
        expect(within(menu).getByRole('separator')).toBeInTheDocument()
        await user.click(within(menu).getByRole('menuitem', { name: 'Transfer ownership' }))
        expect(useMembershipDialogs.getState().open).toEqual({
            kind: 'transfer',
            serverId: 'ot',
            recipient: { userId: 'dung', name: 'Dũng' }
        })
        useMembershipDialogs.getState().hide()

        await user.click(within(await rowOf('Phong')).getByRole('button', { name: 'Actions for Phong' }))
        expect(await screen.findByRole('menuitem', { name: 'Remove timeout' })).toBeInTheDocument()
        expect(screen.queryByRole('menuitem', { name: 'Transfer ownership' })).not.toBeInTheDocument()
    })

    it('shows a running timeout under the name, and ends it at once from ⋯', async () => {
        const user = userEvent.setup()
        moderationApi.timeoutMember.mockResolvedValue(undefined)
        renderPage('/servers/ot/settings/members', binh)
        const row = await rowOf('Phong')
        expect(within(row).getByText(/^Timed out until/)).toBeInTheDocument()
        expect(within(row).getByText('Reason: Gửi tin liên tục')).toBeInTheDocument()

        await user.click(within(row).getByRole('button', { name: 'Actions for Phong' }))
        expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
            'Change timeout',
            'Remove timeout',
            'Kick from server'
        ])
        await user.click(screen.getByRole('menuitem', { name: 'Remove timeout' }))
        await waitFor(() => expect(moderationApi.timeoutMember).toHaveBeenCalledWith('ot', 'phong', null, null))
        expect(await screen.findByText('Removed the timeout of Phong')).toBeInTheDocument()
    })

    it('offers Try again when ending a timeout is refused (04 › Toast)', async () => {
        const user = userEvent.setup()
        moderationApi.timeoutMember.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
        renderPage('/servers/ot/settings/members', binh)
        await user.click(within(await rowOf('Phong')).getByRole('button', { name: 'Actions for Phong' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Remove timeout' }))
        expect(await screen.findByText('Couldn’t save the change')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('Removed the timeout of Phong')).toBeInTheDocument()
        expect(moderationApi.timeoutMember).toHaveBeenCalledTimes(2)
    })

    it('opens Time out on its chosen length, and Kick and Ban on Cancel (04 › Bàn phím, C-14 danger)', async () => {
        const user = userEvent.setup()
        renderPage('/servers/ot/settings/members', an, 'an')
        const open = async (item: string, title: string) => {
            await user.click(within(await rowOf('Dũng')).getByRole('button', { name: 'Actions for Dũng' }))
            await user.click(await screen.findByRole('menuitem', { name: item }))
            return screen.findByRole('dialog', { name: title })
        }

        let dialog = await open('Time out', 'Time out Dũng')
        await waitFor(() => expect(within(dialog).getByRole('radio', { name: '1 hour' })).toHaveFocus())
        await user.keyboard('{Escape}')
        dialog = await open('Kick from server', 'Kick Dũng from the server?')
        await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus())
        await user.keyboard('{Escape}')
        dialog = await open('Ban from server', 'Ban Dũng from the server?')
        await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus())
    })

    it('times out for 1 hour by default with the reason, then says so', async () => {
        const user = userEvent.setup()
        moderationApi.timeoutMember.mockResolvedValue(undefined)
        renderPage('/servers/ot/settings/members', binh)
        await user.click(within(await rowOf('Dũng')).getByRole('button', { name: 'Actions for Dũng' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Time out' }))

        const dialog = await screen.findByRole('dialog', { name: 'Time out Dũng' })
        expect(within(dialog).getByRole('radio', { name: '1 hour' })).toBeChecked()
        expect(within(dialog).getByText(/^Ends at /)).toBeInTheDocument()
        await user.click(within(dialog).getByRole('radio', { name: '1 day' }))
        await user.type(within(dialog).getByLabelText('Reason (optional)'), '  Spam  ')
        expect(within(dialog).getByText('4/512')).toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', { name: 'Time out' }))

        await waitFor(() => expect(moderationApi.timeoutMember).toHaveBeenCalledWith('ot', 'dung', 86_400, 'Spam'))
        expect(await screen.findByText('Timed out Dũng for 1 day')).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('times out with Ctrl + Enter from the reason, a blank reason sent as none, and tries again after a failure', async () => {
        const user = userEvent.setup()
        moderationApi.timeoutMember.mockRejectedValueOnce(new AxiosError('offline')).mockResolvedValueOnce(undefined)
        renderPage('/servers/ot/settings/members', binh)
        await user.click(within(await rowOf('Dũng')).getByRole('button', { name: 'Actions for Dũng' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Time out' }))
        const dialog = await screen.findByRole('dialog', { name: 'Time out Dũng' })
        await user.click(within(dialog).getByRole('radio', { name: '1 week' }))
        await user.type(within(dialog).getByLabelText('Reason (optional)'), '   {Control>}{Enter}{/Control}')
        expect(
            await within(dialog).findByText('Couldn’t do that. Check your connection and try again.')
        ).toBeInTheDocument()
        expect(moderationApi.timeoutMember).toHaveBeenLastCalledWith('ot', 'dung', 604_800, null)
        await user.click(within(dialog).getByRole('button', { name: 'Time out' }))
        expect(await screen.findByText('Timed out Dũng for 1 week')).toBeInTheDocument()
        expect(moderationApi.timeoutMember).toHaveBeenCalledTimes(2)
    })

    it('sends one timeout while it is out, Ctrl + Enter again included', async () => {
        const user = userEvent.setup()
        moderationApi.timeoutMember.mockReturnValue(new Promise(() => {}))
        renderPage('/servers/ot/settings/members', binh)
        await user.click(within(await rowOf('Dũng')).getByRole('button', { name: 'Actions for Dũng' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Time out' }))
        const dialog = await screen.findByRole('dialog', { name: 'Time out Dũng' })
        await user.click(within(dialog).getByRole('button', { name: 'Time out' }))
        await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Time out' })).toBeDisabled())
        await user.type(within(dialog).getByLabelText('Reason (optional)'), '{Control>}{Enter}{/Control}')
        expect(moderationApi.timeoutMember).toHaveBeenCalledTimes(1)
    })

    it('says when the person now outranks them, and keeps the action off', async () => {
        const user = userEvent.setup()
        moderationApi.kickMember.mockRejectedValue(refused('ROLE_HIERARCHY_VIOLATION', 403))
        renderPage('/servers/ot/settings/members', binh)
        await user.click(within(await rowOf('Dũng')).getByRole('button', { name: 'Actions for Dũng' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Kick from server' }))

        const dialog = await screen.findByRole('dialog', { name: 'Kick Dũng from the server?' })
        await user.type(within(dialog).getByLabelText('Reason (optional)'), 'Quảng cáo')
        await user.click(within(dialog).getByRole('button', { name: 'Kick' }))
        await waitFor(() => expect(moderationApi.kickMember).toHaveBeenCalledWith('ot', 'dung', 'Quảng cáo'))
        expect(
            await within(dialog).findByText('Dũng now has a role equal to or above yours, so you can’t do this.')
        ).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Kick' })).toBeDisabled()
    })

    it('keeps Ctrl + Enter off too once the person outranks them', async () => {
        const user = userEvent.setup()
        moderationApi.kickMember.mockRejectedValue(refused('ROLE_HIERARCHY_VIOLATION', 403))
        renderPage('/servers/ot/settings/members', binh)
        await user.click(within(await rowOf('Dũng')).getByRole('button', { name: 'Actions for Dũng' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Kick from server' }))
        const dialog = await screen.findByRole('dialog', { name: 'Kick Dũng from the server?' })
        await user.click(within(dialog).getByRole('button', { name: 'Kick' }))
        await within(dialog).findByText('Dũng now has a role equal to or above yours, so you can’t do this.')
        await user.type(within(dialog).getByLabelText('Reason (optional)'), '{Control>}{Enter}{/Control}')
        expect(moderationApi.kickMember).toHaveBeenCalledTimes(1)
    })

    it('keeps Ctrl + Enter off in Time out too once the person outranks them', async () => {
        const user = userEvent.setup()
        moderationApi.timeoutMember.mockRejectedValue(refused('ROLE_HIERARCHY_VIOLATION', 403))
        renderPage('/servers/ot/settings/members', binh)
        await user.click(within(await rowOf('Dũng')).getByRole('button', { name: 'Actions for Dũng' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Time out' }))
        const dialog = await screen.findByRole('dialog', { name: 'Time out Dũng' })
        await user.click(within(dialog).getByRole('button', { name: 'Time out' }))
        await within(dialog).findByText('Dũng now has a role equal to or above yours, so you can’t do this.')
        await user.type(within(dialog).getByLabelText('Reason (optional)'), '{Control>}{Enter}{/Control}')
        expect(moderationApi.timeoutMember).toHaveBeenCalledTimes(1)
    })

    it('lets a retry follow a dropped connection', async () => {
        const user = userEvent.setup()
        moderationApi.banMember.mockRejectedValueOnce(new AxiosError('offline')).mockResolvedValueOnce(undefined)
        renderPage('/servers/ot/settings/members', an, 'an')
        await user.click(within(await rowOf('Dũng')).getByRole('button', { name: 'Actions for Dũng' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Ban from server' }))
        const dialog = await screen.findByRole('dialog', { name: 'Ban Dũng from the server?' })
        await user.click(within(dialog).getByRole('button', { name: 'Ban' }))
        expect(
            await within(dialog).findByText('Couldn’t do that. Check your connection and try again.')
        ).toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', { name: 'Ban' }))
        expect(await screen.findByText('Banned Dũng')).toBeInTheDocument()
        expect(moderationApi.banMember).toHaveBeenLastCalledWith('ot', 'dung', null)
    })

    it.each([
        ['Kick from server', 'Kick Dũng from the server?', 'Kick', moderationApi.kickMember],
        ['Ban from server', 'Ban Dũng from the server?', 'Ban', moderationApi.banMember]
    ])(
        'counts the members again after "%s", so Leave and Delete server go by who is left',
        async (item, title, submit, send) => {
            const user = userEvent.setup()
            send.mockResolvedValue(undefined)
            renderPage('/servers/ot/settings/members', an, 'an')
            await user.click(within(await rowOf('Dũng')).getByRole('button', { name: 'Actions for Dũng' }))
            await user.click(await screen.findByRole('menuitem', { name: item }))
            const dialog = await screen.findByRole('dialog', { name: title })
            expect(serversApi.fetchServers).toHaveBeenCalledTimes(1)
            await user.click(within(dialog).getByRole('button', { name: submit }))
            await waitFor(() => expect(serversApi.fetchServers).toHaveBeenCalledTimes(2))
        }
    )

    it('stays on the page, and says the kick is done, when reading the servers again then fails', async () => {
        const user = userEvent.setup()
        moderationApi.kickMember.mockResolvedValue(undefined)
        renderPage('/servers/ot/settings/members', an, 'an')
        await user.click(within(await rowOf('Dũng')).getByRole('button', { name: 'Actions for Dũng' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Kick from server' }))
        const dialog = await screen.findByRole('dialog', { name: 'Kick Dũng from the server?' })
        serversApi.fetchServers.mockRejectedValue(new Error('offline'))
        await user.click(within(dialog).getByRole('button', { name: 'Kick' }))
        expect(await screen.findByText('Kicked Dũng from the server')).toBeInTheDocument()
        await waitFor(() => expect(serversApi.fetchServers).toHaveBeenCalledTimes(2))
        await act(async () => {})
        expect(screen.getByRole('table')).toBeInTheDocument()
    })

    it('finds a role in "+" past ten roles when typed without accents, and says when none matches', async () => {
        const user = userEvent.setup()
        const groups = Array.from({ length: 9 }, (_, index) => ({
            ...ROLES[2],
            id: `group-${index}`,
            name: `Nhóm ${index + 1}`,
            position: 11 - index
        }))
        rolesApi.fetchRoles.mockResolvedValue([
            ...groups,
            { ...ROLES[2], id: 'outline', name: 'Đề cương', position: 1 },
            ROLES[3]
        ])
        renderPage('/servers/ot/settings/members', an, 'an')
        await user.click(within(await rowOf('Dũng')).getByRole('button', { name: 'Assign roles' }))
        const picker = await screen.findByRole('dialog', { name: 'Roles of Dũng' })
        await user.type(within(picker).getByRole('textbox', { name: 'Find a role' }), 'de cuong')
        expect(
            within(picker)
                .getAllByRole('listitem')
                .map((item) => item.textContent)
        ).toEqual(['Đề cương'])

        await user.clear(within(picker).getByRole('textbox', { name: 'Find a role' }))
        await user.type(within(picker).getByRole('textbox', { name: 'Find a role' }), 'xyz')
        expect(within(picker).getByText('No role matches “xyz”')).toBeInTheDocument()
    })

    it('refuses to time out someone holding Administrator, with the reason (D-147)', async () => {
        const user = userEvent.setup()
        moderationApi.timeoutMember.mockRejectedValue(refused('VALIDATION_ERROR', 422, { rule: 'target_admin' }))
        renderPage('/servers/ot/settings/members', an, 'an')
        await user.click(within(await rowOf('Dũng')).getByRole('button', { name: 'Actions for Dũng' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Time out' }))
        const dialog = await screen.findByRole('dialog', { name: 'Time out Dũng' })
        await user.click(within(dialog).getByRole('button', { name: 'Time out' }))
        expect(
            await within(dialog).findByText(/Dũng has Administrator, so they can’t be timed out/)
        ).toBeInTheDocument()
    })

    it('hands out roles from "+", saved at each tick, for the owner', async () => {
        const user = userEvent.setup()
        rolesApi.grantRole.mockResolvedValue(undefined)
        rolesApi.revokeRole.mockResolvedValue(undefined)
        renderPage('/servers/ot/settings/members', an, 'an')
        const row = await rowOf('Bình')
        await user.click(await within(row).findByRole('button', { name: 'Assign roles' }))
        const picker = await screen.findByRole('dialog', { name: 'Roles of Bình' })
        expect(
            within(picker)
                .getAllByRole('listitem')
                .map((item) => item.textContent)
        ).toEqual(['Quản trị', 'Trưởng nhóm', 'Nhóm tài liệu'])
        expect(within(picker).getByLabelText('Trưởng nhóm')).toBeChecked()
        await user.click(within(picker).getByLabelText('Nhóm tài liệu'))
        await waitFor(() => expect(rolesApi.grantRole).toHaveBeenCalledWith('ot', 'docs', ['binh']))
        await user.click(within(picker).getByLabelText('Trưởng nhóm'))
        await waitFor(() => expect(rolesApi.revokeRole).toHaveBeenCalledWith('ot', 'lead', 'binh'))
    })

    it('searches after typing stops and sorts by a column, from page 1, on the URL', async () => {
        const user = userEvent.setup()
        const { router } = renderPage('/servers/ot/settings/members?page=2', binh)
        await screen.findByText('4 members')
        await user.type(screen.getByRole('searchbox', { name: 'Search by name or username' }), ' dung ')
        await waitFor(() =>
            expect(rolesApi.fetchMembers).toHaveBeenLastCalledWith(
                'ot',
                expect.objectContaining({ q: 'dung', page: 1 })
            )
        )
        expect(router.state.location.search).toBe('?q=dung')
        // Only once typing stopped: no request for the letters on the way.
        for (const partial of ['d', 'du', 'dun'])
            expect(rolesApi.fetchMembers).not.toHaveBeenCalledWith('ot', expect.objectContaining({ q: partial }))

        await user.click(screen.getByRole('button', { name: 'Joined' }))
        await waitFor(() =>
            expect(rolesApi.fetchMembers).toHaveBeenLastCalledWith(
                'ot',
                expect.objectContaining({ sort: 'joined_at', order: 'desc', page: 1, q: 'dung' })
            )
        )
        await user.click(screen.getByRole('button', { name: 'Joined' }))
        await waitFor(() =>
            expect(rolesApi.fetchMembers).toHaveBeenLastCalledWith(
                'ot',
                expect.objectContaining({ sort: 'joined_at', order: 'asc' })
            )
        )
    })

    it('says the timeout ended when Try again works after leaving the page', async () => {
        const user = userEvent.setup()
        moderationApi.timeoutMember.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
        const { router } = renderPage('/servers/ot/settings/members', binh)
        await user.click(within(await rowOf('Phong')).getByRole('button', { name: 'Actions for Phong' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Remove timeout' }))
        const again = await screen.findByRole('button', { name: 'Try again' })
        await act(() => router.navigate('/servers/ot/settings/roles'))
        await user.click(again)
        expect(await screen.findByText('Removed the timeout of Phong')).toBeInTheDocument()
    })

    it('still says so when a role tick is refused again after leaving the page', async () => {
        const user = userEvent.setup()
        rolesApi.grantRole.mockRejectedValue(new Error('offline'))
        const { router } = renderPage('/servers/ot/settings/members', an, 'an')
        await user.click(await within(await rowOf('Bình')).findByRole('button', { name: 'Assign roles' }))
        const picker = await screen.findByRole('dialog', { name: 'Roles of Bình' })
        await user.click(within(picker).getByLabelText('Nhóm tài liệu'))
        const again = await screen.findByRole('button', { name: 'Try again' })
        await act(() => router.navigate('/servers/ot/settings/roles'))
        await user.click(again)
        await waitFor(() => expect(rolesApi.grantRole).toHaveBeenCalledTimes(2))
        // A new toast, not the one clicked (still fading out).
        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Try again' }).some((button) => button !== again)).toBe(true)
        )
    })

    describe('the search words on the URL (D-90)', () => {
        beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
        afterEach(() => vi.useRealTimers())
        const pause = () => act(() => vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS))
        const TYPING_PAUSE_MS = 300

        async function searched(words: string) {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
            const view = renderPage('/servers/ot/settings/members', binh)
            await screen.findByText('4 members')
            await user.click(screen.getByRole('button', { name: 'Joined' }))
            const box = screen.getByRole('searchbox', { name: 'Search by name or username' })
            await user.type(box, words)
            await pause()
            return { user, box, ...view }
        }

        it('goes back to the words on the URL after Back, and leaves them there', async () => {
            const { router, box } = await searched('dung')
            expect(router.state.location.search).toBe('?sort=joined_at&order=desc&q=dung')

            await act(() => router.navigate(-1))
            expect(box).toHaveValue('')
            await pause()
            expect(router.state.location.search).toBe('')
            expect(rolesApi.fetchMembers).toHaveBeenLastCalledWith('ot', expect.objectContaining({ q: undefined }))
        })

        it('shows the words again after Back then Forward', async () => {
            const { router, box } = await searched('dung')
            await act(() => router.navigate(-1))
            await act(() => router.navigate(1))
            expect(box).toHaveValue('dung')
            await pause()
            expect(router.state.location.search).toBe('?sort=joined_at&order=desc&q=dung')
        })

        it('searches the same words again when they are typed again after Back', async () => {
            const { router, box, user } = await searched('dung')
            await act(() => router.navigate(-1))
            await user.type(box, 'dung')
            await pause()
            expect(router.state.location.search).toBe('?q=dung')
        })

        it('drops words still waiting for the pause when Back is pressed', async () => {
            const { router, box, user } = await searched('dung')
            await user.type(box, ' an')
            await act(() => router.navigate(-1))
            await pause()
            expect(router.state.location.search).toBe('')
            expect(box).toHaveValue('')
        })

        it('keeps the space typed after a word while the search for that word runs', async () => {
            const { router, box, user } = await searched('dung ')
            expect(router.state.location.search).toBe('?sort=joined_at&order=desc&q=dung')
            await user.type(box, 'an')
            expect(box).toHaveValue('dung an')
        })
    })

    it('pages past ten, and goes to the last page when the one asked is gone', async () => {
        const user = userEvent.setup()
        rolesApi.fetchMembers.mockImplementation(async (_id: string, query: { page: number; limit: number }) => ({
            items: MEMBERS,
            meta: meta(137, query.page, query.limit)
        }))
        const { router } = renderPage('/servers/ot/settings/members?page=9', binh)
        await waitFor(() => expect(router.state.location.search).toBe('?page=3'))
        expect(await screen.findByText('of 137 members')).toBeInTheDocument()
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page')
        )
        expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
        await user.click(screen.getByRole('button', { name: 'Page 1' }))
        await waitFor(() => expect(router.state.location.search).toBe(''))
    })

    it('turns the rows into Skeletons when the next page takes over 0.3 s, not before (D-90)', async () => {
        const user = userEvent.setup()
        let release!: () => void
        rolesApi.fetchMembers.mockImplementation(async (_id: string, query: { page: number; limit: number }) => {
            if (query.page === 2) await new Promise<void>((resolve) => (release = resolve))
            return { items: MEMBERS, meta: meta(137, query.page, query.limit) }
        })
        const { container } = renderPage('/servers/ot/settings/members', binh)
        expect(await screen.findByText('of 137 members')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Page 2' }))
        expect(container.querySelector('[aria-busy="true"]')).toBeNull()
        await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).not.toBeNull(), { timeout: 1000 })
        release()
        await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull())
        expect(await rowOf('Dũng')).toBeDefined()
    })

    it('says when no one matches', async () => {
        rolesApi.fetchMembers.mockResolvedValue(page([]))
        renderPage('/servers/ot/settings/members?q=xyz', binh)
        expect(await screen.findByText('No member matches “xyz”')).toBeInTheDocument()
    })
})

const ban = (userId: string, name: string, extra: Partial<BanItem> = {}): BanItem => ({
    user: { userId, username: name.toLowerCase(), displayName: name, avatarUrl: null },
    reason: 'Bán đề thi có đáp án',
    createdAt: '2026-10-18T03:00:00Z',
    bannedBy: { userId: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null },
    ...extra
})
const bans = (items: BanItem[], total = items.length): BanPage => ({ items, meta: meta(total) })

describe('Bans (S-SET-04)', () => {
    it('lists who was banned, why, when and by whom, and unbans after asking', async () => {
        const user = userEvent.setup()
        moderationApi.fetchBans.mockResolvedValue(bans([ban('khanh', 'Khánh')]))
        moderationApi.unbanMember.mockResolvedValue(undefined)
        const { container } = renderPage('/servers/ot/settings/bans', an, 'an')
        const row = await rowOf('Khánh')
        expect(within(row).getByText('Bán đề thi có đáp án')).toBeInTheDocument()
        expect(within(row).getByText('an.nguyen')).toBeInTheDocument()
        expect(moderationApi.fetchBans).toHaveBeenCalledWith('ot', 1, 50)
        await expectNoA11yViolations(container)

        await user.click(within(row).getByRole('button', { name: /Khánh/ }))
        const detail = await screen.findByRole('dialog', { name: 'Khánh' })
        expect(within(detail).getByText(/Banned on .* by An \(an\.nguyen\)/)).toBeInTheDocument()
        await user.click(within(detail).getByRole('button', { name: 'Unban' }))

        const confirm = await screen.findByRole('dialog', { name: 'Unban Khánh?' })
        await user.click(within(confirm).getByRole('button', { name: 'Unban' }))
        await waitFor(() => expect(moderationApi.unbanMember).toHaveBeenCalledWith('ot', 'khanh'))
        expect(await screen.findByText('Unbanned Khánh')).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('shows a dash for no reason and names a deleted account', async () => {
        moderationApi.fetchBans.mockResolvedValue(
            bans([
                ban('x', 'Xuân', {
                    reason: null,
                    bannedBy: { userId: 'gone', username: null, displayName: null, avatarUrl: null }
                })
            ])
        )
        renderPage('/servers/ot/settings/bans', an, 'an')
        const row = await rowOf('Xuân')
        expect(within(row).getByText('—')).toBeInTheDocument()
        expect(within(row).getByText('Deleted account')).toBeInTheDocument()
    })

    it('filters the page shown past ten people, ignoring accents', async () => {
        const user = userEvent.setup()
        const many = ['Khánh', 'Lan', 'Mai', 'Minh', 'Nam', 'Ngân', 'Oanh', 'Phúc', 'Quân', 'Sơn', 'Tâm'].map((name) =>
            ban(name, name)
        )
        moderationApi.fetchBans.mockResolvedValue(bans(many))
        renderPage('/servers/ot/settings/bans', an, 'an')
        const search = await screen.findByRole('searchbox', { name: 'Search banned people' })
        await user.type(search, 'khanh')
        await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2))
        expect(await rowOf('Khánh')).toBeTruthy()

        await user.clear(search)
        await user.type(search, 'NGÂN')
        await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2))
        expect(await rowOf('Ngân')).toBeTruthy()
    })

    it('says when no one is banned', async () => {
        moderationApi.fetchBans.mockResolvedValue(bans([]))
        renderPage('/servers/ot/settings/bans', an, 'an')
        expect(await screen.findByText('No one is banned')).toBeInTheDocument()
        expect(screen.queryByRole('searchbox')).toBeNull()
    })
})
