import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Toaster } from 'sonner'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { focusManager } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { Users } from 'lucide-react'
import i18n from '@/i18n'
import { IconButton } from '@/components/ui/icon-button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RightPanel, usePanel } from '@/components/shell/RightPanel'
import { ShellPage } from '@/components/shell/ShellPage'
import { expectNoA11yViolations } from '@/test/a11y'
import { mockAuthStore, queryWrapper } from '@/test/helpers'
import type { Server, ServerChannel } from '@/features/servers'

const authState = {
    isAuthenticated: true,
    user: { id: 'user-1', email: 'an@example.test', username: 'an.nguyen', displayName: 'An', roles: ['user'] },
    logout: vi.fn()
}
const profile = { ...authState.user, avatarUrl: null, bio: 'Ôn Giải tích 2 mỗi tối 21:00' }

const serversApi = {
    fetchServers: vi.fn(),
    createServer: vi.fn(),
    uploadServerIcon: vi.fn(),
    updateServer: vi.fn(),
    removeServerIcon: vi.fn()
}
vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))
vi.mock('@/features/users/api/useProfile', () => ({ useProfile: () => ({ data: profile }) }))
vi.mock('@/features/servers/api/servers.api', () => serversApi)
// The shell opens its socket after the first paint: no network here.
vi.mock('@/lib/socket', () => ({ openSocket: () => ({ close: () => undefined, send: () => undefined }) }))
vi.mock('@/features/realtime/api/realtime.api', () => ({ fetchRealtimeTicket: vi.fn() }))
// A text channel's chat reads its history: an empty one, never the network.
const messagesApi = vi.hoisted(() => ({
    fetchMessages: vi.fn(async (..._: unknown[]) => ({ items: [], hasMoreBefore: false, hasMoreAfter: false })),
    sendMessage: vi.fn()
}))
vi.mock('@/features/messaging/api/messages.api', () => messagesApi)
// Its pins: none, unless a test says otherwise.
const pinsApi = vi.hoisted(() => ({
    fetchPins: vi.fn(async (..._: unknown[]) => [] as unknown[]),
    pinMessage: vi.fn(),
    unpinMessage: vi.fn()
}))
vi.mock('@/features/messaging/api/pins.api', () => pinsApi)
// The member panel's lists: nobody, unless a test says otherwise.
vi.mock('@/features/servers/api/roles.api', async (original) => ({
    ...(await original<typeof import('@/features/servers/api/roles.api')>()),
    fetchMembers: vi.fn(async () => ({
        items: [],
        meta: {
            currentPage: 1,
            itemsPerPage: 100,
            totalItems: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false
        }
    }))
}))
// How far one has read: nothing unread, unless a test says otherwise.
const readStatesApi = vi.hoisted(() => ({
    fetchReadStates: vi.fn(async (): Promise<unknown[]> => []),
    ackChannel: vi.fn()
}))
vi.mock('@/features/messaging/api/readStates.api', () => readStatesApi)
// The account's settings, kept here: the status chosen in the menu saves to them (S-ME-01).
const settingsApi = vi.hoisted(() => {
    const held = { presence: 'online', theme: 'system', language: 'en' } as Record<string, unknown>
    return {
        held,
        fetchSettings: vi.fn(async () => ({ ...held })),
        updateSettings: vi.fn(async (changes: Record<string, unknown>) => Object.assign(held, changes) && { ...held }),
        settingsQuery: { queryKey: ['users', 'settings'], queryFn: async () => ({ ...held }), staleTime: 60_000 }
    }
})
vi.mock('@/features/users/api/settings.api', () => settingsApi)

const { default: AppShell } = await import('@/app/layout/app-shell/AppShell')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')
const { useRealtimeStore } = await import('@/features/realtime/realtime.store')
const { default: ChannelPage } = await import('@/features/servers/pages/ChannelPage')
const { default: Study } = await import('@/pages/Study')
const { default: ServerSettingsPage } = await import('@/features/servers/pages/ServerSettingsPage')
const { useCreateServerDialog } = await import('@/features/servers')

/** VIEW_CHANNEL, SEND_MESSAGES, CONNECT; and the same without CONNECT. */
const MEMBER = String((1n << 8n) | (1n << 10n) | (1n << 15n))
const NO_CONNECT = String((1n << 8n) | (1n << 10n))

const channel = (id: string, extra: Partial<ServerChannel> = {}): ServerChannel => ({
    id,
    categoryId: 'info',
    type: 'text',
    name: id,
    position: 0,
    isPrivate: false,
    sendMode: 'everyone',
    isStudyRoom: false,
    taskBoardEnabled: false,
    permissions: MEMBER,
    viewRoleIds: null,
    ...extra
})

/** ÔT as Phong sees it: a private channel outside any category, two categories, a room he may not join. */
const OT: Server = {
    id: 'ot',
    name: 'Ôn thi Giải tích 2',
    iconUrl: null,
    isOwner: false,
    memberCount: 13,
    permissions: MEMBER,
    topRolePosition: 0,
    roleIds: [],
    roles: [],
    timeoutUntil: null,
    welcomeChannelId: 'chao-mung',
    categories: [
        { id: 'rooms', name: 'Phòng học', position: 1 },
        { id: 'info', name: 'Thông tin', position: 0 }
    ],
    channels: [
        channel('hoi-dap', { position: 1 }),
        channel('chao-mung'),
        channel('ban-can-su', { categoryId: null, isPrivate: true }),
        channel('quiet', { categoryId: 'rooms', type: 'voice', name: 'Phòng học im lặng', isStudyRoom: true }),
        channel('loud', {
            categoryId: 'rooms',
            type: 'voice',
            name: 'Phòng thoại',
            position: 1,
            permissions: NO_CONNECT
        })
    ]
}
const ND: Server = { ...OT, id: 'nd', name: 'Nhóm đồ án Mobile', iconUrl: 'https://cdn.test/nd.webp' }
/** ÔT as someone with MANAGE_SERVER sees it. */
const OT_MANAGED: Server = { ...OT, permissions: String(BigInt(MEMBER) | (1n << 1n)) }

/** A page with the members panel, as channel pages will have from M2. */
function PanelPage() {
    const [panel, panelButton] = usePanel('members')
    return (
        <ShellPage
            title='hoi-dap'
            actions={
                <IconButton ref={panelButton} label='Members' on={panel.open} onClick={panel.toggle}>
                    <Users />
                </IconButton>
            }
            panel={
                <RightPanel state={panel} buttonRef={panelButton} title='Members'>
                    <p>Bình</p>
                </RightPanel>
            }
        />
    )
}

function renderAt(path: string | { pathname: string; state: unknown }) {
    const router = createMemoryRouter(
        [
            {
                element: <AppShell />,
                children: [
                    { path: '/study', element: <Study />, handle: { column: 'study' } },
                    {
                        path: '/channels/:serverId/:channelId?',
                        element: <ChannelPage />,
                        handle: { column: 'server' }
                    },
                    {
                        path: '/channels/:serverId/:channelId/:messageId',
                        element: <ChannelPage />,
                        handle: { column: 'server' }
                    },
                    {
                        path: '/servers/:serverId/settings/:section?',
                        element: <ServerSettingsPage />,
                        handle: { column: 'serverSettings' }
                    },
                    { path: '/panel', element: <PanelPage />, handle: { column: 'study' } },
                    { path: '/settings/account', element: <h1>Settings page</h1>, handle: { column: 'settings' } },
                    { path: '/settings/profile', element: <h1>Profile page</h1>, handle: { column: 'settings' } }
                ]
            }
        ],
        { initialEntries: [path] }
    )
    render(
        <TooltipProvider>
            <RouterProvider router={router} />
        </TooltipProvider>,
        { wrapper: queryWrapper() }
    )
    return router
}

const rail = () => screen.getByRole('navigation', { name: 'Servers' })

describe('AppShell (S-SHELL-01)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        authState.logout.mockReset()
        localStorage.clear()
        serversApi.fetchServers.mockResolvedValue([OT, ND])
        // Nothing unread, unless a test says otherwise.
        readStatesApi.fetchReadStates.mockResolvedValue([])
        // One dialog for the whole app: a test that opened it must not leave it over the next.
        useCreateServerDialog.getState().hide()
    })

    describe('on the Study page', () => {
        it('marks Study as where you are, in the rail and in its column', async () => {
            renderAt('/study')
            expect(await screen.findByRole('heading', { level: 1, name: 'Study' })).toBeInTheDocument()
            const pages = screen.getByRole('navigation', { name: 'Pages' })
            expect(within(pages).getByRole('link', { name: 'Study' })).toHaveAttribute('aria-current', 'page')
            const column = screen.getByRole('navigation', { name: 'Study' })
            expect(within(column).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
            // No server is selected.
            expect(within(rail()).queryByRole('link', { current: 'page' })).not.toBeInTheDocument()
        })

        it('says which rail items arrive later, and they lead nowhere', async () => {
            const router = renderAt('/study')
            const dm = await screen.findByRole('button', { name: 'Direct messages · coming soon' })
            expect(dm).toHaveAttribute('aria-disabled', 'true')
            await userEvent.click(dm)
            expect(router.state.location.pathname).toBe('/study')
            expect(screen.getByRole('button', { name: 'To-do · coming soon' })).toBeInTheDocument()
        })

        it('lists your servers in the order they came, each by its picture or its initials', async () => {
            renderAt('/study')
            const ot = await within(rail()).findByRole('link', { name: 'Ôn thi Giải tích 2' })
            const nd = within(rail()).getByRole('link', { name: 'Nhóm đồ án Mobile' })
            expect(ot.compareDocumentPosition(nd) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
            expect(ot).toHaveTextContent('ÔT')
            expect(nd.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/nd.webp')
        })

        it('opens "Create a server" from ＋', async () => {
            renderAt('/study')
            await userEvent.click(await within(rail()).findByRole('button', { name: 'Create or join a server' }))
            expect(await screen.findByRole('heading', { name: 'Create a server' })).toBeInTheDocument()
        })

        it('has no critical or serious accessibility problem', async () => {
            renderAt('/study')
            await screen.findByRole('heading', { level: 1, name: 'Study' })
            await expectNoA11yViolations()
        })
    })

    describe('in no server yet (S-SHELL-01 no-server)', () => {
        it('offers to create a Study Server, with it chosen', async () => {
            serversApi.fetchServers.mockResolvedValue([])
            renderAt('/study')
            expect(await screen.findByRole('heading', { level: 2, name: 'No servers yet' })).toBeInTheDocument()
            await userEvent.click(screen.getByRole('button', { name: 'Create a Study Server' }))
            const dialog = await screen.findByRole('dialog', { name: 'Create a server' })
            expect(within(dialog).getByRole('radio', { name: /Study Server/ })).toHaveAttribute('aria-checked', 'true')
        })

        it('welcomes a new account by name, right after it is completed', async () => {
            serversApi.fetchServers.mockResolvedValue([])
            renderAt({ pathname: '/study', state: { firstVisit: true } })
            expect(
                await screen.findByRole('heading', { level: 2, name: 'Welcome to NezFocus, An' })
            ).toBeInTheDocument()
        })

        it('says nothing of it to someone in a server', async () => {
            renderAt('/study')
            await within(rail()).findByRole('link', { name: 'Ôn thi Giải tích 2' })
            expect(screen.queryByRole('heading', { name: 'No servers yet' })).not.toBeInTheDocument()
        })
    })

    describe('in a server', () => {
        it('opens a server at its first text channel, and marks both', async () => {
            const router = renderAt('/channels/ot')
            await waitFor(() => expect(router.state.location.pathname).toBe('/channels/ot/ban-can-su'))
            expect(within(rail()).getByRole('link', { name: 'Ôn thi Giải tích 2' })).toHaveAttribute(
                'aria-current',
                'page'
            )
            const channels = screen.getByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })
            expect(await screen.findByRole('heading', { level: 1, name: 'ban-can-su' })).toBeInTheDocument()
            expect(within(channels).getByRole('link', { name: /ban-can-su/ })).toHaveAttribute('aria-current', 'page')
        })

        it('keeps the channel shown when reading the servers again fails on coming back to the tab', async () => {
            renderAt('/channels/ot/ban-can-su')
            expect(await screen.findByRole('heading', { level: 1, name: 'ban-can-su' })).toBeInTheDocument()
            const reads = serversApi.fetchServers.mock.calls.length
            serversApi.fetchServers.mockRejectedValue(new Error('offline'))
            act(() => focusManager.setFocused(true))
            await waitFor(() => expect(serversApi.fetchServers.mock.calls.length).toBeGreaterThan(reads))
            await act(async () => {})
            focusManager.setFocused(undefined)
            expect(screen.getByRole('heading', { level: 1, name: 'ban-can-su' })).toBeInTheDocument()
        })

        it('lists channels outside any category first, then each category in order, titles in capitals', async () => {
            renderAt('/channels/ot/hoi-dap')
            const channels = await screen.findByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })
            expect(
                within(channels)
                    .getAllByRole('link')
                    .map((link) => link.textContent)
            ).toEqual(['ban-can-su', 'chao-mung', 'hoi-dap', 'Phòng học im lặng', 'Phòng thoại'])
            expect(within(channels).getByRole('button', { name: 'Thông tin' })).toHaveClass('uppercase')
        })

        it('marks a private channel, and a room one may not join', async () => {
            renderAt('/channels/ot/hoi-dap')
            const channels = await screen.findByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })
            const privateRow = within(channels).getByRole('link', { name: /ban-can-su/ })
            expect(within(privateRow).getByRole('img', { name: 'Private channel' })).toBeInTheDocument()
            const loud = within(channels).getByRole('link', { name: /Phòng thoại/ })
            expect(within(loud).getByRole('img', { name: 'You may not join this room' })).toBeInTheDocument()
            const quiet = within(channels).getByRole('link', { name: /Phòng học im lặng/ })
            expect(within(quiet).queryByRole('img')).not.toBeInTheDocument()
        })

        it('folds a category, keeping the open channel', async () => {
            renderAt('/channels/ot/hoi-dap')
            const category = await screen.findByRole('button', { name: 'Thông tin' })
            await userEvent.click(category)
            expect(category).toHaveAttribute('aria-expanded', 'false')
            expect(screen.getByRole('link', { name: 'hoi-dap' })).toHaveAttribute('aria-current', 'page')
            expect(screen.queryByRole('link', { name: 'chao-mung' })).not.toBeInTheDocument()

            await userEvent.click(category)
            expect(screen.getByRole('link', { name: 'chao-mung' })).toBeInTheDocument()
        })

        it('says a voice room arrives later', async () => {
            renderAt('/channels/ot/quiet')
            expect(await screen.findByRole('heading', { level: 1, name: 'Phòng học im lặng' })).toBeInTheDocument()
            expect(screen.getByRole('heading', { level: 2, name: 'Voice rooms come in a later version' })).toBeVisible()
        })

        it('goes back to the Study page from a server one is not in', async () => {
            const router = renderAt('/channels/gone/hoi-dap')
            await waitFor(() => expect(router.state.location.pathname).toBe('/study'))
        })

        it('opens a link to a message at that message (D-48)', async () => {
            renderAt('/channels/ot/hoi-dap/0195a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')
            expect(await screen.findByRole('heading', { level: 1, name: 'hoi-dap' })).toBeInTheDocument()
            expect(await screen.findByRole('log', {}, { timeout: 5000 })).toBeInTheDocument()
            await waitFor(() =>
                expect(messagesApi.fetchMessages).toHaveBeenCalledWith('hoi-dap', {
                    around: '0195a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
                })
            )
        })

        it('says "Page not found" for a link to a message of a channel one cannot see, in its server (S-MOD-06)', async () => {
            const router = renderAt('/channels/ot/secret/0195a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')

            expect(await screen.findByRole('heading', { name: "We can't find this page" })).toBeInTheDocument()
            // Below 1024 its Header keeps only ☰, to reach the channels (S-MOD-06 768).
            expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument()
            expect(document.title).toBe('Page not found · NezFocus')
            expect(router.state.location.pathname).toBe('/channels/ot/secret/0195a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')
            const channels = screen.getByRole('navigation', { name: /Ôn thi Giải tích 2/ })
            expect(within(channels).queryByRole('link', { current: 'page' })).not.toBeInTheDocument()
            await expectNoA11yViolations()

            await userEvent.click(screen.getByRole('link', { name: 'Back to home' }))
            await waitFor(() => expect(router.state.location.pathname).toBe('/study'))
        })

        it('says it too for a link to a message of a server one is not in, no server chosen', async () => {
            const router = renderAt('/channels/gone/hoi-dap/0195a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')

            expect(await screen.findByRole('heading', { name: "We can't find this page" })).toBeInTheDocument()
            expect(router.state.location.pathname).toBe('/channels/gone/hoi-dap/0195a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')
            expect(within(rail()).queryByRole('link', { current: 'page' })).not.toBeInTheDocument()
        })

        it('and for a link whose message id is not one', async () => {
            renderAt('/channels/ot/hoi-dap/m1')
            expect(await screen.findByRole('heading', { name: "We can't find this page" })).toBeInTheDocument()
            expect(messagesApi.fetchMessages).not.toHaveBeenCalledWith('hoi-dap', { around: 'm1' })
        })

        it('and for a link to a message of a voice room', async () => {
            renderAt('/channels/ot/quiet/0195a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')
            expect(await screen.findByRole('heading', { name: "We can't find this page" })).toBeInTheDocument()
        })

        it('has no critical or serious accessibility problem', async () => {
            renderAt('/channels/ot/hoi-dap')
            await screen.findByRole('heading', { level: 1, name: 'hoi-dap' })
            await expectNoA11yViolations()
        })
    })

    describe('unread and mentions (REQ-MSG-09, C-05, C-06, X-01)', () => {
        const readState = (serverId: string, channelId: string, unreadCount: number, mentionCount: number) => ({
            serverId,
            channelId,
            lastReadId: '0190a000-0000-7000-8000-000000000010',
            unreadCount,
            mentionCount
        })
        beforeEach(() => {
            serversApi.fetchServers.mockResolvedValue([OT, { ...ND, channels: [channel('hoi-dap-nd')] }])
            readStatesApi.fetchReadStates.mockResolvedValue([
                readState('ot', 'hoi-dap', 3, 2),
                readState('ot', 'chao-mung', 1, 0),
                readState('nd', 'hoi-dap-nd', 5, 0)
            ])
        })

        it('gives a server its mentions as a badge, or says it has unread messages', async () => {
            renderAt('/channels/ot/ban-can-su')
            const ot = await within(rail()).findByRole('link', { name: 'Ôn thi Giải tích 2, 2 unread mentions of you' })
            expect(within(ot.closest('li')!).getByText('2')).toBeInTheDocument()
            const nd = within(rail()).getByRole('link', { name: 'Nhóm đồ án Mobile, unread messages' })
            expect(nd.closest('li')?.querySelector('[data-unread]')).not.toBeNull()
        })

        it('puts an unread channel in bold, with its mentions as a badge', async () => {
            renderAt('/channels/ot/ban-can-su')
            const channels = await screen.findByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })
            const hoiDap = await within(channels).findByRole('link', { name: 'hoi-dap, 2 unread mentions of you' })
            expect(hoiDap).toHaveClass('font-semibold', 'text-text-primary')
            expect(within(hoiDap).getByText('2')).toBeInTheDocument()
            expect(within(channels).getByRole('link', { name: 'chao-mung, unread messages' })).toHaveClass(
                'font-semibold'
            )
            expect(within(channels).getByRole('link', { name: 'Phòng học im lặng' })).not.toHaveClass('font-semibold')
            await expectNoA11yViolations()
        })

        it('starts the tab title with every mention still unread', async () => {
            renderAt('/channels/ot/ban-can-su')
            await waitFor(() => expect(document.title).toBe('(2) NezFocus'))
        })

        it('counts only channels still listed: one deleted, or of a server left, no longer counts (owner, 14/11/2026)', async () => {
            readStatesApi.fetchReadStates.mockResolvedValue([
                readState('ot', 'hoi-dap', 3, 2),
                readState('ot', 'deleted-channel', 4, 4),
                readState('left-server', 'chung', 7, 7)
            ])
            renderAt('/channels/ot/ban-can-su')
            expect(
                await within(rail()).findByRole('link', { name: 'Ôn thi Giải tích 2, 2 unread mentions of you' })
            ).toBeInTheDocument()
            await waitFor(() => expect(document.title).toBe('(2) NezFocus'))
        })

        it('a folded category still shows a channel with mentions of the reader (C-06)', async () => {
            renderAt('/channels/ot/ban-can-su')
            const channels = await screen.findByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })
            await within(channels).findByRole('link', { name: 'hoi-dap, 2 unread mentions of you' })
            await userEvent.click(within(channels).getByRole('button', { name: 'Thông tin' }))
            expect(
                within(channels).getByRole('link', { name: 'hoi-dap, 2 unread mentions of you' })
            ).toBeInTheDocument()
            expect(within(channels).queryByRole('link', { name: /chao-mung/ })).not.toBeInTheDocument()
        })
    })

    describe('server settings (S-SET-01, C-27, C-05)', () => {
        it('opens from the rail by right-click, keeps the server chosen, and lists the pages beside it', async () => {
            serversApi.fetchServers.mockResolvedValue([OT_MANAGED, ND])
            const router = renderAt('/channels/ot/hoi-dap')
            const picture = await within(rail()).findByRole('link', { name: 'Ôn thi Giải tích 2' })
            fireEvent.contextMenu(picture)
            await userEvent.click(await screen.findByRole('menuitem', { name: 'Server settings' }))

            await waitFor(() => expect(router.state.location.pathname).toBe('/servers/ot/settings/overview'))
            expect(within(rail()).getByRole('link', { name: 'Ôn thi Giải tích 2' })).toHaveAttribute(
                'aria-current',
                'page'
            )
            const nav = screen.getByRole('navigation', { name: 'Server settings' })
            expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
            expect(
                within(nav)
                    .getAllByRole('link')
                    .map((link) => link.textContent)
            ).toEqual(['Overview', 'Invites'])
            expect(screen.getByRole('heading', { level: 2, name: 'Ôn thi Giải tích 2' })).toBeInTheDocument()
            expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument()
            await expectNoA11yViolations()
        })

        it('opens the same menu with Shift+F10, and from the server name', async () => {
            serversApi.fetchServers.mockResolvedValue([OT_MANAGED])
            renderAt('/channels/ot/hoi-dap')
            const picture = await within(rail()).findByRole('link', { name: 'Ôn thi Giải tích 2' })
            picture.focus()
            await userEvent.keyboard('{Shift>}{F10}{/Shift}')
            expect(await screen.findByRole('menuitem', { name: 'Server settings' })).toBeInTheDocument()
            await userEvent.keyboard('{Escape}')
            await waitFor(() => expect(picture).toHaveFocus())

            await userEvent.click(screen.getByRole('button', { name: 'Ôn thi Giải tích 2' }))
            const menu = await screen.findByRole('menu')
            // Managing the server, not channels: settings, then Leave, always there.
            expect(
                within(menu)
                    .getAllByRole('menuitem')
                    .map((item) => item.textContent)
            ).toEqual(['Server settings', 'Leave server'])
        })

        it('offers only Leave, with no rule above it, to someone with no other row (S-SRV-04)', async () => {
            renderAt('/channels/ot/hoi-dap')
            const picture = await within(rail()).findByRole('link', { name: 'Ôn thi Giải tích 2' })
            fireEvent.contextMenu(picture)
            const menu = await screen.findByRole('menu')
            expect(
                within(menu)
                    .getAllByRole('menuitem')
                    .map((item) => item.textContent)
            ).toEqual(['Leave server'])
            expect(within(menu).queryByRole('separator')).not.toBeInTheDocument()
        })
    })

    describe('the right panel', () => {
        it('opens as a sheet below 1280; Esc closes it and focus goes back', async () => {
            renderAt('/panel')
            const button = await screen.findByRole('button', { name: 'Members' })
            // A narrow window (jsdom matches no media query): closed at first.
            expect(button).toHaveAttribute('aria-pressed', 'false')
            expect(screen.queryByRole('complementary', { name: 'Members' })).not.toBeInTheDocument()

            await userEvent.click(button)
            expect(within(screen.getByRole('complementary', { name: 'Members' })).getByText('Bình')).toBeVisible()
            expect(button).toHaveAttribute('aria-pressed', 'true')
            await expectNoA11yViolations()

            await userEvent.keyboard('{Escape}')
            expect(screen.queryByRole('complementary', { name: 'Members' })).not.toBeInTheDocument()
            expect(button).toHaveFocus()
        })
    })

    describe('the pins of a text channel (S-CHAT-02)', () => {
        it('opens from [📌] in the Header; a card opens its message and closes the sheet', async () => {
            pinsApi.fetchPins.mockResolvedValueOnce([
                {
                    id: '0190a0b0-0000-7000-8000-000000000001',
                    channelId: 'hoi-dap',
                    type: 'regular',
                    author: { id: 'tuan', username: 'tuan.le', displayName: 'Tuấn', avatarUrl: null },
                    content: 'Đề cương ôn tập giữa kỳ',
                    mentionUsers: [],
                    mentionRoles: [],
                    mentionEveryone: false,
                    mentionHereUserIds: [],
                    attachments: [],
                    systemEvent: null,
                    systemData: null,
                    systemUser: null,
                    replyTo: null,
                    editedAt: null,
                    pinned: true,
                    reactions: [],
                    createdAt: '2026-10-16T13:30:00.000Z',
                    pinnedAt: '2026-10-18T14:00:00.000Z'
                }
            ])
            messagesApi.fetchMessages.mockImplementation(async (..._: unknown[]) => ({
                items: [
                    {
                        id: '0190a0b0-0000-7000-8000-000000000001',
                        channelId: 'hoi-dap',
                        type: 'regular',
                        author: { id: 'tuan', username: 'tuan.le', displayName: 'Tuấn', avatarUrl: null },
                        content: 'Đề cương ôn tập giữa kỳ',
                        mentionUsers: [],
                        mentionRoles: [],
                        mentionEveryone: false,
                        mentionHereUserIds: [],
                        attachments: [],
                        systemEvent: null,
                        systemData: null,
                        systemUser: null,
                        replyTo: null,
                        editedAt: null,
                        pinned: true,
                        reactions: [],
                        createdAt: '2026-10-16T13:30:00.000Z'
                    }
                ] as never[],
                hasMoreBefore: false,
                hasMoreAfter: false
            }))
            // Already at a message: the page stays the same one, only its target changes.
            const router = renderAt('/channels/ot/hoi-dap/0190a0b0-0000-7000-8000-000000000001')
            const button = await screen.findByRole('button', { name: 'Pinned messages' })
            // Closed at first (SRS 1.71).
            expect(button).toHaveAttribute('aria-pressed', 'false')

            await userEvent.click(button)
            const panel = await screen.findByRole('complementary', { name: 'Pinned messages' })
            await userEvent.click(await within(panel).findByRole('button', { name: /Đề cương ôn tập giữa kỳ/ }))

            await waitFor(() =>
                expect(router.state.location.pathname).toBe('/channels/ot/hoi-dap/0190a0b0-0000-7000-8000-000000000001')
            )
            expect(screen.queryByRole('complementary', { name: 'Pinned messages' })).not.toBeInTheDocument()
            // Not lost with the sheet: on the message, lit up.
            await waitFor(() => expect(screen.getByRole('article', { name: /Đề cương ôn tập giữa kỳ/ })).toHaveFocus())
            messagesApi.fetchMessages.mockImplementation(async (..._: unknown[]) => ({
                items: [],
                hasMoreBefore: false,
                hasMoreAfter: false
            }))
        })

        it('shows one right panel at a time: the pins close the members, the members the pins (D-175)', async () => {
            renderAt('/channels/ot/hoi-dap')
            const members = await screen.findByRole('button', { name: 'Members' })
            const pins = screen.getByRole('button', { name: 'Pinned messages' })

            await userEvent.click(members)
            expect(await screen.findByRole('complementary', { name: 'Members' })).toBeInTheDocument()
            expect(members).toHaveAttribute('aria-pressed', 'true')

            await userEvent.click(pins)
            expect(await screen.findByRole('complementary', { name: 'Pinned messages' })).toBeInTheDocument()
            expect(screen.queryByRole('complementary', { name: 'Members' })).not.toBeInTheDocument()
            expect(members).toHaveAttribute('aria-pressed', 'false')

            await userEvent.click(members)
            expect(await screen.findByRole('complementary', { name: 'Members' })).toBeInTheDocument()
            expect(screen.queryByRole('complementary', { name: 'Pinned messages' })).not.toBeInTheDocument()
        })

        it('lets a moderator unpin from a card of the sheet; Esc closes the card menu, not the sheet', async () => {
            const manage = String(BigInt(MEMBER) | (1n << 14n))
            serversApi.fetchServers.mockResolvedValue([
                {
                    ...OT,
                    channels: OT.channels.map((item) =>
                        item.id === 'hoi-dap' ? { ...item, permissions: manage } : item
                    )
                },
                ND
            ])
            pinsApi.fetchPins.mockResolvedValueOnce([
                {
                    id: '0190a0b0-0000-7000-8000-000000000002',
                    channelId: 'hoi-dap',
                    type: 'regular',
                    author: { id: 'ha', username: 'ha.vu', displayName: 'Hà', avatarUrl: null },
                    content: 'Tổng hợp công thức chương 3',
                    mentionUsers: [],
                    mentionRoles: [],
                    mentionEveryone: false,
                    mentionHereUserIds: [],
                    attachments: [],
                    systemEvent: null,
                    systemData: null,
                    systemUser: null,
                    replyTo: null,
                    editedAt: null,
                    pinned: true,
                    reactions: [],
                    createdAt: '2026-10-15T14:12:00.000Z',
                    pinnedAt: '2026-10-18T14:00:00.000Z'
                }
            ])
            pinsApi.unpinMessage.mockResolvedValue(undefined)
            renderAt('/channels/ot/hoi-dap')
            await userEvent.click(await screen.findByRole('button', { name: 'Pinned messages' }))
            const panel = await screen.findByRole('complementary', { name: 'Pinned messages' })

            await userEvent.click(await within(panel).findByRole('button', { name: 'Pinned message options' }))
            await userEvent.keyboard('{Escape}')
            expect(screen.queryByRole('menu')).not.toBeInTheDocument()
            expect(screen.getByRole('complementary', { name: 'Pinned messages' })).toBeInTheDocument()

            await userEvent.click(within(panel).getByRole('button', { name: 'Pinned message options' }))
            await userEvent.click(await screen.findByRole('menuitem', { name: 'Unpin' }))

            await waitFor(() =>
                expect(pinsApi.unpinMessage).toHaveBeenCalledWith('hoi-dap', '0190a0b0-0000-7000-8000-000000000002')
            )
            expect(screen.getByRole('complementary', { name: 'Pinned messages' })).toBeInTheDocument()
        })
    })

    describe('the navigation sheet below 1024', () => {
        it('opens from ☰ into the list, closes on Esc with focus back on ☰', async () => {
            renderAt('/study')
            const menu = await screen.findByRole('button', { name: 'Open navigation' })
            expect(menu).toHaveAttribute('aria-expanded', 'false')

            await userEvent.click(menu)
            expect(menu).toHaveAttribute('aria-expanded', 'true')
            expect(screen.getByRole('link', { name: 'Overview' })).toHaveFocus()

            await userEvent.keyboard('{Escape}')
            expect(menu).toHaveAttribute('aria-expanded', 'false')
            expect(menu).toHaveFocus()
        })

        it('closes when a page is opened from it', async () => {
            renderAt('/study')
            const menu = await screen.findByRole('button', { name: 'Open navigation' })
            await userEvent.click(menu)
            await userEvent.click(await within(rail()).findByRole('link', { name: 'Ôn thi Giải tích 2' }))
            await screen.findByRole('heading', { level: 1, name: 'ban-can-su' })
            expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
        })
    })

    describe('your menu (S-ME-01)', () => {
        const openMenu = async () => {
            await userEvent.click(await screen.findByRole('button', { name: 'An, Online — open your menu' }))
            return screen.findByRole('menu')
        }

        it('shows who you are, and goes to your profile and to Settings', async () => {
            const router = renderAt('/study')
            const menu = await openMenu()
            const me = within(menu).getByRole('menuitem', { name: 'An — view and edit your profile' })
            expect(me).toHaveTextContent('an.nguyen')
            expect(me).toHaveTextContent('Ôn Giải tích 2 mỗi tối 21:00')
            await expectNoA11yViolations()

            await userEvent.click(me)
            expect(router.state.location.pathname).toBe('/settings/profile')
            expect(screen.getByRole('navigation', { name: 'Settings' })).toBeInTheDocument()

            await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Settings' }))
            expect(router.state.location.pathname).toBe('/settings/account')
        })

        it('signs out', async () => {
            renderAt('/study')
            await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Sign out' }))
            expect(authState.logout).toHaveBeenCalledTimes(1)
        })

        it('changes your status, shown on your avatar', async () => {
            renderAt('/study')
            const menu = await openMenu()
            await userEvent.click(within(menu).getByRole('menuitem', { name: 'Online' }))
            const statuses = await screen.findAllByRole('menuitemradio')
            expect(statuses.map((item) => item.textContent)).toEqual([
                'Online',
                'AwayTurns on by itself after 10 minutes of not using NezFocus',
                'Do not disturbOnly lets others know — notifications stay the same',
                'InvisibleEveryone sees you as offline'
            ])
            await userEvent.click(statuses[3]!)
            expect(await screen.findByRole('button', { name: 'An, Invisible — open your menu' })).toBeInTheDocument()
            expect(settingsApi.updateSettings).toHaveBeenCalledWith({ presence: 'invisible' })
        })

        it('shows "Away · automatic" once every tab went unused, the ✓ staying on Online (REQ-AUTH-07)', async () => {
            settingsApi.held.presence = 'online'
            renderAt('/study')
            await screen.findByRole('button', { name: 'An, Online — open your menu' })

            act(() => emitRealtimeEvent('presence.updated', { userId: profile.id, status: 'idle' }))

            try {
                await userEvent.click(
                    await screen.findByRole('button', { name: 'An, Away · automatic — open your menu' })
                )
                const menu = await screen.findByRole('menu')
                await userEvent.click(within(menu).getByRole('menuitem', { name: 'Away · automatic' }))
                expect(await screen.findByRole('menuitemradio', { name: /^Online/ })).toHaveAttribute(
                    'aria-checked',
                    'true'
                )
            } finally {
                act(() => useRealtimeStore.getState().reset())
            }
        })

        it('keeps do not disturb on the avatar though every tab went unused: away is only for online', async () => {
            settingsApi.held.presence = 'dnd'
            renderAt('/study')
            await screen.findByRole('button', { name: 'An, Do not disturb — open your menu' })

            act(() => emitRealtimeEvent('presence.updated', { userId: profile.id, status: 'idle' }))
            await new Promise((resolve) => setTimeout(resolve, 50))

            expect(screen.getByRole('button', { name: 'An, Do not disturb — open your menu' })).toBeInTheDocument()
            settingsApi.held.presence = 'online'
        })

        it('puts the old status back and says so when it could not be saved', async () => {
            settingsApi.held.presence = 'online'
            settingsApi.updateSettings.mockRejectedValueOnce(new Error('offline'))
            render(<Toaster />)
            renderAt('/study')
            const menu = await openMenu()
            await userEvent.click(within(menu).getByRole('menuitem', { name: 'Online' }))
            await userEvent.click((await screen.findAllByRole('menuitemradio'))[2]!)

            expect(await screen.findByText('Status not changed')).toBeInTheDocument()
            expect(await screen.findByRole('button', { name: 'An, Online — open your menu' })).toBeInTheDocument()
        })
    })
})
