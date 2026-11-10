import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AxiosError, AxiosHeaders } from 'axios'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuthStore } from '@/features/auth'
import { flowNext } from '@/features/auth/lib/paths'
import { expectNoA11yViolations } from '@/test/a11y'
import { queryWrapper } from '@/test/helpers'
import type { Invite, InviteListItem, InvitePreview, Server } from '../types'

const serversApi = {
    fetchServers: vi.fn(),
    createServer: vi.fn(),
    uploadServerIcon: vi.fn(),
    updateServer: vi.fn(),
    removeServerIcon: vi.fn()
}
const invitesApi = {
    createInvite: vi.fn(),
    fetchInvites: vi.fn(),
    revokeInvite: vi.fn(),
    fetchInvitePreview: vi.fn(),
    acceptInvite: vi.fn()
}
vi.mock('@/features/servers/api/servers.api', () => serversApi)
vi.mock('@/features/servers/api/invites.api', () => invitesApi)

const { default: InviteDialog } = await import('../components/invites/InviteDialog')
const { default: JoinInviteDialog } = await import('../components/invites/JoinInviteDialog')
const { default: InvitePage } = await import('../pages/InvitePage')
const { default: CreateServerDialog } = await import('../components/CreateServerDialog')
const { InvitesSettings } = await import('../components/settings/InvitesSettings')
const { useInviteDialogs } = await import('../invite-dialogs.store')
const { useCreateServerDialog } = await import('../create-server.store')
const { parseInviteInput, sameSettings, timeLeft, usesLeft } = await import('../lib/invites')

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-09T21:47:00Z')

const server = (id: string, name: string, extra: Partial<Server> = {}): Server => ({
    id,
    name,
    iconUrl: null,
    isOwner: true,
    permissions: '2147483647',
    topRolePosition: 1,
    roleIds: [],
    roles: [],
    timeoutUntil: null,
    welcomeChannelId: null,
    categories: [],
    channels: [],
    ...extra
})
const OT = server('ot', 'Ôn thi Giải tích 2')
const ND = server('nd', 'Nhóm đồ án Mobile', {
    channels: [
        {
            id: 'hoi-dap',
            categoryId: null,
            type: 'text',
            name: 'hoi-dap',
            position: 0,
            isPrivate: false,
            sendMode: 'everyone',
            isStudyRoom: false,
            taskBoardEnabled: false,
            permissions: '1',
            viewRoleIds: null
        }
    ]
})

const invite = (extra: Partial<Invite> = {}): Invite => ({
    code: 'k7Qm2xPa',
    maxAgeSeconds: 604800,
    maxUses: null,
    uses: 0,
    expiresAt: new Date(Date.now() + 7 * DAY).toISOString(),
    createdAt: new Date().toISOString(),
    ...extra
})

const preview = (extra: Partial<InvitePreview> = {}): InvitePreview => ({
    code: 'B4tRw9Lz',
    server: { id: 'nd', name: 'Nhóm đồ án Mobile', iconUrl: null, memberCount: 5 },
    inviterName: 'Bình',
    channel: { id: 'hoi-dap', name: 'hoi-dap', type: 'text', isStudyRoom: false },
    ...extra
})

const apiError = (status: number, type: string, headers: Record<string, string> = {}) =>
    new AxiosError(String(status), String(status), undefined, undefined, {
        status,
        statusText: '',
        headers,
        config: { headers: new AxiosHeaders() },
        data: { meta: { type, code: `${status}000` }, data: {} }
    })

function Where() {
    const location = useLocation()
    return <p data-testid='where'>{`${location.pathname}${location.search}`}</p>
}

function renderAt(path: string, routes: { path: string; element: React.ReactNode }[]) {
    const router = createMemoryRouter(
        [
            {
                element: (
                    <>
                        <Where />
                        <Outlet />
                    </>
                ),
                children: [...routes, { path: '*', element: <p>elsewhere</p> }]
            }
        ],
        { initialEntries: [path] }
    )
    render(
        <TooltipProvider>
            <RouterProvider router={router} />
            <Toaster />
        </TooltipProvider>,
        { wrapper: queryWrapper() }
    )
    return router
}

const where = () => screen.getByTestId('where').textContent

beforeEach(() => {
    vi.clearAllMocks()
    serversApi.fetchServers.mockResolvedValue([OT])
    useInviteDialogs.setState({ invite: null, join: null })
})

afterEach(() => {
    useAuthStore.setState({ isAuthenticated: false, isComplete: false })
})

describe('invite helpers', () => {
    it('takes a code, or a whole link with or without https, keeping its channel', () => {
        expect(parseInviteInput(' k7Qm2xPa ')).toEqual({ code: 'k7Qm2xPa', channel: null })
        expect(parseInviteInput('nezfocus.app/invite/k7Qm2xPa')).toEqual({ code: 'k7Qm2xPa', channel: null })
        expect(parseInviteInput('https://nezfocus.app/invite/B4tRw9Lz?channel=phong')).toEqual({
            code: 'B4tRw9Lz',
            channel: 'phong'
        })
        expect(parseInviteInput('k7Q')).toBeNull()
        expect(parseInviteInput('https://nezfocus.app/invite/k7-Q')).toBeNull()
    })

    it('says the time left in its largest unit, and the uses left (Q15)', () => {
        expect(timeLeft(new Date(NOW.getTime() + 7 * DAY - 1000).toISOString(), NOW)).toEqual({
            unit: 'days',
            count: 7
        })
        expect(timeLeft(new Date(NOW.getTime() + 23 * 3600_000).toISOString(), NOW)).toEqual({
            unit: 'hours',
            count: 23
        })
        expect(timeLeft(new Date(NOW.getTime() + 25 * 60_000).toISOString(), NOW)).toEqual({
            unit: 'minutes',
            count: 25
        })
        expect(usesLeft({ maxUses: null, uses: 3 })).toEqual({ kind: 'unlimited', count: 0 })
        expect(usesLeft({ maxUses: 10, uses: 0 })).toEqual({ kind: 'max', count: 10 })
        expect(usesLeft({ maxUses: 10, uses: 3 })).toEqual({ kind: 'left', count: 7 })
    })

    it('calls settings the same only for a link with no limit on uses (D-151)', () => {
        expect(sameSettings(invite(), { maxAgeSeconds: 604800, maxUses: null })).toBe(true)
        expect(sameSettings(invite({ maxUses: 1 }), { maxAgeSeconds: 604800, maxUses: 1 })).toBe(false)
        expect(sameSettings(invite(), { maxAgeSeconds: 86400, maxUses: null })).toBe(false)
        expect(sameSettings(invite(), { maxAgeSeconds: 604800, maxUses: 10 })).toBe(false)
    })

    it('goes back to the waiting invite after signing in, unless told where (01 › Lời mời đang chờ)', () => {
        expect(flowNext(new URLSearchParams('invite=k7Qm2xPa'))).toBe('/invite/k7Qm2xPa')
        expect(flowNext(new URLSearchParams('invite=k7Qm2xPa&next=/invite/k7Qm2xPa?channel=x'))).toBe(
            '/invite/k7Qm2xPa?channel=x'
        )
        expect(flowNext(new URLSearchParams('invite=../../evil'))).toBe('/study')
        expect(flowNext(new URLSearchParams(''))).toBe('/study')
    })
})

describe('Invite friends (S-SRV-02)', () => {
    const open = () => {
        useInviteDialogs.setState({ invite: { serverId: 'ot', created: false } })
        renderAt('/channels/ot', [{ path: '/channels/:serverId', element: <InviteDialog /> }])
    }

    it('hands out a link with the default settings and copies it, without a toast', async () => {
        invitesApi.createInvite.mockResolvedValue(invite())
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        open()

        const link = await screen.findByRole('textbox', { name: 'Invite link' })
        expect(link).toHaveValue(`${window.location.host}/invite/k7Qm2xPa`)
        expect(invitesApi.createInvite).toHaveBeenCalledWith(
            'ot',
            { maxAgeSeconds: 604800, maxUses: null },
            expect.any(String)
        )
        expect(screen.getByText('Expires in 7 days · no limit on uses')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Invite friends to Ôn thi Giải tích 2' })).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
        expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/k7Qm2xPa`)
        expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
        expect(screen.getByText('Invite link copied')).toBeInTheDocument()
    })

    it('makes a new link from changed settings, and will not ask for the same unlimited one', async () => {
        invitesApi.createInvite.mockResolvedValueOnce(invite()).mockResolvedValueOnce(
            invite({
                code: 'Rt4nW8eq',
                maxAgeSeconds: 86400,
                maxUses: 10,
                expiresAt: new Date(Date.now() + DAY).toISOString()
            })
        )
        open()
        await screen.findByRole('textbox', { name: 'Invite link' })

        await userEvent.click(screen.getByRole('button', { name: 'Change settings' }))
        expect(screen.getByRole('button', { name: 'Create a new link' })).toBeDisabled()

        expect(screen.getByRole('combobox', { name: 'Expire after' })).toHaveTextContent('7 days')
        expect(screen.getByRole('combobox', { name: 'Max number of uses' })).toHaveTextContent('No limit')
        // Radix's own select inside the form: opening its list inside a dialog
        // loops focus in jsdom (the e2e opens them in a real browser).
        const [expiry, uses] = Array.from(document.querySelectorAll('select'))
        fireEvent.change(expiry!, { target: { value: '86400' } })
        fireEvent.change(uses!, { target: { value: '10' } })
        expect(screen.getByRole('combobox', { name: 'Expire after' })).toHaveTextContent('1 day')
        await userEvent.click(screen.getByRole('button', { name: 'Create a new link' }))

        expect(invitesApi.createInvite).toHaveBeenLastCalledWith(
            'ot',
            { maxAgeSeconds: 86400, maxUses: 10 },
            expect.any(String)
        )
        expect(await screen.findByRole('textbox', { name: 'Invite link' })).toHaveValue(
            `${window.location.host}/invite/Rt4nW8eq`
        )
        expect(screen.getByText('Expires in 1 day · up to 10 uses')).toBeInTheDocument()
    })

    it('starts the settings from the link shown each time, Esc going back to the link', async () => {
        invitesApi.createInvite.mockResolvedValue(invite())
        open()
        await screen.findByRole('textbox', { name: 'Invite link' })

        await userEvent.click(screen.getByRole('button', { name: 'Change settings' }))
        fireEvent.change(document.querySelectorAll('select')[0]!, { target: { value: '86400' } })
        expect(screen.getByRole('combobox', { name: 'Expire after' })).toHaveTextContent('1 day')
        await userEvent.keyboard('{Escape}')
        expect(await screen.findByRole('textbox', { name: 'Invite link' })).toBeInTheDocument()
        expect(screen.getByRole('dialog')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Change settings' }))
        expect(screen.getByRole('combobox', { name: 'Expire after' })).toHaveTextContent('7 days')
        expect(invitesApi.createInvite).toHaveBeenCalledTimes(1)
    })

    it('keeps changed settings on a click outside, and closes on one when nothing changed', async () => {
        invitesApi.createInvite.mockResolvedValue(invite())
        open()
        await screen.findByRole('textbox', { name: 'Invite link' })
        await userEvent.click(screen.getByRole('button', { name: 'Change settings' }))
        fireEvent.change(document.querySelectorAll('select')[1]!, { target: { value: '10' } })
        fireEvent.pointerDown(document.body)
        expect(screen.getByRole('dialog')).toBeInTheDocument()

        fireEvent.change(document.querySelectorAll('select')[1]!, { target: { value: 'unlimited' } })
        fireEvent.pointerDown(document.body)
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('keeps the settings asked for when that link could not be made, and a click outside then closes', async () => {
        invitesApi.createInvite.mockResolvedValueOnce(invite()).mockRejectedValueOnce(new AxiosError('offline'))
        open()
        await screen.findByRole('textbox', { name: 'Invite link' })
        await userEvent.click(screen.getByRole('button', { name: 'Change settings' }))
        fireEvent.change(document.querySelectorAll('select')[0]!, { target: { value: '86400' } })
        await userEvent.click(screen.getByRole('button', { name: 'Create a new link' }))
        await waitFor(() => expect(invitesApi.createInvite).toHaveBeenCalledTimes(2))
        expect(await screen.findByRole('button', { name: 'Create a new link' })).toBeEnabled()
        expect(screen.getByRole('combobox', { name: 'Expire after' })).toHaveTextContent('1 day')
        fireEvent.pointerDown(document.body)
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('revokes its link at once, then offers a new one', async () => {
        invitesApi.createInvite.mockResolvedValueOnce(invite()).mockResolvedValueOnce(invite({ code: 'Zz9wQ2pe' }))
        invitesApi.revokeInvite.mockResolvedValue(undefined)
        open()
        await screen.findByRole('textbox', { name: 'Invite link' })

        await userEvent.click(screen.getByRole('button', { name: 'Revoke this link' }))
        expect(invitesApi.revokeInvite).toHaveBeenCalledWith('k7Qm2xPa')
        expect(await screen.findByDisplayValue('This link has been revoked')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Create a new link' }))
        expect(await screen.findByDisplayValue(`${window.location.host}/invite/Zz9wQ2pe`)).toBeInTheDocument()
    })

    it('says so in place of the link when none could be made, and tries again', async () => {
        invitesApi.createInvite.mockRejectedValueOnce(apiError(500, 'INTERNAL_ERROR')).mockResolvedValueOnce(invite())
        open()
        expect(await screen.findByText(/Could not create an invite link/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByRole('textbox', { name: 'Invite link' })).toBeInTheDocument()
    })
})

describe('The invite page (S-SRV-03)', () => {
    const page = (path = '/invite/B4tRw9Lz?channel=hoi-dap') =>
        renderAt(path, [
            { path: '/invite/:code', element: <InvitePage /> },
            { path: '/study', element: <p>study page</p> }
        ])

    it('shows a visitor who invites them and where, and carries the invite into signing up', async () => {
        invitesApi.fetchInvitePreview.mockResolvedValue(preview())
        page()

        expect(await screen.findByRole('heading', { level: 1, name: 'Bình invited you to' })).toBeInTheDocument()
        expect(screen.getByText('Nhóm đồ án Mobile')).toBeInTheDocument()
        expect(screen.getByText('5 members')).toBeInTheDocument()
        expect(screen.getByText('#hoi-dap')).toBeInTheDocument()
        expect(invitesApi.fetchInvitePreview).toHaveBeenCalledWith('B4tRw9Lz', 'hoi-dap')
        expect(document.title).toBe('Nhóm đồ án Mobile · NezFocus')

        const register = screen.getByRole('link', { name: 'Create an account to join' })
        const query = new URLSearchParams(register.getAttribute('href')!.split('?')[1])
        expect(query.get('invite')).toBe('B4tRw9Lz')
        expect(query.get('next')).toBe('/invite/B4tRw9Lz?channel=hoi-dap')
        await expectNoA11yViolations()
        expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toMatch(/^\/login\?invite=B4tRw9Lz/)
    })

    it('says "You\'re invited to" when the creator has left', async () => {
        invitesApi.fetchInvitePreview.mockResolvedValue(preview({ inviterName: null, channel: null }))
        page('/invite/B4tRw9Lz')
        expect(await screen.findByRole('heading', { level: 1, name: "You're invited to" })).toBeInTheDocument()
    })

    it('shows an invite that no longer works without naming the server', async () => {
        invitesApi.fetchInvitePreview.mockRejectedValue(apiError(410, 'INVITE_INVALID'))
        page()
        expect(
            await screen.findByRole('heading', { level: 1, name: 'This invite is no longer valid' })
        ).toBeInTheDocument()
        expect(document.title).toBe('Invite no longer valid · NezFocus')
        expect(screen.getByRole('link', { name: 'Create an account' })).toBeInTheDocument()
    })

    it('counts down a limit on this network before offering to try again', async () => {
        invitesApi.fetchInvitePreview.mockRejectedValue(apiError(429, 'RATE_LIMIT_EXCEEDED', { 'retry-after': '42' }))
        page()
        expect(await screen.findByText(/Try again in 42 seconds/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
    })

    it('takes someone signed in into the app, with the invite over it', async () => {
        useAuthStore.setState({ isAuthenticated: true, isComplete: true })
        page()
        await waitFor(() => expect(where()).toBe('/study'))
        expect(useInviteDialogs.getState().join).toEqual({ code: 'B4tRw9Lz', channel: 'hoi-dap' })
    })

    it('sends an unfinished account to finish first, keeping the invite', async () => {
        useAuthStore.setState({ isAuthenticated: true, isComplete: false })
        page()
        await waitFor(() => expect(where()).toMatch(/^\/welcome\?invite=B4tRw9Lz&next=/))
    })
})

describe('Joining while signed in (S-SRV-03 signed-in)', () => {
    const open = (code = 'B4tRw9Lz', channel: string | null = 'hoi-dap') => {
        useInviteDialogs.setState({ join: { code, channel } })
        renderAt('/study', [
            { path: '/study', element: <JoinInviteDialog /> },
            { path: '/channels/:serverId/:channelId?', element: <p>channel page</p> }
        ])
    }

    it('joins and opens the channel of the link, replacing the address', async () => {
        invitesApi.fetchInvitePreview.mockResolvedValue(preview())
        invitesApi.acceptInvite.mockResolvedValue({ server: ND, joined: true })
        open()

        const dialog = await screen.findByRole('dialog', { name: 'Bình invited you to' })
        expect(within(dialog).getByRole('button', { name: 'Join' })).toHaveFocus()
        await userEvent.click(within(dialog).getByRole('button', { name: 'Join' }))
        expect(invitesApi.acceptInvite).toHaveBeenCalledWith('B4tRw9Lz')
        await waitFor(() => expect(where()).toBe('/channels/nd/hoi-dap'))
        expect(useInviteDialogs.getState().join).toBeNull()
    })

    it('opens the server when the channel of the link is not one they see', async () => {
        invitesApi.fetchInvitePreview.mockResolvedValue(preview({ channel: null }))
        invitesApi.acceptInvite.mockResolvedValue({ server: ND, joined: true })
        open('B4tRw9Lz', 'bi-mat')
        await userEvent.click(await screen.findByRole('button', { name: 'Join' }))
        await waitFor(() => expect(where()).toBe('/channels/nd'))
    })

    it('tells someone banned only when they try, leaving just "Close"', async () => {
        invitesApi.fetchInvitePreview.mockResolvedValue(preview())
        invitesApi.acceptInvite.mockRejectedValue(apiError(403, 'BANNED_FROM_SERVER'))
        open()

        await userEvent.click(await screen.findByRole('button', { name: 'Join' }))
        expect(await screen.findByText('You cannot join Nhóm đồ án Mobile.')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument()
    })

    it('shows the invite as no longer valid when it ran out meanwhile', async () => {
        invitesApi.fetchInvitePreview.mockResolvedValue(preview())
        invitesApi.acceptInvite.mockRejectedValue(apiError(410, 'INVITE_INVALID'))
        open()
        await userEvent.click(await screen.findByRole('button', { name: 'Join' }))
        expect(await screen.findByRole('dialog', { name: 'This invite is no longer valid' })).toBeInTheDocument()
    })

    it('opens a server they are in already, with a toast and no dialog', async () => {
        serversApi.fetchServers.mockResolvedValue([OT, ND])
        invitesApi.fetchInvitePreview.mockResolvedValue(preview())
        open()
        expect(await screen.findByText("You're already in Nhóm đồ án Mobile")).toBeInTheDocument()
        await waitFor(() => expect(where()).toBe('/channels/nd/hoi-dap'))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(invitesApi.acceptInvite).not.toHaveBeenCalled()
    })
})

describe('Join with an invite code (S-SRV-01 join-by-code)', () => {
    const open = () => {
        useCreateServerDialog.setState({ open: true, template: 'study', mode: 'join' })
        renderAt('/study', [
            { path: '/study', element: <CreateServerDialog /> },
            { path: '/channels/:serverId/:channelId?', element: <p>channel page</p> }
        ])
    }

    it('refuses what is not a code before asking, then an unknown one', async () => {
        invitesApi.fetchInvitePreview.mockRejectedValue(apiError(410, 'INVITE_INVALID'))
        open()
        const field = await screen.findByRole('textbox', { name: 'Invite code or link' })
        expect(field).toHaveFocus()

        await userEvent.type(field, 'k7Q{Enter}')
        expect(await screen.findByText(/An invite code has 8–10 letters and digits/)).toBeInTheDocument()
        expect(invitesApi.fetchInvitePreview).not.toHaveBeenCalled()

        await userEvent.clear(field)
        await userEvent.type(field, 'Zz9wQ2pe{Enter}')
        expect(await screen.findByText(/This invite does not exist or has expired/)).toBeInTheDocument()
        expect(field).toHaveValue('Zz9wQ2pe')
    })

    it('shows the invite of a pasted link, and goes back to the code', async () => {
        invitesApi.fetchInvitePreview.mockResolvedValue(preview())
        open()
        const field = await screen.findByRole('textbox', { name: 'Invite code or link' })
        await userEvent.type(field, 'https://nezfocus.app/invite/B4tRw9Lz?channel=hoi-dap{Enter}')

        expect(invitesApi.fetchInvitePreview).toHaveBeenCalledWith('B4tRw9Lz', 'hoi-dap')
        expect(await screen.findByRole('heading', { name: 'Bình invited you to' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Back' }))
        expect(await screen.findByRole('textbox', { name: 'Invite code or link' })).toBeInTheDocument()
    })

    it('asks the API again on each Continue, even for the code it just showed', async () => {
        invitesApi.fetchInvitePreview.mockResolvedValue(preview())
        open()
        const field = await screen.findByRole('textbox', { name: 'Invite code or link' })
        await userEvent.type(field, 'B4tRw9Lz{Enter}')
        await userEvent.click(await screen.findByRole('button', { name: 'Back' }))

        await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))

        expect(await screen.findByRole('heading', { name: 'Bình invited you to' })).toBeInTheDocument()
        expect(invitesApi.fetchInvitePreview).toHaveBeenCalledTimes(2)
    })
})

describe('Invites settings (S-SET-04)', () => {
    const row = (extra: Partial<InviteListItem>): InviteListItem => ({
        ...invite(),
        creator: { state: 'member', displayName: 'An', username: 'an.nguyen' },
        ...extra
    })
    const show = () =>
        renderAt('/servers/ot/settings/invites', [
            { path: '/servers/:serverId/settings/:section', element: <InvitesSettings server={OT} /> }
        ])

    it('lists each link with its creator, uses and time left, and revokes after asking', async () => {
        invitesApi.fetchInvites.mockResolvedValue([
            row({ uses: 3 }),
            row({
                code: 'Rt4nW8eq',
                maxUses: 10,
                uses: 1,
                expiresAt: new Date(Date.now() + 22 * 3600_000).toISOString(),
                creator: { state: 'left' }
            })
        ])
        invitesApi.revokeInvite.mockResolvedValue(undefined)
        show()

        const first = (await screen.findByText('k7Qm2xPa')).closest('[role=row]') as HTMLElement
        expect(within(first).getByText('3 / ∞')).toBeInTheDocument()
        expect(within(first).getByText('an.nguyen')).toBeInTheDocument()
        expect(within(first).getByText('in 7 days')).toBeInTheDocument()
        const second = screen.getByText('Rt4nW8eq').closest('[role=row]') as HTMLElement
        expect(within(second).getByText('1 / 10')).toBeInTheDocument()
        expect(within(second).getByText('Left the server')).toBeInTheDocument()
        expect(within(second).getByText('in 22 hours')).toBeInTheDocument()

        await userEvent.click(within(first).getByRole('button', { name: 'Revoke' }))
        const dialog = await screen.findByRole('dialog', { name: 'Revoke invite k7Qm2xPa?' })
        await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }))
        expect(invitesApi.revokeInvite).toHaveBeenCalledWith('k7Qm2xPa')
        expect(await screen.findByText('Invite revoked')).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByText('k7Qm2xPa')).not.toBeInTheDocument())
    })

    it('drops a link that expired meanwhile, saying so', async () => {
        invitesApi.fetchInvites.mockResolvedValue([row({})])
        invitesApi.revokeInvite.mockRejectedValue(apiError(410, 'INVITE_INVALID'))
        show()
        await userEvent.click(await screen.findByRole('button', { name: 'Revoke' }))
        await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revoke' }))
        expect(await screen.findByText('This invite had already expired')).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByText('k7Qm2xPa')).not.toBeInTheDocument())
    })

    it('follows the invite panel: a link made there is listed, one revoked there leaves', async () => {
        invitesApi.fetchInvites.mockResolvedValueOnce([]).mockResolvedValue([row({})])
        invitesApi.createInvite.mockResolvedValue(invite())
        invitesApi.revokeInvite.mockResolvedValue(undefined)
        renderAt('/servers/ot/settings/invites', [
            {
                path: '/servers/:serverId/settings/:section',
                element: (
                    <>
                        <InvitesSettings server={OT} />
                        <InviteDialog />
                    </>
                )
            }
        ])
        expect(await screen.findByRole('heading', { name: 'No invites that still work' })).toBeInTheDocument()
        useInviteDialogs.setState({ invite: { serverId: 'ot', created: false } })

        await screen.findByRole('textbox', { name: 'Invite link' })
        expect(await screen.findByText('k7Qm2xPa')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Revoke this link' }))
        await screen.findByDisplayValue('This link has been revoked')
        await waitFor(() => expect(screen.queryByText('k7Qm2xPa')).not.toBeInTheDocument())
    })

    it('says when there is no link that still works', async () => {
        invitesApi.fetchInvites.mockResolvedValue([row({ expiresAt: new Date(Date.now() - 1000).toISOString() })])
        show()
        expect(await screen.findByRole('heading', { name: 'No invites that still work' })).toBeInTheDocument()
    })
})
