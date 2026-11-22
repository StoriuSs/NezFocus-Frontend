import { afterEach, describe, it, expect, vi, beforeEach, onTestFinished } from 'vitest'
import { Toaster } from 'sonner'
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { Users } from 'lucide-react'
import i18n from '@/i18n'
import { IconButton } from '@/components/ui/icon-button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RightPanel, usePanel } from '@/components/shell/RightPanel'
import { PANEL_DOCKS } from '@/hooks/useMediaQuery'
import { ShellPage } from '@/components/shell/ShellPage'
import { expectNoA11yViolations } from '@/test/a11y'
import { mockAuthStore, queryWrapper } from '@/test/helpers'
import { session as studySession } from '@/test/study-sessions'
import type { Server, ServerChannel } from '@/features/servers'
import { useChannelDialogs } from '@/features/servers/channel-dialogs.store'
import { useServerRemovals } from '@/features/servers/server-removals.store'

const authState = {
    isAuthenticated: true,
    user: { id: 'user-1', email: 'an@example.test', username: 'an.nguyen', displayName: 'An', roles: ['user'] },
    logout: vi.fn()
}
const profile = { ...authState.user, avatarUrl: null, bio: 'Ôn Giải tích 2 mỗi tối 21:00' }

const serversApi = {
    fetchServers: vi.fn(),
    fetchServer: vi.fn(),
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
// The Task Board of a channel with it on: no tasks yet. One's tasks (the rail's badge, the To-do page): none either.
const tasksApi = vi.hoisted(() => ({
    fetchOpenTasks: vi.fn(async (..._: unknown[]) => ({ items: [], doneCount: 0, hasMore: false })),
    fetchMyTasks: vi.fn(
        async (..._: unknown[]): Promise<unknown> => ({ items: [], doneCount: 0, dueCount: 0, hasMore: false })
    ),
    // A task's detail (`?task=`): still loading, these tests are about what opens it.
    fetchTask: vi.fn(() => new Promise<never>(() => undefined)),
    fetchTaskHistory: vi.fn(() => new Promise<never>(() => undefined))
}))
vi.mock('@/features/tasks/api/tasks.api', () => tasksApi)
// One's inbox (the rail's badge, S-NOTI-01): empty unless a test says otherwise.
const notificationsApi = vi.hoisted(() => ({
    INBOX_PAGE: 30,
    fetchNotifications: vi.fn(
        async (..._: unknown[]): Promise<unknown> => ({ items: [], unreadCount: 0, hasMore: false })
    ),
    markNotificationsRead: vi.fn(async (..._: unknown[]) => 0)
}))
vi.mock('@/features/notifications/api/notifications.api', () => notificationsApi)
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
const { useVoiceStore } = await import('@/features/voice')
const { default: ServerSettingsPage } = await import('@/features/servers/pages/ServerSettingsPage')
const { default: MyTasksRoute } = await import('@/features/servers/components/MyTasksRoute')
const { useCreateServerDialog } = await import('@/features/servers')
const { useInboxStore } = await import('@/features/notifications')

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
    studyStarter: 'anyone',
    studyFocusMinutes: 25,
    studyShortBreakMinutes: 5,
    studyLongBreakMinutes: null,
    studyLongBreakEvery: null,
    taskBoardEnabled: false,
    permissions: MEMBER,
    viewRoleIds: null,
    voiceStates: null,
    focusSession: null,
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
                    { path: '/tasks', element: <MyTasksRoute />, handle: { column: 'tasks' } },
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
        // The inbox closed, as a test that opened it may have left it.
        useInboxStore.getState().setOpen(false)
    })

    it('does nothing with a file dropped on a page that takes none: the browser never opens it, leaving a room (M4 L6b-a)', async () => {
        for (const path of ['/study', '/settings/account']) {
            cleanup()
            renderAt(path)
            const heading = await screen.findByRole('heading', { level: 1 })
            const files = { types: ['Files'], files: [], dropEffect: 'copy' }
            const over = createEvent.dragOver(heading, { dataTransfer: files })
            fireEvent(heading, over)
            expect(over.defaultPrevented).toBe(true)
            const drop = createEvent.drop(heading, { dataTransfer: files })
            fireEvent(heading, drop)
            expect(drop.defaultPrevented).toBe(true)
            // Text dragged from the page is not a file: left to the browser.
            const text = createEvent.dragOver(heading, { dataTransfer: { types: ['text/plain'] } })
            fireEvent(heading, text)
            expect(text.defaultPrevented).toBe(false)
        }
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
        })

        it('closes the inbox with the shell: the next sign-in in this tab starts with it closed', async () => {
            renderAt('/study')
            await within(screen.getByRole('navigation', { name: 'Pages' })).findByRole('button', {
                name: /^Notifications/
            })
            act(() => useInboxStore.getState().setOpen(true))

            cleanup()

            expect(useInboxStore.getState().open).toBe(false)
        })

        it('counts on Notifications the unread items, and opens the inbox over the page (S-NOTI-01)', async () => {
            const mention = {
                id: '0193a000-0000-7000-8000-000000000001',
                type: 'mention',
                serverId: 'nd',
                channelId: 'hoi-dap',
                messageId: 'm1',
                roleId: null,
                reason: 'user',
                actor: { id: 'lan', username: 'lan.pham', displayName: 'Lan', avatarUrl: null },
                message: {
                    id: 'm1',
                    content: 'bring the laptop tomorrow',
                    mentionUsers: [],
                    mentionRoles: [],
                    files: { count: 0, images: 0 }
                },
                readAt: null,
                createdAt: new Date().toISOString()
            }
            notificationsApi.fetchNotifications.mockResolvedValue({ items: [mention], unreadCount: 1, hasMore: false })
            const router = renderAt('/study')
            const pages = screen.getByRole('navigation', { name: 'Pages' })
            const bell = await within(pages).findByRole('button', { name: 'Notifications, 1 unread' })
            expect(within(bell.closest('li')!).getByText('1')).toBeInTheDocument()
            expect(bell).toHaveAttribute('aria-expanded', 'false')

            await userEvent.click(bell)
            const inbox = await screen.findByRole('dialog', { name: 'Notifications' }, { timeout: 5000 })
            expect(bell).toHaveAttribute('aria-expanded', 'true')
            expect(
                await within(inbox).findByRole('link', {
                    name: /^Unread\. Lan mentioned you: bring the laptop tomorrow/
                })
            ).toHaveFocus()
            // Over the page, which stays where it was.
            expect(router.state.location.pathname).toBe('/study')

            await userEvent.keyboard('{Escape}')
            await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument())
            expect(bell).toHaveFocus()
        })

        it('counts on To-do the tasks overdue or due today, and opens the page with its column (S-TASK-04)', async () => {
            const due = {
                id: 't1',
                serverId: 'nd',
                channelId: 'hoi-dap',
                title: 'Sửa lỗi đăng nhập',
                description: '',
                status: 'doing',
                dueAt: '2026-10-16T16:59:00.000Z',
                completedAt: null,
                createdAt: '2026-10-12T00:00:00.000Z',
                updatedAt: '2026-10-12T00:00:00.000Z',
                creator: { id: 'user-1', username: 'an.nguyen', displayName: 'An', avatarUrl: null, leftServer: false },
                assignees: [],
                group: 'overdue'
            }
            tasksApi.fetchMyTasks.mockResolvedValue({ items: [due], doneCount: 0, dueCount: 1, hasMore: false })
            const router = renderAt('/study')
            const pages = screen.getByRole('navigation', { name: 'Pages' })
            const todo = await within(pages).findByRole('link', { name: 'To-do, 1 task overdue or due today' })
            expect(within(todo.closest('li')!).getByText('1')).toBeInTheDocument()

            await userEvent.click(todo)
            expect(router.state.location.pathname).toBe('/tasks')
            expect(
                await screen.findByRole('heading', { level: 1, name: 'To-do' }, { timeout: 5000 })
            ).toBeInTheDocument()
            expect(todo).toHaveAttribute('aria-current', 'page')
            const column = await screen.findByRole('navigation', { name: 'Filter tasks by server' })
            expect(
                await within(column).findByRole('link', { name: 'Nhóm đồ án Mobile, 1 task not done' })
            ).toBeVisible()
            expect(await screen.findByRole('heading', { name: 'OVERDUE — 1' })).toBeInTheDocument()
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
            // The dialog is a lazy chunk; under a full parallel run its import can outlast the 1 s default.
            expect(
                await screen.findByRole('heading', { name: 'Create a server' }, { timeout: 5000 })
            ).toBeInTheDocument()
        })

        it('has no critical or serious accessibility problem', async () => {
            renderAt('/study')
            await screen.findByRole('heading', { level: 1, name: 'Study' })
            await expectNoA11yViolations()
        })
    })

    describe('in no server yet (08 S-STUDY-01 no-server, 02 no-server-first)', () => {
        it('offers to create a Study Server from the rooms part, with it chosen', async () => {
            serversApi.fetchServers.mockResolvedValue([])
            renderAt('/study')
            expect(
                await screen.findByRole(
                    'heading',
                    { level: 2, name: "You're not in any server yet" },
                    { timeout: 5000 }
                )
            ).toBeInTheDocument()
            await userEvent.click(screen.getByRole('button', { name: 'Create a server' }))
            const dialog = await screen.findByRole('dialog', { name: 'Create a server' })
            expect(within(dialog).getByRole('radio', { name: /Study Server/ })).toHaveAttribute('aria-checked', 'true')
        })

        it('welcomes a new account by name, right after it is completed, and nothing else before', async () => {
            let answer: (servers: never[]) => void = () => undefined
            serversApi.fetchServers.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
            renderAt({ pathname: '/study', state: { firstVisit: true } })
            await screen.findByRole('heading', { level: 1, name: 'Study' })
            // Time enough for the page's lazy parts to come, were they asked for.
            await expect(screen.findByRole('heading', { name: 'Study alone' }, { timeout: 3000 })).rejects.toThrow()
            act(() => answer([]))
            expect(
                await screen.findByRole('heading', { level: 2, name: 'Welcome to NezFocus, An' })
            ).toBeInTheDocument()
        })

        it('says nothing of it to someone in a server', async () => {
            renderAt('/study')
            await within(rail()).findByRole('link', { name: 'Ôn thi Giải tích 2' })
            expect(screen.queryByRole('heading', { name: "You're not in any server yet" })).not.toBeInTheDocument()
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

        it('keeps the channel shown when reading the servers again fails once the socket is back', async () => {
            renderAt('/channels/ot/ban-can-su')
            expect(await screen.findByRole('heading', { level: 1, name: 'ban-can-su' })).toBeInTheDocument()
            const reads = serversApi.fetchServers.mock.calls.length
            serversApi.fetchServers.mockRejectedValue(new Error('offline'))
            act(() => emitRealtimeEvent('ready', {}))
            await waitFor(() => expect(serversApi.fetchServers.mock.calls.length).toBeGreaterThan(reads))
            await act(async () => {})
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

        it("opens a voice room's preview page: who is in it and the way in (S-ROOM-01, M4)", async () => {
            renderAt('/channels/ot/quiet')
            expect(await screen.findByRole('heading', { level: 1, name: 'Phòng học im lặng' })).toBeInTheDocument()
            // A study room: its ring, empty (07 S-ROOM-01 idle, C-18).
            expect(await screen.findByText('The room is empty', {}, { timeout: 5000 })).toBeVisible()
            expect(screen.getByRole('button', { name: 'Join room' })).toBeEnabled()
        })

        it("says the room's link is coming back on the room's page, under the Header (S-ROOM-06, M4 A3)", async () => {
            useVoiceStore.setState({
                call: { serverId: 'ot', channelId: 'quiet', name: 'Phòng học im lặng', phase: 'reconnecting' }
            })
            try {
                renderAt('/channels/ot/quiet')
                await screen.findByRole('heading', { level: 1, name: 'Phòng học im lặng' })
                const banner = { selector: 'p[role="status"] span' }
                expect(await screen.findByText('Reconnecting…', banner)).toBeVisible()
                act(() =>
                    useVoiceStore.setState({
                        call: { serverId: 'ot', channelId: 'quiet', name: 'Phòng học im lặng', phase: 'connected' }
                    })
                )
                expect(screen.queryByText('Reconnecting…', banner)).toBeNull()
            } finally {
                useVoiceStore.setState({ call: null })
            }
        })

        it('opens "People in the room" from the "+N" seat, one right panel at a time (C-18, 07 room-13-people)', async () => {
            const crowd = Array.from({ length: 13 }, (_, index) => ({
                user: { id: `p${index}`, username: `p${index}`, displayName: `Người ${index}`, avatarUrl: null },
                roleIds: [],
                isOwner: false,
                joinedAt: '2026-11-22T14:00:00.000Z',
                micOn: index === 1,
                cameraOn: false,
                screenSharing: false,
                modMuted: false
            }))
            const full: Server = {
                ...OT,
                channels: OT.channels.map((one) => (one.id === 'quiet' ? { ...one, voiceStates: crowd } : one))
            }
            serversApi.fetchServers.mockResolvedValue([full, ND])
            // A window wide enough for a column (C-08): no sheet that a click outside would close by itself.
            const before = window.matchMedia
            window.matchMedia = ((query: string) => ({
                matches: query === PANEL_DOCKS,
                media: query,
                addEventListener: () => undefined,
                removeEventListener: () => undefined
            })) as never
            onTestFinished(() => {
                window.matchMedia = before
            })
            renderAt('/channels/ot/quiet')
            await userEvent.click(
                await screen.findByRole('button', { name: 'See all 13 people in the room' }, { timeout: 5000 })
            )
            const panel = await screen.findByRole('complementary', { name: 'People in the room — 13' })
            const rows = await within(panel).findAllByRole('listitem', {}, { timeout: 5000 })
            expect(rows).toHaveLength(13)
            expect(rows[0]).toHaveAccessibleName('Người 1, mic on')
            await expectNoA11yViolations()

            // As a column too it closes with its own button, the focus back on the seat (C-08).
            await userEvent.click(within(panel).getByRole('button', { name: 'Close' }))
            expect(screen.queryByRole('complementary', { name: 'People in the room — 13' })).toBeNull()
            await waitFor(() =>
                expect(screen.getByRole('button', { name: 'See all 13 people in the room' })).toHaveFocus()
            )

            // The room's chat takes its place.
            await userEvent.click(screen.getByRole('button', { name: 'See all 13 people in the room' }))
            await screen.findByRole('complementary', { name: 'People in the room — 13' })
            await userEvent.click(screen.getByRole('button', { name: 'Room chat' }))
            expect(screen.queryByRole('complementary', { name: 'People in the room — 13' })).toBeNull()
            expect(await screen.findByRole('complementary', { name: 'Room chat' })).toBeInTheDocument()

            // Opened over the chat, then closed: the chat, open before, is shown again (its message box takes the focus).
            await userEvent.click(screen.getByRole('button', { name: 'See all 13 people in the room' }))
            const again = await screen.findByRole('complementary', { name: 'People in the room — 13' })
            await userEvent.click(within(again).getByRole('button', { name: 'Close' }))
            expect(await screen.findByRole('complementary', { name: 'Room chat' })).toBeInTheDocument()
        }, 15_000)

        it('says "Page not found" for the address of a channel one cannot see (02 S-CHAT-01 forbidden)', async () => {
            const router = renderAt('/channels/ot/0195a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')
            expect(await screen.findByRole('heading', { name: "We can't find this page" })).toBeInTheDocument()
            expect(router.state.location.pathname).toBe('/channels/ot/0195a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')
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

        it('opens a link to a message of a voice room on the room, its chat open at it, once (S-ROOM-08)', async () => {
            const id = '0195a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
            messagesApi.fetchMessages.mockImplementation(async (..._: unknown[]) => ({
                items: [
                    {
                        id,
                        channelId: 'quiet',
                        type: 'regular',
                        author: { id: 'tuan', username: 'tuan.le', displayName: 'Tuấn', avatarUrl: null },
                        content: 'Mình vào phòng lúc 21:00',
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
                        pinned: false,
                        reactions: [],
                        createdAt: '2026-10-16T13:30:00.000Z'
                    }
                ] as never[],
                hasMoreBefore: false,
                hasMoreAfter: false
            }))
            try {
                renderAt(`/channels/ot/quiet/${id}`)
                expect(await screen.findByRole('heading', { level: 1, name: 'Phòng học im lặng' })).toBeInTheDocument()
                const chat = await screen.findByRole('complementary', { name: 'Room chat' })
                const article = () =>
                    within(screen.getByRole('complementary', { name: 'Room chat' })).getByRole('article', {
                        name: /Mình vào phòng lúc 21:00/
                    })
                await within(chat).findByRole('article', { name: /Mình vào phòng lúc 21:00/ }, { timeout: 5000 })
                await waitFor(() => expect(messagesApi.fetchMessages).toHaveBeenCalledWith('quiet', { around: id }))
                await waitFor(() => expect(article()).toHaveAttribute('data-highlight'))
                const button = screen.getByRole('button', { name: 'Room chat' })
                expect(button).toHaveAttribute('aria-pressed', 'true')

                // Closed and opened again, the address still the link's: the message is not gone to and lit up again.
                await userEvent.click(button)
                await userEvent.click(button)
                await within(await screen.findByRole('complementary', { name: 'Room chat' })).findByRole(
                    'article',
                    { name: /Mình vào phòng lúc 21:00/ },
                    { timeout: 5000 }
                )
                expect(article()).not.toHaveAttribute('data-highlight')
            } finally {
                messagesApi.fetchMessages.mockImplementation(async (..._: unknown[]) => ({
                    items: [],
                    hasMoreBefore: false,
                    hasMoreAfter: false
                }))
            }
        })

        it('has no critical or serious accessibility problem', async () => {
            renderAt('/channels/ot/hoi-dap')
            await screen.findByRole('heading', { level: 1, name: 'hoi-dap' })
            await expectNoA11yViolations()
        })
    })

    describe('live changes to servers (D-178, H1)', () => {
        // A server is read again 300 ms after an event, plus up to 500 at random: none here.
        beforeEach(() => void vi.spyOn(Math, 'random').mockReturnValue(0))
        afterEach(() => vi.mocked(Math.random).mockRestore())

        const without = (channelId: string): Server => ({
            ...OT,
            channels: OT.channels.filter((one) => one.id !== channelId)
        })

        it('shows a new channel a moment after it was made, reading only that server again', async () => {
            serversApi.fetchServer.mockResolvedValue({
                ...OT,
                channels: [...OT.channels, channel('tai-lieu', { position: 2 })]
            })
            renderAt('/channels/ot/hoi-dap')
            const channels = await screen.findByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })
            const reads = serversApi.fetchServers.mock.calls.length

            act(() => emitRealtimeEvent('channel.created', { serverId: 'ot' }))

            expect(
                await within(channels).findByRole('link', { name: 'tai-lieu' }, { timeout: 2000 })
            ).toBeInTheDocument()
            expect(serversApi.fetchServer).toHaveBeenCalledWith('ot')
            expect(serversApi.fetchServers.mock.calls.length).toBe(reads)
        })

        it('goes to the first text channel and says so when the open one is deleted or no longer seen (02 channel-removed)', async () => {
            render(<Toaster />)
            serversApi.fetchServer.mockResolvedValue(without('hoi-dap'))
            const router = renderAt('/channels/ot/hoi-dap')
            expect(await screen.findByRole('heading', { level: 1, name: 'hoi-dap' })).toBeInTheDocument()

            act(() => emitRealtimeEvent('channel.deleted', { serverId: 'ot' }))

            await waitFor(() => expect(router.state.location.pathname).toBe('/channels/ot/ban-can-su'), {
                timeout: 2000
            })
            expect(await screen.findByText('This channel is no longer available')).toBeInTheDocument()
        })

        it('says the room is gone when the one this tab was in is deleted on its page (07 ROOM-EDGE, D-212)', async () => {
            render(<Toaster />)
            // LiveKit put this tab out of it a moment ago, the server's word on why still to come.
            useVoiceStore.setState({ removed: { channelId: 'quiet', at: Date.now() } })
            serversApi.fetchServer.mockResolvedValue(without('quiet'))
            const router = renderAt('/channels/ot/quiet')
            expect(await screen.findByRole('heading', { level: 1, name: 'Phòng học im lặng' })).toBeInTheDocument()

            act(() => emitRealtimeEvent('channel.deleted', { serverId: 'ot' }))

            await waitFor(() => expect(router.state.location.pathname).toBe('/channels/ot/ban-can-su'), {
                timeout: 2000
            })
            expect(await screen.findByText('This room is no longer available')).toBeInTheDocument()
            expect(screen.queryByText('This channel is no longer available')).toBeNull()
            useVoiceStore.setState({ removed: null })
        })

        it('says it once when the open channel, held for a move, is deleted (S-SRV-06, 02 channel-removed)', async () => {
            render(<Toaster />)
            // An manages channels here, so may move one (MANAGE_CHANNELS, bit 3).
            const manages = String(BigInt(MEMBER) | (1n << 3n))
            const managed = (server: Server): Server => ({
                ...server,
                permissions: manages,
                channels: server.channels.map((one) => ({ ...one, permissions: manages }))
            })
            serversApi.fetchServers.mockResolvedValue([managed(OT), ND])
            serversApi.fetchServer.mockResolvedValue(managed(without('hoi-dap')))
            const router = renderAt('/channels/ot/hoi-dap')
            const channels = await screen.findByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })
            within(channels).getByRole('link', { name: 'hoi-dap' }).focus()
            await userEvent.keyboard(' ')
            expect(screen.getByText(/Picked up #hoi-dap/)).toBeInTheDocument()

            act(() => emitRealtimeEvent('channel.deleted', { serverId: 'ot' }))

            await waitFor(() => expect(router.state.location.pathname).toBe('/channels/ot/ban-can-su'), {
                timeout: 2000
            })
            await waitFor(() => expect(screen.getAllByText('This channel is no longer available')).toHaveLength(1))
            await new Promise((resolve) => setTimeout(resolve, 100))
            expect(screen.getAllByText('This channel is no longer available')).toHaveLength(1)
        })

        it('says a server was deleted, with its name, and opens the next one on the rail', async () => {
            render(<Toaster />)
            const router = renderAt('/channels/ot/hoi-dap')
            expect(await screen.findByRole('heading', { level: 1, name: 'hoi-dap' })).toBeInTheDocument()

            act(() => emitRealtimeEvent('server.deleted', { serverId: 'ot' }))

            expect(await screen.findByText('Ôn thi Giải tích 2 was deleted')).toBeInTheDocument()
            await waitFor(() => expect(router.state.location.pathname).toBe('/channels/nd/ban-can-su'))
            expect(within(rail()).queryByRole('link', { name: 'Ôn thi Giải tích 2' })).not.toBeInTheDocument()
        })

        describe('kicked or banned while the tab is open (11 S-MOD-02)', () => {
            afterEach(() => {
                useServerRemovals.setState({ queue: [] })
                useChannelDialogs.setState({ open: null })
            })

            const removed = (serverId: string, removedBy: 'kick' | 'ban', reason: string | null) =>
                act(() => emitRealtimeEvent('member.left', { serverId, userId: profile.id, removedBy, reason }))

            it('opens the next server first, then says they were removed, why, and what follows, with no Toast', async () => {
                render(<Toaster />)
                const router = renderAt('/channels/nd/hoi-dap')
                expect(await screen.findByRole('heading', { level: 1, name: 'hoi-dap' })).toBeInTheDocument()
                // As the API: the list read again after the kick no longer has the server.
                serversApi.fetchServers.mockResolvedValue([OT])

                removed('nd', 'kick', 'Spam')

                const dialog = await screen.findByRole('alertdialog', {
                    name: 'You were removed from Nhóm đồ án Mobile'
                })
                expect(router.state.location.pathname).toBe('/channels/ot/ban-can-su')
                // Under the modal dialog, the rail is hidden from the accessibility tree.
                const servers = screen.getByRole('navigation', { name: 'Servers', hidden: true })
                expect(within(servers).queryByRole('link', { name: 'Nhóm đồ án Mobile', hidden: true })).toBeNull()
                expect(
                    within(servers).getByRole('link', { name: 'Ôn thi Giải tích 2', hidden: true })
                ).toBeInTheDocument()
                expect(within(dialog).getByText('Reason: Spam')).toBeInTheDocument()
                expect(within(dialog).getByText('You can come back with a new invite.')).toBeInTheDocument()
                // One button, focused; no corner ✕ (C-14 one choice).
                expect(within(dialog).getAllByRole('button')).toHaveLength(1)
                expect(within(dialog).getByRole('button', { name: 'Got it' })).toHaveFocus()
                expect(screen.queryByText('You are no longer in Nhóm đồ án Mobile')).not.toBeInTheDocument()
                await expectNoA11yViolations()
            })

            it('says a ban without a reason leaves out the reason line, and that they cannot come back', async () => {
                renderAt('/channels/nd/hoi-dap')
                expect(await screen.findByRole('heading', { level: 1, name: 'hoi-dap' })).toBeInTheDocument()

                removed('nd', 'ban', null)

                const dialog = await screen.findByRole('alertdialog', {
                    name: 'You were banned from Nhóm đồ án Mobile'
                })
                expect(within(dialog).getByText('You cannot join this server again.')).toBeInTheDocument()
                expect(within(dialog).queryByText(/^Reason:/)).not.toBeInTheDocument()
            })

            it('closes on "Got it", with focus on the new page', async () => {
                const user = userEvent.setup()
                renderAt('/channels/nd/hoi-dap')
                expect(await screen.findByRole('heading', { level: 1, name: 'hoi-dap' })).toBeInTheDocument()
                removed('nd', 'kick', null)

                await user.click(await screen.findByRole('button', { name: 'Got it' }))

                expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
                await waitFor(() =>
                    expect(screen.getByRole('main')).toContainElement(document.activeElement as HTMLElement)
                )
            })

            it('shows one dialog at a time, in the order they came (E4)', async () => {
                const user = userEvent.setup()
                renderAt('/channels/nd/hoi-dap')
                expect(await screen.findByRole('heading', { level: 1, name: 'hoi-dap' })).toBeInTheDocument()

                removed('nd', 'kick', null)
                removed('ot', 'ban', 'Spam')

                expect(await screen.findByRole('alertdialog', { name: /Nhóm đồ án Mobile/ })).toBeInTheDocument()
                expect(screen.getAllByRole('alertdialog')).toHaveLength(1)
                await user.click(screen.getByRole('button', { name: 'Got it' }))
                expect(
                    await screen.findByRole('alertdialog', { name: 'You were banned from Ôn thi Giải tích 2' })
                ).toBeInTheDocument()
                await waitFor(() => expect(screen.getByRole('button', { name: 'Got it' })).toHaveFocus())
            })

            it('closes a dialog of that server first (Q4): it is not left over the new page', async () => {
                renderAt('/channels/nd/hoi-dap')
                expect(await screen.findByRole('heading', { level: 1, name: 'hoi-dap' })).toBeInTheDocument()
                act(() =>
                    useChannelDialogs
                        .getState()
                        .show({ kind: 'createChannel', serverId: 'nd', categoryId: null, type: 'text' })
                )
                expect(await screen.findByRole('dialog', { name: 'Create a channel' })).toBeInTheDocument()

                removed('nd', 'kick', null)

                expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
                expect(screen.queryByRole('dialog', { name: 'Create a channel' })).not.toBeInTheDocument()
            })

            it('says nothing when another tab of theirs left it: only a removal has a dialog', async () => {
                const router = renderAt('/channels/nd/hoi-dap')
                expect(await screen.findByRole('heading', { level: 1, name: 'hoi-dap' })).toBeInTheDocument()

                act(() =>
                    emitRealtimeEvent('member.left', {
                        serverId: 'nd',
                        userId: profile.id,
                        removedBy: null,
                        reason: null
                    })
                )

                await waitFor(() => expect(router.state.location.pathname).toBe('/channels/ot/ban-can-su'))
                expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
            })
        })

        it('goes to the Study page when the server deleted was the last one', async () => {
            serversApi.fetchServers.mockResolvedValue([OT])
            const router = renderAt('/channels/ot/hoi-dap')
            expect(await screen.findByRole('heading', { level: 1, name: 'hoi-dap' })).toBeInTheDocument()

            act(() => emitRealtimeEvent('server.deleted', { serverId: 'ot' }))

            await waitFor(() => expect(router.state.location.pathname).toBe('/study'))
        })

        it('says a server one was put out of while the socket was down, from the inbox, whose View opens it (H1, D-187)', async () => {
            render(<Toaster />)
            renderAt('/channels/ot/hoi-dap')
            expect(await screen.findByRole('heading', { level: 1, name: 'hoi-dap' })).toBeInTheDocument()
            const kicked = {
                id: '0193a000-0000-7000-8000-000000000012',
                type: 'moderation',
                serverId: 'nd',
                channelId: null,
                messageId: null,
                roleId: null,
                taskId: null,
                task: null,
                server: { name: 'Nhóm đồ án Mobile', action: 'kick', timeoutUntil: null, reason: null },
                reason: null,
                actor: null,
                message: null,
                readAt: null,
                createdAt: new Date().toISOString()
            }
            serversApi.fetchServers.mockResolvedValue([OT])
            notificationsApi.fetchNotifications.mockResolvedValue({ items: [kicked], unreadCount: 1, hasMore: false })

            // Back online: the list and the inbox are read again.
            act(() => emitRealtimeEvent('ready', {}))

            const toast = (await screen.findByText('You are no longer in Nhóm đồ án Mobile')).closest('li')!
            await userEvent.click(within(toast).getByRole('button', { name: 'View' }))
            const inbox = await screen.findByRole('dialog', { name: 'Notifications' }, { timeout: 5000 })
            expect(
                await within(inbox).findByRole('article', { name: /You were removed from Nhóm đồ án Mobile/ })
            ).toBeVisible()
            await waitFor(() =>
                expect(notificationsApi.markNotificationsRead).toHaveBeenCalledWith({ ids: [kicked.id] })
            )

            await userEvent.keyboard('{Escape}')
            notificationsApi.fetchNotifications.mockResolvedValue({ items: [], unreadCount: 0, hasMore: false })
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

        it('stays open, what is in it kept, when the window narrows below 1280 while it is open (A3)', async () => {
            // A window that docks the panel, then narrows.
            let wide = true
            const listeners = new Set<() => void>()
            const before = window.matchMedia
            window.matchMedia = ((query: string) => ({
                get matches() {
                    return query === PANEL_DOCKS ? wide : false
                },
                media: query,
                addEventListener: (_: string, listener: () => void) => listeners.add(listener),
                removeEventListener: (_: string, listener: () => void) => listeners.delete(listener)
            })) as never
            try {
                renderAt('/panel')
                // A column starts open; what it holds stays the same element through the change (a form typed in, a dialog).
                const held = within(await screen.findByRole('complementary', { name: 'Members' })).getByText('Bình')

                act(() => {
                    wide = false
                    listeners.forEach((listener) => listener())
                })

                expect(screen.getByRole('complementary', { name: 'Members' })).toBeInTheDocument()
                expect(held.isConnected).toBe(true)
            } finally {
                window.matchMedia = before
            }
        })
    })

    describe('a due-date reminder in a text channel (05 S-TASK-01)', () => {
        afterEach(() => {
            messagesApi.fetchMessages.mockImplementation(async (..._: unknown[]) => ({
                items: [],
                hasMoreBefore: false,
                hasMoreAfter: false
            }))
        })

        it('opens the task over the channel from "View task", with ?task= and no step in the history', async () => {
            messagesApi.fetchMessages.mockImplementation(async (..._: unknown[]) => ({
                items: [
                    {
                        id: '0190a0b0-0000-7000-8000-000000000009',
                        channelId: 'hoi-dap',
                        type: 'system',
                        author: null,
                        content: '',
                        mentionUsers: [],
                        mentionRoles: [],
                        mentionEveryone: false,
                        mentionHereUserIds: [],
                        attachments: [],
                        systemEvent: 'task_due',
                        systemData: {
                            taskId: 't1',
                            title: 'Ôn chương 4',
                            reminder: '24h',
                            dueAt: '2026-10-17T16:59:00.000Z',
                            userIds: ['an']
                        },
                        systemUser: null,
                        systemUsers: [{ id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null }],
                        replyTo: null,
                        editedAt: null,
                        pinned: false,
                        reactions: [],
                        createdAt: '2026-10-16T16:59:00.000Z'
                    }
                ] as never[],
                hasMoreBefore: false,
                hasMoreAfter: false
            }))
            const router = renderAt('/channels/ot/hoi-dap')

            await userEvent.click(
                await screen.findByRole('button', { name: 'View task Ôn chương 4' }, { timeout: 5000 })
            )

            await waitFor(() => expect(router.state.location.search).toBe('?task=t1'))
            expect(router.state.location.pathname).toBe('/channels/ot/hoi-dap')
            expect(router.state.historyAction).toBe('REPLACE')
        })
    })

    describe("a voice room's chat (S-ROOM-08)", () => {
        const QUIET_READ = (unreadCount: number, mentionCount: number) => ({
            serverId: 'ot',
            channelId: 'quiet',
            lastReadId: '0190a000-0000-7000-8000-000000000010',
            unreadCount,
            mentionCount
        })
        afterEach(() => {
            messagesApi.fetchMessages.mockImplementation(async (..._: unknown[]) => ({
                items: [],
                hasMoreBefore: false,
                hasMoreAfter: false
            }))
        })

        it('opens from [💬] at the end of the Header, closed at first, named with the room and no "#"', async () => {
            renderAt('/channels/ot/quiet')
            await screen.findByRole('heading', { level: 1, name: 'Phòng học im lặng' })
            const button = await screen.findByRole('button', { name: 'Room chat' })
            expect(button).toHaveAttribute('aria-pressed', 'false')
            expect(screen.queryByRole('complementary', { name: 'Room chat' })).not.toBeInTheDocument()

            await userEvent.click(button)

            const chat = await screen.findByRole('complementary', { name: 'Room chat' })
            expect(
                await within(chat).findByRole('log', { name: 'Messages in Phòng học im lặng' }, { timeout: 5000 })
            ).toBeInTheDocument()
            expect(
                await within(chat).findByRole('heading', { name: 'Welcome to Phòng học im lặng' })
            ).toBeInTheDocument()
            expect(within(chat).getByLabelText('Message Phòng học im lặng')).toBeInTheDocument()
            expect(button).toHaveAttribute('aria-pressed', 'true')
            expect(messagesApi.fetchMessages).toHaveBeenCalledWith('quiet', null)
            // Read and sent without being in the room (P10): the preview page stays beside it.
            expect(screen.getByRole('button', { name: 'Join room' })).toBeInTheDocument()
            await expectNoA11yViolations()

            await userEvent.click(button)
            expect(screen.queryByRole('complementary', { name: 'Room chat' })).not.toBeInTheDocument()
        })

        it('has the mentions unread as a Badge on [💬] while closed, a dot for plain messages (C-07)', async () => {
            readStatesApi.fetchReadStates.mockResolvedValue([QUIET_READ(3, 2)])
            renderAt('/channels/ot/quiet')
            const button = await screen.findByRole('button', { name: 'Room chat, 2 unread mentions of you' })
            expect(within(button).getByText('2')).toBeInTheDocument()

            await userEvent.click(button)
            expect(await screen.findByRole('button', { name: 'Room chat' })).toHaveAttribute('aria-pressed', 'true')
            expect(within(screen.getByRole('button', { name: 'Room chat' })).queryByText('2')).not.toBeInTheDocument()

            cleanup()
            readStatesApi.fetchReadStates.mockResolvedValue([QUIET_READ(3, 0)])
            renderAt('/channels/ot/quiet')
            const plain = await screen.findByRole('button', { name: 'Room chat, unread messages' })
            expect(within(plain).getByTestId('room-chat-dot')).toBeInTheDocument()
        })

        it('does nothing with a file dropped on the room page, the chat closed: the browser never opens it (L6b-a)', async () => {
            renderAt('/channels/ot/quiet')
            await screen.findByRole('button', { name: 'Room chat' })
            const heading = screen.getByRole('heading', { level: 1, name: 'Phòng học im lặng' })
            const files = { types: ['Files'], files: [], dropEffect: 'copy' }
            const over = createEvent.dragOver(heading, { dataTransfer: files })
            fireEvent(heading, over)
            expect(over.defaultPrevented).toBe(true)
            expect((over as DragEvent).dataTransfer!.dropEffect).toBe('none')
            const drop = createEvent.drop(heading, { dataTransfer: files })
            fireEvent(heading, drop)
            expect(drop.defaultPrevented).toBe(true)
            // Text dragged from the page is not a file: left to the browser.
            const text = createEvent.dragOver(heading, { dataTransfer: { types: ['text/plain'] } })
            fireEvent(heading, text)
            expect(text.defaultPrevented).toBe(false)
        })

        it('offers no Pin on a message there, even with MANAGE_MESSAGES (D-213)', async () => {
            const moderator = String(BigInt(MEMBER) | (1n << 14n))
            serversApi.fetchServers.mockResolvedValue([
                {
                    ...OT,
                    channels: OT.channels.map((one) => (one.id === 'quiet' ? { ...one, permissions: moderator } : one))
                },
                ND
            ])
            messagesApi.fetchMessages.mockImplementation(async (..._: unknown[]) => ({
                items: [
                    {
                        id: '0190a0b0-0000-7000-8000-000000000001',
                        channelId: 'quiet',
                        type: 'regular',
                        author: { id: 'tuan', username: 'tuan.le', displayName: 'Tuấn', avatarUrl: null },
                        content: 'Mình vào phòng lúc 21:00',
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
                        pinned: false,
                        reactions: [],
                        createdAt: '2026-10-16T13:30:00.000Z'
                    }
                ] as never[],
                hasMoreBefore: false,
                hasMoreAfter: false
            }))
            renderAt('/channels/ot/quiet')
            await userEvent.click(await screen.findByRole('button', { name: 'Room chat' }))

            const message = (await screen.findByText('Mình vào phòng lúc 21:00', {}, { timeout: 5000 })).closest(
                'article'
            ) as HTMLElement
            await userEvent.click(within(message).getByRole('button', { name: 'More' }))
            const menu = await screen.findByRole('menu')
            expect(within(menu).getByRole('menuitem', { name: 'Delete message' })).toBeInTheDocument()
            expect(within(menu).queryByRole('menuitem', { name: 'Pin' })).not.toBeInTheDocument()
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

        it('opens the Task Board only on a channel with it on, one panel at a time (S-TASK-01, C-08)', async () => {
            serversApi.fetchServers.mockResolvedValue([
                {
                    ...OT,
                    channels: OT.channels.map((item) =>
                        item.id === 'hoi-dap' ? { ...item, taskBoardEnabled: true } : item
                    )
                }
            ])
            const router = renderAt('/channels/ot/hoi-dap')
            const board = await screen.findByRole('button', { name: 'Task Board' })
            // Closed at first, as the pins.
            expect(board).toHaveAttribute('aria-pressed', 'false')
            await userEvent.click(board)
            // Its chunk loads the first time (lazy), the panel drawn by it then.
            await waitFor(() =>
                expect(
                    within(screen.getByRole('complementary', { name: 'Task Board' })).getByRole('heading', {
                        name: 'No tasks yet'
                    })
                ).toBeInTheDocument()
            )
            expect(tasksApi.fetchOpenTasks).toHaveBeenCalledWith('hoi-dap', '')

            await userEvent.click(screen.getByRole('button', { name: 'Pinned messages' }))
            expect(await screen.findByRole('complementary', { name: 'Pinned messages' })).toBeInTheDocument()
            expect(screen.queryByRole('complementary', { name: 'Task Board' })).not.toBeInTheDocument()
            expect(board).toHaveAttribute('aria-pressed', 'false')
            await userEvent.click(board)
            expect(await screen.findByRole('complementary', { name: 'Task Board' })).toBeInTheDocument()
            expect(screen.queryByRole('complementary', { name: 'Pinned messages' })).not.toBeInTheDocument()

            // Another channel, its board off: no button.
            await act(() => router.navigate('/channels/ot/chao-mung'))
            await waitFor(() => expect(screen.queryByRole('button', { name: 'Task Board' })).not.toBeInTheDocument())
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

        it('asks the Host of the session of the room one is in before signing out (10 logout-host-confirm, D-77)', async () => {
            const { roomSessionOf } = await import('@/features/study')
            const focusSession = roomSessionOf(studySession({ channelId: 'quiet', hostId: authState.user.id }))
            const hosted: Server = {
                ...OT,
                channels: OT.channels.map((one) => (one.id === 'quiet' ? { ...one, focusSession } : one))
            }
            serversApi.fetchServers.mockResolvedValue([hosted, ND])
            useVoiceStore.setState({
                call: { serverId: 'ot', channelId: 'quiet', name: 'Phòng học im lặng', phase: 'connected' }
            })
            try {
                renderAt('/study')
                await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Sign out' }))
                const asked = await screen.findByRole(
                    'dialog',
                    { name: 'Sign out and leave the room?' },
                    { timeout: 5000 }
                )
                expect(authState.logout).not.toHaveBeenCalled()
                await userEvent.click(within(asked).getByRole('button', { name: 'Sign out' }))
                expect(authState.logout).toHaveBeenCalledTimes(1)
            } finally {
                useVoiceStore.setState({ call: null })
            }
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
