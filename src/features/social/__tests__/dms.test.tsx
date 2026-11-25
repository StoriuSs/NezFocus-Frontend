import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import i18n from '@/i18n'
import { ShellContext } from '@/components/shell/shell-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { connectProfilePopover, userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import type { SeenRoom } from '../lib/room-lookup'
import type { Dm, DmLastMessage, PersonProfile, Relationship } from '../types'

const socialApi = {
    fetchRelationships: vi.fn<() => Promise<Relationship[]>>(),
    lookUpPerson: vi.fn(),
    sendFriendRequest: vi.fn(),
    acceptFriendRequest: vi.fn(),
    removeRelationship: vi.fn(),
    blockPerson: vi.fn<(userId: string) => Promise<Relationship>>(),
    unblockPerson: vi.fn<(userId: string) => Promise<Relationship>>(),
    fetchPersonProfile: vi.fn<(userId: string) => Promise<PersonProfile>>(),
    requestFriend: vi.fn<(userId: string) => Promise<Relationship>>()
}
vi.mock('../api/social.api', () => socialApi)
const dmsApi = {
    fetchDms: vi.fn<() => Promise<Dm[]>>(),
    openDm: vi.fn<(userId: string, key: string) => Promise<Dm>>(),
    closeDm: vi.fn<(dmId: string) => Promise<void>>()
}
vi.mock('../api/dms.api', () => dmsApi)
const messagesApi = {
    fetchMessages: vi.fn(async (..._: unknown[]) => ({
        items: [] as unknown[],
        hasMoreBefore: false,
        hasMoreAfter: false
    })),
    sendMessage: vi.fn()
}
vi.mock('@/features/messaging/api/messages.api', () => messagesApi)
const readStatesApi = {
    fetchReadStates: vi.fn(async (): Promise<unknown[]> => []),
    ackChannel: vi.fn(async (channelId: string) => ({
        serverId: null,
        channelId,
        lastReadId: id(9),
        unreadCount: 0,
        mentionCount: 0
    }))
}
vi.mock('@/features/messaging/api/readStates.api', () => readStatesApi)

const { default: DirectMessage } = await import('../pages/DirectMessage')
const { default: Friends } = await import('../pages/Friends')
const { DmList } = await import('../components/DmList')
const { useDms } = await import('../api/useDms')
const { connectChatLinks } = await import('../lib/chat-links')
const { connectRoomLookup } = await import('../lib/room-lookup')
const { messagesPlace, rememberMessagesPlace } = await import('../lib/messages-place')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')

connectChatLinks(() => ({
    readLink: () => null,
    channel: () => ({ kind: 'hidden' }),
    server: (serverId: string, name: string) => ({
        name,
        iconUrl: null,
        initials: name.slice(0, 2).toUpperCase(),
        path: `/channels/${serverId}`
    })
}))

// Where people are, as the servers feature would answer (D-252): set by a test, nobody by default.
const rooms = new Map<string, SeenRoom>()
connectRoomLookup(() => ({ roomOf: (userId) => rooms.get(userId) ?? null }))

// UUIDv7-like ids: newer is greater as text.
function id(n: number) {
    return `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`
}
const person = (userId: string, displayName: string | null, username: string | null = `${userId}.tran`) => ({
    id: userId,
    username,
    displayName,
    avatarUrl: null
})
const last = (n: number, at: string, more: Partial<DmLastMessage> = {}): DmLastMessage => ({
    id: id(n),
    type: 'regular',
    systemEvent: null,
    systemData: null,
    authorId: 'binh',
    content: 'Ok 👍',
    mentionUsers: [],
    files: { count: 0, images: 0 },
    createdAt: at,
    ...more
})
const dm = (
    channelId: string,
    user: ReturnType<typeof person>,
    lastMessage: DmLastMessage | null,
    more: Partial<Dm> = {}
): Dm => ({
    id: channelId,
    user,
    presence: 'online',
    activity: null,
    lastMessage,
    canMessage: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...more
})
const readState = (channelId: string, unreadCount: number) => ({
    serverId: null,
    channelId,
    lastReadId: id(1),
    unreadCount,
    mentionCount: 0
})
const friend = (user: ReturnType<typeof person>): Relationship => ({
    type: 'friend',
    since: '2026-10-01T00:00:00.000Z',
    presence: 'online',
    activity: null,
    note: null,
    user
})

const BINH = person('binh', 'Bình')
const TUAN = person('tuan', 'Tuấn', 'tuan.hoang')
const CHI = person('chi', 'Chi')
const KHANH = person('khanh', 'Khánh', 'khanh.le')
// 09 › Dữ liệu mẫu: Tuấn's message is the newest and unread; Bình, then Chi.
const DMS = [
    dm('dm-chi', CHI, last(3, '2026-10-18T13:31:00.000Z', { authorId: 'an', content: 'Đi, 8h nhé' })),
    dm('dm-binh', BINH, last(4, '2026-10-18T14:09:00.000Z', { authorId: 'an' })),
    dm(
        'dm-tuan',
        TUAN,
        last(5, '2026-10-18T14:46:00.000Z', {
            authorId: 'tuan',
            content: 'An ơi rảnh không, gọi mình hỏi câu 4 chút được không?'
        }),
        {
            presence: null
        }
    )
]

function Shell() {
    // As the AppShell: the DM list read once and kept live.
    useDms()
    return (
        <>
            <nav aria-label='Tin nhắn'>
                <DmList />
            </nav>
            <Outlet />
        </>
    )
}

function renderAt(at: string, connection: 'offline' | null = null) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    client.setQueryData(userKeys.profile(), person('an', 'An', 'an.nguyen'))
    client.setQueryData(userKeys.settings(), { timezone: 'Asia/Ho_Chi_Minh' })
    const router = createMemoryRouter(
        [
            {
                element: <Shell />,
                children: [
                    { path: '/friends', element: <Friends /> },
                    { path: '/dm/:dmId', element: <DirectMessage /> },
                    { path: '/dm/:dmId/:messageId', element: <DirectMessage /> },
                    { path: '/study', element: <h1>Học</h1> }
                ]
            }
        ],
        { initialEntries: [at] }
    )
    render(
        <QueryClientProvider client={client}>
            <ShellContext.Provider value={{ navOpen: false, toggleNav: () => undefined, connection }}>
                <TooltipProvider>
                    <RouterProvider router={router} />
                    <Toaster />
                </TooltipProvider>
            </ShellContext.Provider>
        </QueryClientProvider>
    )
    return { client, router }
}

const column = () => screen.getByRole('navigation', { name: 'Tin nhắn' })
/** What an activity line draws (screen readers read its whole sentence instead, `sr-only`). */
const drawn = (element: HTMLElement) =>
    [...element.querySelectorAll('[aria-hidden="true"]')].map((part) => part.textContent).join('')
const rowNames = () =>
    within(column())
        .getAllByRole('listitem')
        .map((row) => row.querySelector('a .text-body-sm')?.textContent)

beforeEach(async () => {
    await i18n.changeLanguage('vi')
    for (const fn of [...Object.values(socialApi), ...Object.values(dmsApi)]) fn.mockReset()
    socialApi.fetchRelationships.mockResolvedValue([friend(BINH), friend(CHI)])
    dmsApi.fetchDms.mockResolvedValue(DMS)
    dmsApi.closeDm.mockResolvedValue(undefined)
    readStatesApi.fetchReadStates.mockResolvedValue([
        readState('dm-tuan', 1),
        readState('dm-binh', 0),
        readState('dm-chi', 0)
    ])
    readStatesApi.ackChannel.mockClear()
    messagesApi.fetchMessages.mockClear()
})
afterEach(() => {
    act(() => void toast.dismiss())
})

describe('Cột Tin nhắn (S-DM-01)', () => {
    it('lists the DMs latest first, the unread one in bold with its count, "Bạn: …" for my last message', async () => {
        renderAt('/study')

        const tuan = await within(column()).findByRole('link', { name: 'Tuấn, 1 tin nhắn chưa đọc' })
        expect(rowNames()).toEqual(['Tuấn', 'Bình', 'Chi'])
        expect(within(tuan).getByText('Tuấn')).toHaveClass('font-semibold', 'text-text-primary')
        expect(within(tuan).getByText('1')).toBeInTheDocument()
        const chi = within(column()).getByRole('link', { name: /Chi/ })
        expect(within(chi).getByText('Chi')).toHaveClass('font-medium', 'text-text-secondary')
        expect(within(chi).getByText('Bạn: Đi, 8h nhé')).toBeInTheDocument()
        await expectNoA11yViolations()
    })

    it('says how a call went on its row: missed, or "Cuộc gọi · 12 phút" (C-30, D-250)', async () => {
        const call = (n: number, status: string, durationSeconds: number | null) =>
            last(n, `2026-10-18T1${n}:00:00.000Z`, {
                type: 'system',
                authorId: null,
                systemEvent: 'call_ended',
                systemData: { userId: 'binh', callId: `c${n}`, status, endReason: null, video: false, durationSeconds }
            })
        dmsApi.fetchDms.mockResolvedValue([
            dm('dm-binh', BINH, call(4, 'missed', null)),
            dm('dm-chi', CHI, call(3, 'ended', 12 * 60 + 5))
        ])
        renderAt('/study')

        const binh = await within(column()).findByRole('link', { name: /Bình/ })
        expect(within(binh).getByText('Cuộc gọi nhỡ')).toBeInTheDocument()
        expect(
            within(within(column()).getByRole('link', { name: /Chi/ })).getByText('Cuộc gọi · 12 phút')
        ).toBeInTheDocument()
    })

    it('says "No messages yet" with where to start one when there is none, a DM with no message hidden', async () => {
        dmsApi.fetchDms.mockResolvedValue([dm('dm-phong', person('phong', 'Phong'), null)])
        renderAt('/study')

        expect(await within(column()).findByText('Chưa có tin nhắn nào')).toBeInTheDocument()
        expect(
            within(column()).getByText('Nhắn tin từ trang Bạn bè hoặc hồ sơ của thành viên cùng server.')
        ).toBeInTheDocument()
    })

    it('closes the open DM with its ×, no question: the row goes, the page goes to Friends (SOCIAL-04)', async () => {
        const { router } = renderAt('/dm/dm-binh')
        const binh = await within(column()).findByRole('link', { name: /Bình/ })

        await userEvent.click(
            within(binh.closest('li')!).getByRole('button', { name: 'Đóng tin nhắn với Bình', hidden: true })
        )

        expect(dmsApi.closeDm).toHaveBeenCalledWith('dm-binh', expect.anything())
        await waitFor(() => expect(rowNames()).toEqual(['Tuấn', 'Chi']))
        expect(router.state.location.pathname).toBe('/friends')
    })

    it('opens the row menu with a right click: mark as read (unread only), close, block', async () => {
        renderAt('/study')
        const tuan = await within(column()).findByRole('link', { name: 'Tuấn, 1 tin nhắn chưa đọc' })

        await userEvent.pointer({ keys: '[MouseRight]', target: tuan })
        const menu = await screen.findByRole('menu')
        expect(
            within(menu)
                .getAllByRole('menuitem')
                .map((item) => item.textContent)
        ).toEqual(['Đánh dấu đã đọc', 'Đóng tin nhắn', 'Chặn'])
        await userEvent.click(within(menu).getByRole('menuitem', { name: 'Đánh dấu đã đọc' }))

        expect(readStatesApi.ackChannel).toHaveBeenCalledWith('dm-tuan', null)
        await waitFor(() =>
            expect(within(column()).queryByRole('link', { name: 'Tuấn, 1 tin nhắn chưa đọc' })).toBeNull()
        )
    })

    it('puts the row and its unread count back when closing fails', async () => {
        dmsApi.closeDm.mockRejectedValue(apiError(500, 'INTERNAL_SERVER_ERROR'))
        renderAt('/study')
        const tuan = await within(column()).findByRole('link', { name: 'Tuấn, 1 tin nhắn chưa đọc' })
        const reads = readStatesApi.fetchReadStates.mock.calls.length

        await userEvent.click(
            within(tuan.closest('li')!).getByRole('button', { name: 'Đóng tin nhắn với Tuấn', hidden: true })
        )

        expect(await within(column()).findByRole('link', { name: 'Tuấn, 1 tin nhắn chưa đọc' })).toBeInTheDocument()
        expect(readStatesApi.fetchReadStates.mock.calls.length).toBeGreaterThan(reads)
    })

    it('closes a DM with Delete, and moves between rows with the arrow keys', async () => {
        renderAt('/study')
        const tuan = await within(column()).findByRole('link', { name: 'Tuấn, 1 tin nhắn chưa đọc' })
        tuan.focus()

        await userEvent.keyboard('{ArrowDown}')
        expect(within(column()).getByRole('link', { name: /Bình/ })).toHaveFocus()
        await userEvent.keyboard('{Delete}')

        expect(dmsApi.closeDm).toHaveBeenCalledWith('dm-binh', expect.anything())
        await waitFor(() => expect(rowNames()).toEqual(['Tuấn', 'Chi']))
        // The focus goes on to the next row, not to the page.
        expect(within(column()).getByRole('link', { name: /Chi/ })).toHaveFocus()
    })

    it('puts a DM first on a new message, and reads the list again when a DM comes back by a message (D-244)', async () => {
        renderAt('/study')
        await within(column()).findByRole('link', { name: /Tuấn/ })

        act(() =>
            emitRealtimeEvent('message.created', {
                message: {
                    id: id(8),
                    channelId: 'dm-chi',
                    type: 'regular',
                    systemEvent: null,
                    author: { id: 'chi' },
                    content: 'Ok luôn',
                    mentionUsers: [],
                    mentionRoles: [],
                    attachments: [],
                    createdAt: '2026-10-18T14:50:00.000Z'
                }
            })
        )
        await waitFor(() => expect(rowNames()).toEqual(['Chi', 'Tuấn', 'Bình']))
        expect(within(column()).getByText('Ok luôn')).toBeInTheDocument()

        // Minh's DM, closed before: its message reads the read states again, which hold it now.
        dmsApi.fetchDms.mockResolvedValue([
            ...DMS,
            dm(
                'dm-minh',
                person('minh', 'Minh'),
                last(9, '2026-10-18T14:55:00.000Z', { authorId: 'minh', content: 'Cảm ơn nha' })
            )
        ])
        readStatesApi.fetchReadStates.mockResolvedValue([readState('dm-tuan', 1), readState('dm-minh', 1)])
        act(() =>
            emitRealtimeEvent('message.created', {
                message: {
                    id: id(9),
                    channelId: 'dm-minh',
                    type: 'regular',
                    systemEvent: null,
                    author: { id: 'minh' },
                    content: 'Cảm ơn nha',
                    mentionUsers: [],
                    mentionRoles: [],
                    mentionEveryone: false,
                    mentionHereUserIds: [],
                    attachments: [],
                    replyTo: null,
                    createdAt: '2026-10-18T14:55:00.000Z'
                }
            })
        )
        await waitFor(() => expect(rowNames()[0]).toBe('Minh'), { timeout: 3000 })
    })
})

describe('Trang DM (S-DM-03)', () => {
    it('shows the person in the Header with their username and dot, the beginning, and "Nhắn Bình"', async () => {
        renderAt('/dm/dm-binh')

        expect(await screen.findByRole('heading', { level: 1, name: 'Bình' })).toBeInTheDocument()
        const header = screen.getByRole('heading', { level: 1 }).closest('header')!
        expect(within(header).getByText('binh.tran')).toBeInTheDocument()
        expect(header.querySelector('[data-presence]') ?? header.querySelector('svg circle')).not.toBeNull()
        // The chat is a chunk of its own, loaded the first time.
        expect(await screen.findByRole('heading', { level: 2, name: 'Bình' }, { timeout: 5000 })).toBeInTheDocument()
        expect(screen.getByText('Đây là khởi đầu cuộc trò chuyện của bạn và Bình.')).toBeInTheDocument()
        expect(await screen.findByPlaceholderText('Nhắn Bình')).toBeInTheDocument()
        expect(messagesApi.fetchMessages).toHaveBeenCalledWith('dm-binh', null)
        await expectNoA11yViolations()
    })

    it('locks the composer where I may not message them, with no dot in the Header (cannot-message, 09 Q10)', async () => {
        dmsApi.fetchDms.mockResolvedValue([
            dm('dm-phong', person('phong', 'Phong', 'phong.vu'), null, { canMessage: false })
        ])
        renderAt('/dm/dm-phong')

        expect(await screen.findByRole('status')).toHaveTextContent('Không thể gửi tin nhắn cho người dùng này')
        const header = screen.getByRole('heading', { level: 1, name: 'Phong' }).closest('header')!
        // The Header's own buttons draw circles too: the dot is the one with a presence.
        expect(header.querySelector('[data-presence]')).toBeNull()
        expect(screen.queryByPlaceholderText('Nhắn Phong')).toBeNull()
    })

    it('says "Không gửi được" with no "Thử lại" when I may no longer write to them, then locks the composer (lost-permission, D-250)', async () => {
        messagesApi.sendMessage.mockRejectedValue(apiError(403, 'CANNOT_MESSAGE_USER'))
        renderAt('/dm/dm-binh')
        const composer = await screen.findByPlaceholderText('Nhắn Bình', {}, { timeout: 5000 })
        // Where the DM stands, read again: no longer to be written to.
        dmsApi.fetchDms.mockResolvedValue(
            DMS.map((one) => (one.id === 'dm-binh' ? { ...one, canMessage: false } : one))
        )

        await userEvent.type(composer, 'Chào{Enter}')

        expect(await screen.findByRole('alert')).toHaveTextContent('Không gửi được')
        expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Bỏ' })).toBeInTheDocument()
        expect(await screen.findByRole('status')).toHaveTextContent('Không thể gửi tin nhắn cho người dùng này')
        expect(screen.queryByPlaceholderText('Nhắn Bình')).toBeNull()
    })

    it('says "Tài khoản đã bị xóa" for a deleted account, with its own locked line (deleted-account)', async () => {
        dmsApi.fetchDms.mockResolvedValue([
            dm('dm-gone', person('gone', null, null), last(2, '2026-10-02T13:15:00.000Z'), {
                canMessage: false,
                presence: null
            })
        ])
        renderAt('/dm/dm-gone')

        expect(await screen.findByRole('heading', { level: 1, name: 'Tài khoản đã bị xóa' })).toBeInTheDocument()
        expect(await screen.findByText('Đây là khởi đầu cuộc trò chuyện của bạn và tài khoản này.')).toBeInTheDocument()
        expect(await screen.findByRole('status')).toHaveTextContent('Không thể gửi tin nhắn cho tài khoản đã bị xóa')
    })

    it("hides the messages of someone I blocked, Unblock in the composer's place brings the composer back (blocked-by-me)", async () => {
        const blocked: Relationship = { ...friend(KHANH), type: 'blocked', presence: null }
        socialApi.fetchRelationships.mockResolvedValue([blocked])
        socialApi.unblockPerson.mockResolvedValue({ ...blocked, type: 'none', since: null })
        dmsApi.fetchDms.mockResolvedValue([
            dm('dm-khanh', KHANH, last(7, '2026-10-18T13:07:00.000Z', { authorId: 'khanh' }), { canMessage: false })
        ])
        messagesApi.fetchMessages.mockResolvedValue({
            items: [
                {
                    attachments: [],
                    id: id(7),
                    channelId: 'dm-khanh',
                    type: 'regular',
                    author: KHANH,
                    content: 'Đề giữa kỳ có đáp án nè, 50k',
                    mentionUsers: [],
                    mentionRoles: [],
                    mentionEveryone: false,
                    mentionHereUserIds: [],
                    systemEvent: null,
                    systemData: null,
                    systemUser: null,
                    systemUsers: [],
                    pinned: false,
                    reactions: [],
                    replyTo: null,
                    editedAt: null,
                    createdAt: '2026-10-18T13:07:00.000Z'
                }
            ],
            hasMoreBefore: false,
            hasMoreAfter: false
        })
        renderAt('/dm/dm-khanh')

        expect(await screen.findByText('Bạn đã chặn Khánh')).toBeInTheDocument()
        expect(await screen.findByText('Đây là khởi đầu cuộc trò chuyện của bạn và Khánh.')).toBeInTheDocument()
        expect(screen.queryByText('Đề giữa kỳ có đáp án nè, 50k')).toBeNull()
        await expectNoA11yViolations()

        await userEvent.click(screen.getByRole('button', { name: 'Bỏ chặn' }))

        expect(socialApi.unblockPerson).toHaveBeenCalledWith('khanh')
        expect(await screen.findByText('Đề giữa kỳ có đáp án nè, 50k')).toBeInTheDocument()
        expect(screen.queryByText('Bạn đã chặn Khánh')).toBeNull()
    })

    it('goes to the Friends page when the DM open here is closed in another tab, 💬 no longer coming back to it', async () => {
        rememberMessagesPlace('an', '/dm/dm-binh')
        const { router } = renderAt('/dm/dm-binh')
        expect(await screen.findByRole('heading', { level: 1, name: 'Bình' })).toBeInTheDocument()

        act(() => emitRealtimeEvent('dm.updated', { dm: DMS[1], shown: false }))

        await waitFor(() => expect(router.state.location.pathname).toBe('/friends'))
        expect(messagesPlace('an')).not.toBe('/dm/dm-binh')
    })

    it('reads the list again when it could not be read as the app opened, rather than loading for ever', async () => {
        dmsApi.fetchDms.mockRejectedValueOnce(apiError(500, 'INTERNAL_SERVER_ERROR'))
        renderAt('/dm/dm-binh')

        expect(await screen.findByRole('heading', { level: 1, name: 'Bình' })).toBeInTheDocument()
        expect(dmsApi.fetchDms).toHaveBeenCalledTimes(2)
    })

    it('reads the list again for a DM it does not hold, then says the page is not found (D-249 L7-d)', async () => {
        const { router } = renderAt('/study')
        await within(column()).findByRole('link', { name: /Bình/ })
        act(() => void router.navigate('/dm/dm-closed'))

        expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang này' })).toBeInTheDocument()
        expect(dmsApi.fetchDms).toHaveBeenCalledTimes(2)
    })
})

describe('"Nhắn tin" (09 S-DM-02 › Đi tới)', () => {
    it("opens the DM held from a friend's 💬 at once, and opens one first for a friend with none", async () => {
        const { router } = renderAt('/friends?tab=all')

        await userEvent.click(await screen.findByRole('button', { name: 'Nhắn tin: Bình' }))
        expect(router.state.location.pathname).toBe('/dm/dm-binh')
        expect(dmsApi.openDm).not.toHaveBeenCalled()

        const lan = person('lan', 'Lan')
        socialApi.fetchRelationships.mockResolvedValue([friend(BINH), friend(lan)])
        dmsApi.openDm.mockResolvedValue(dm('dm-lan', lan, null))
        act(() => void router.navigate('/friends?tab=all'))
        act(() => emitRealtimeEvent('ready', {}))
        await userEvent.click(await screen.findByRole('button', { name: 'Nhắn tin: Lan' }))

        expect(dmsApi.openDm).toHaveBeenCalledWith('lan', expect.any(String))
        await waitFor(() => expect(router.state.location.pathname).toBe('/dm/dm-lan'))
        // The DM with no message yet shows in the column while open (Q5).
        expect(await within(column()).findByRole('link', { name: /Lan/ })).toHaveAttribute('aria-current', 'page')
    })

    it("opens the DM from the friend's whole row too", async () => {
        const { router } = renderAt('/friends?tab=all')
        const name = await screen.findByText('Chi', { selector: 'span.truncate.font-semibold' })

        // The row's stretched button lies over the name (a browser's click lands on it; jsdom has no layout).
        await userEvent.click(name.closest('li')!.querySelector<HTMLElement>('button[tabindex="-1"]')!)

        expect(router.state.location.pathname).toBe('/dm/dm-chi')
    })

    it('says the one line of CANNOT_MESSAGE_USER when no DM can be opened (D-23)', async () => {
        const lan = person('lan', 'Lan')
        socialApi.fetchRelationships.mockResolvedValue([friend(lan)])
        dmsApi.openDm.mockRejectedValue(apiError(403, 'CANNOT_MESSAGE_USER'))
        const { router } = renderAt('/friends?tab=all')

        await userEvent.click(await screen.findByRole('button', { name: 'Nhắn tin: Lan' }))

        expect(await screen.findByText('Không thể gửi tin nhắn cho người dùng này')).toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/friends')
    })
})

describe('Panel Hồ sơ và dải not-friend (C-50, S-DM-03, D-251)', () => {
    const related = (type: Relationship['type'], user: ReturnType<typeof person>): Relationship => ({
        ...friend(user),
        type,
        presence: null
    })
    const profileOf = (user: ReturnType<typeof person>, more: Partial<PersonProfile> = {}): PersonProfile => ({
        user,
        bio: 'Lớp K22 · đang ôn Giải tích 2 mỗi tối',
        presence: 'online',
        activity: null,
        relationship: 'friend',
        mutualServers: [
            { id: 'ot', name: 'Ôn thi Giải tích 2' },
            { id: 'nd', name: 'Nhóm đồ án Mobile' }
        ],
        ...more
    })
    /** A window at least 1280 wide: the right panel is a column beside the chat. */
    const wide = (matches: boolean) =>
        vi
            .mocked(window.matchMedia)
            .mockImplementation(
                (query: string) =>
                    ({ matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as never
            )
    const panel = () => screen.getByRole('complementary', { name: 'Hồ sơ' })

    beforeEach(() => {
        localStorage.clear()
        socialApi.fetchPersonProfile.mockImplementation(async (userId) =>
            profileOf(userId === 'tuan' ? TUAN : BINH, userId === 'tuan' ? { relationship: 'none' } : {})
        )
    })
    afterEach(() => wide(false))

    it('opens at first as a column: the person, the bio, "Bạn bè", the servers we share; the pins take its place while open', async () => {
        wide(true)
        renderAt('/dm/dm-binh')

        const profile = await screen.findByRole('complementary', { name: 'Hồ sơ' })
        expect(within(profile).getByRole('heading', { name: 'Bình' })).toBeInTheDocument()
        expect(within(profile).getByText('binh.tran')).toBeInTheDocument()
        expect(await within(profile).findByText('Lớp K22 · đang ôn Giải tích 2 mỗi tối')).toBeInTheDocument()
        expect(within(profile).getByText('Bạn bè')).toBeInTheDocument()
        expect(within(profile).getByRole('heading', { name: 'Server chung — 2' })).toBeInTheDocument()
        expect(within(profile).getByRole('link', { name: 'Ôn thi Giải tích 2' })).toHaveAttribute(
            'href',
            '/channels/ot'
        )
        expect(within(profile).getByRole('link', { name: 'Nhóm đồ án Mobile' })).toHaveAttribute('href', '/channels/nd')
        expect(socialApi.fetchPersonProfile).toHaveBeenCalledWith('binh')
        expect(screen.getByRole('button', { name: 'Hồ sơ' })).toHaveAttribute('aria-pressed', 'true')
        // Friends: no strip.
        expect(screen.queryByText(/chưa là bạn bè/)).toBeNull()
        await expectNoA11yViolations()

        await userEvent.click(screen.getByRole('button', { name: 'Tin đã ghim' }))
        expect(screen.queryByRole('complementary', { name: 'Hồ sơ' })).toBeNull()
        expect(screen.getByRole('complementary', { name: 'Tin đã ghim' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Hồ sơ' })).toHaveAttribute('aria-pressed', 'false')

        await userEvent.click(screen.getByRole('button', { name: 'Tin đã ghim' }))
        expect(await screen.findByRole('complementary', { name: 'Hồ sơ' })).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Hồ sơ' }))
        expect(screen.queryByRole('complementary', { name: 'Hồ sơ' })).toBeNull()
    })

    it('says "Chưa ở chung server nào" with no servers in common, and tries again after a failed read', async () => {
        socialApi.fetchPersonProfile.mockRejectedValueOnce(apiError(500, 'INTERNAL_SERVER_ERROR'))
        socialApi.fetchPersonProfile.mockResolvedValueOnce(profileOf(BINH, { mutualServers: [], bio: null }))
        renderAt('/dm/dm-binh')
        await userEvent.click(await screen.findByRole('button', { name: 'Hồ sơ' }))

        expect(await within(panel()).findByText('Không tải được hồ sơ')).toBeInTheDocument()
        await userEvent.click(within(panel()).getByRole('button', { name: 'Thử lại' }))

        expect(await within(panel()).findByText('Chưa ở chung server nào')).toBeInTheDocument()
        expect(within(panel()).getByRole('heading', { name: 'Server chung' })).toBeInTheDocument()
    })

    it('⋯ copies the username, asks before unfriending; the Tag follows the relationship as it changes', async () => {
        const writeText = vi.fn(async () => undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        socialApi.removeRelationship.mockResolvedValue(related('none', BINH))
        renderAt('/dm/dm-binh')
        await userEvent.click(await screen.findByRole('button', { name: 'Hồ sơ' }))

        await userEvent.click(within(panel()).getByRole('button', { name: 'Thêm: Bình' }))
        const items = screen.getAllByRole('menuitem').map((item) => item.textContent)
        expect(items).toEqual(['Sao chép username', 'Hủy kết bạn', 'Chặn'])
        await userEvent.click(screen.getByRole('menuitem', { name: 'Sao chép username' }))
        expect(writeText).toHaveBeenCalledWith('binh.tran')
        expect(await screen.findByText('Đã sao chép username')).toBeInTheDocument()

        await userEvent.click(within(panel()).getByRole('button', { name: 'Thêm: Bình' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'Hủy kết bạn' }))
        const dialog = await screen.findByRole('dialog', { name: 'Hủy kết bạn với Bình?' })
        await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy kết bạn' }))

        expect(socialApi.removeRelationship).toHaveBeenCalledWith('binh')
        expect(await within(panel()).findByRole('button', { name: 'Kết bạn' })).toBeInTheDocument()
        // Not friends now, and I may still message them: the strip.
        expect(screen.getByText('Bạn và Bình chưa là bạn bè')).toBeInTheDocument()
    })

    it('shows only the avatar and "Tài khoản đã bị xóa" for a deleted account, reading no profile', async () => {
        const gone = person('gone', null, null)
        dmsApi.fetchDms.mockResolvedValue([...DMS, dm('dm-gone', gone, last(2, '2026-10-02T13:15:00.000Z'))])
        renderAt('/dm/dm-gone')
        await userEvent.click(await screen.findByRole('button', { name: 'Hồ sơ' }))

        expect(within(panel()).getByRole('heading', { name: 'Tài khoản đã bị xóa' })).toBeInTheDocument()
        expect(within(panel()).queryByRole('button', { name: /Kết bạn|Thêm/ })).toBeNull()
        expect(within(panel()).queryByText(/Server chung/)).toBeNull()
        expect(socialApi.fetchPersonProfile).not.toHaveBeenCalled()
    })

    it('"Kết bạn" on the strip sends a request from the profile; the strip says it was sent, "Hủy lời mời" takes it back', async () => {
        socialApi.requestFriend.mockResolvedValue(related('outgoing', TUAN))
        socialApi.removeRelationship.mockResolvedValue(related('none', TUAN))
        renderAt('/dm/dm-tuan')

        expect(await screen.findByText('Bạn và Tuấn chưa là bạn bè')).toBeInTheDocument()
        await expectNoA11yViolations()
        await userEvent.click(screen.getByRole('button', { name: 'Kết bạn' }))

        expect(socialApi.requestFriend).toHaveBeenCalledWith('tuan')
        // The strip and the Toast say the same.
        await waitFor(() => expect(screen.getAllByText('Đã gửi lời mời kết bạn cho Tuấn')).toHaveLength(2))
        await userEvent.click(screen.getByRole('button', { name: 'Hủy lời mời' }))

        expect(socialApi.removeRelationship).toHaveBeenCalledWith('tuan')
        expect(await screen.findByText('Bạn và Tuấn chưa là bạn bè')).toBeInTheDocument()
        expect(await screen.findByText('Đã hủy lời mời gửi Tuấn')).toBeInTheDocument()
    })

    it('says a refused request with the Add friend words in a Toast', async () => {
        socialApi.requestFriend.mockRejectedValue(apiError(403, 'CANNOT_MESSAGE_USER'))
        renderAt('/dm/dm-tuan')

        await userEvent.click(await screen.findByRole('button', { name: 'Kết bạn' }))

        expect(await screen.findByText('Không thể gửi lời mời cho người dùng này')).toBeInTheDocument()
        expect(screen.getByText('Bạn và Tuấn chưa là bạn bè')).toBeInTheDocument()
    })

    it('accepts their request from the strip, the strip then gone; "Từ chối" declines it', async () => {
        socialApi.fetchRelationships.mockResolvedValue([friend(BINH), related('incoming', TUAN)])
        socialApi.acceptFriendRequest.mockResolvedValue(friend(TUAN))
        renderAt('/dm/dm-tuan')

        expect(await screen.findByText('Tuấn muốn kết bạn')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Từ chối' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Chấp nhận' }))

        expect(socialApi.acceptFriendRequest).toHaveBeenCalledWith('tuan', expect.any(String))
        expect(await screen.findByText('Bạn và Tuấn đã là bạn bè')).toBeInTheDocument()
        expect(screen.queryByText('Tuấn muốn kết bạn')).toBeNull()
    })

    it('"Chặn" on the strip asks first, then the DM is blocked-by-me', async () => {
        socialApi.blockPerson.mockResolvedValue(related('blocked', TUAN))
        renderAt('/dm/dm-tuan')

        await userEvent.click(await screen.findByRole('button', { name: 'Chặn' }))
        const dialog = await screen.findByRole('dialog', { name: 'Chặn Tuấn?' })
        await userEvent.click(within(dialog).getByRole('button', { name: 'Chặn' }))

        expect(socialApi.blockPerson).toHaveBeenCalledWith('tuan')
        expect(await screen.findByText('Bạn đã chặn Tuấn')).toBeInTheDocument()
        expect(screen.queryByText('Bạn và Tuấn chưa là bạn bè')).toBeNull()
    })

    it('offers nothing about where we stand while my relationships are not read yet (no "Kết bạn" to a friend)', async () => {
        socialApi.fetchRelationships.mockReturnValue(new Promise(() => undefined))
        renderAt('/dm/dm-binh')
        expect(await screen.findByRole('heading', { level: 1, name: 'Bình' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Hồ sơ' }))

        expect(await within(panel()).findByText('Lớp K22 · đang ôn Giải tích 2 mỗi tối')).toBeInTheDocument()
        expect(screen.queryByText('Bạn và Bình chưa là bạn bè')).toBeNull()
        expect(within(panel()).queryByRole('button', { name: 'Kết bạn' })).toBeNull()
    })

    it('reads the profile again each time the panel shows', async () => {
        renderAt('/dm/dm-binh')
        const button = await screen.findByRole('button', { name: 'Hồ sơ' })
        await userEvent.click(button)
        expect(await within(panel()).findByText('Lớp K22 · đang ôn Giải tích 2 mỗi tối')).toBeInTheDocument()
        await userEvent.click(button)
        expect(screen.queryByRole('complementary', { name: 'Hồ sơ' })).toBeNull()
        await userEvent.click(button)

        await waitFor(() => expect(socialApi.fetchPersonProfile).toHaveBeenCalledTimes(2))
    })

    it('[👤] while the pins are open as a column: the pins close, the profile shows', async () => {
        wide(true)
        renderAt('/dm/dm-binh')
        await screen.findByRole('complementary', { name: 'Hồ sơ' })
        await userEvent.click(screen.getByRole('button', { name: 'Tin đã ghim' }))
        expect(screen.queryByRole('complementary', { name: 'Hồ sơ' })).toBeNull()

        await userEvent.click(screen.getByRole('button', { name: 'Hồ sơ' }))

        expect(await screen.findByRole('complementary', { name: 'Hồ sơ' })).toBeInTheDocument()
        expect(screen.queryByRole('complementary', { name: 'Tin đã ghim' })).toBeNull()
    })

    it('"Chấp nhận" in the panel accepts their request, focus then on ⋯', async () => {
        socialApi.fetchRelationships.mockResolvedValue([friend(BINH), related('incoming', TUAN)])
        socialApi.acceptFriendRequest.mockResolvedValue(friend(TUAN))
        renderAt('/dm/dm-tuan')
        await userEvent.click(await screen.findByRole('button', { name: 'Hồ sơ' }))

        await userEvent.click(await within(panel()).findByRole('button', { name: 'Chấp nhận' }))

        expect(socialApi.acceptFriendRequest).toHaveBeenCalledWith('tuan', expect.any(String))
        expect(await within(panel()).findByText('Bạn bè')).toBeInTheDocument()
        expect(within(panel()).getByRole('button', { name: 'Thêm: Tuấn' })).toHaveFocus()
        expect(socialApi.requestFriend).not.toHaveBeenCalled()
    })

    it('"Kết bạn" in the panel sends a request to someone I have nothing with', async () => {
        socialApi.requestFriend.mockResolvedValue(related('outgoing', TUAN))
        renderAt('/dm/dm-tuan')
        await userEvent.click(await screen.findByRole('button', { name: 'Hồ sơ' }))

        await userEvent.click(await within(panel()).findByRole('button', { name: 'Kết bạn' }))

        expect(socialApi.requestFriend).toHaveBeenCalledWith('tuan')
        expect(await within(panel()).findByText('Đã gửi lời mời')).toBeInTheDocument()
        expect(socialApi.acceptFriendRequest).not.toHaveBeenCalled()
    })

    it('has no dot in the panel where I may not message them, nor for someone I blocked', async () => {
        socialApi.fetchRelationships.mockResolvedValue([friend(BINH), related('blocked', CHI)])
        dmsApi.fetchDms.mockResolvedValue(
            DMS.map((one) => (one.id === 'dm-tuan' ? { ...one, canMessage: false, presence: 'online' as const } : one))
        )
        const { router } = renderAt('/dm/dm-tuan')
        await userEvent.click(await screen.findByRole('button', { name: 'Hồ sơ' }))
        expect(panel().querySelector('[data-presence]')).toBeNull()

        act(() => void router.navigate('/dm/dm-chi'))
        await userEvent.click(await screen.findByRole('button', { name: 'Hồ sơ' }))
        expect(await within(panel()).findByText('Đã chặn')).toBeInTheDocument()
        expect(panel().querySelector('[data-presence]')).toBeNull()
    })

    it('unblocks from ⋯ (no "Chặn" there for someone blocked), the composer then back', async () => {
        socialApi.fetchRelationships.mockResolvedValue([friend(BINH), related('blocked', TUAN)])
        socialApi.unblockPerson.mockResolvedValue(related('none', TUAN))
        renderAt('/dm/dm-tuan')
        await userEvent.click(await screen.findByRole('button', { name: 'Hồ sơ' }))

        await userEvent.click(await within(panel()).findByRole('button', { name: 'Thêm: Tuấn' }))
        expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
            'Sao chép username',
            'Bỏ chặn'
        ])
        await userEvent.click(screen.getByRole('menuitem', { name: 'Bỏ chặn' }))

        expect(socialApi.unblockPerson).toHaveBeenCalledWith('tuan')
        expect(await screen.findByPlaceholderText('Nhắn Tuấn')).toBeInTheDocument()
    })

    it('turns the strip buttons off while offline, saying why', async () => {
        renderAt('/dm/dm-tuan', 'offline')
        expect(await screen.findByText('Bạn và Tuấn chưa là bạn bè')).toBeInTheDocument()

        expect(screen.getByRole('button', { name: 'Kết bạn' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Chặn' })).toBeDisabled()
        await userEvent.hover(screen.getByRole('button', { name: 'Kết bạn' }).parentElement!)
        expect((await screen.findAllByText('Cần kết nối mạng')).length).toBeGreaterThan(0)
    })

    it('keeps the focus in the strip as it changes, and gives it to the composer once the strip goes', async () => {
        socialApi.requestFriend.mockResolvedValue(related('outgoing', TUAN))
        socialApi.fetchRelationships.mockResolvedValue([friend(BINH), related('incoming', CHI)])
        socialApi.acceptFriendRequest.mockResolvedValue(friend(CHI))
        const { router } = renderAt('/dm/dm-tuan')

        await userEvent.click(await screen.findByRole('button', { name: 'Kết bạn' }))
        expect(await screen.findByRole('button', { name: 'Hủy lời mời' })).toHaveFocus()

        act(() => void router.navigate('/dm/dm-chi'))
        await userEvent.click(await screen.findByRole('button', { name: 'Chấp nhận' }))
        await waitFor(() => expect(screen.queryByText('Chi muốn kết bạn')).toBeNull())
        expect(screen.getByPlaceholderText('Nhắn Chi')).toHaveFocus()
    })

    it('has no strip where the composer is locked (frame cannot-message)', async () => {
        dmsApi.fetchDms.mockResolvedValue(
            DMS.map((one) => (one.id === 'dm-tuan' ? { ...one, canMessage: false } : one))
        )
        renderAt('/dm/dm-tuan')

        expect(await screen.findByRole('status')).toHaveTextContent('Không thể gửi tin nhắn cho người dùng này')
        expect(screen.queryByText('Bạn và Tuấn chưa là bạn bè')).toBeNull()
    })
})

describe('Dòng hoạt động học (C-30, C-07 dm, C-50, D-252)', () => {
    const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()
    const studyRoom = (): SeenRoom => ({
        name: 'Phòng học im lặng',
        isStudyRoom: true,
        session: {
            status: 'running',
            phase: 'focus',
            phaseEndsAt: minutesFromNow(18.5),
            pausedRemainingMs: null
        } as SeenRoom['session']
    })
    const studying = { activity: { room: 'study', solo: null } } as const
    const row = (name: RegExp) => within(column()).findByRole('link', { name })

    afterEach(() => {
        rooms.clear()
        vi.mocked(window.matchMedia).mockImplementation(
            (query: string) =>
                ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as never
        )
    })

    it('says what a friend studies in a room I see instead of their last message: short on the row, full in the Header, a block in the panel', async () => {
        rooms.set('binh', studyRoom())
        dmsApi.fetchDms.mockResolvedValue([dm('dm-binh', BINH, last(4, '2026-10-18T14:09:00.000Z'), studying)])
        socialApi.fetchPersonProfile.mockResolvedValue({
            user: BINH,
            bio: null,
            presence: 'online',
            activity: studying.activity,
            relationship: 'friend',
            mutualServers: []
        })
        vi.mocked(window.matchMedia).mockImplementation(
            (query: string) =>
                ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as never
        )
        renderAt('/dm/dm-binh')

        const binh = await row(/Bình/)
        expect(binh).toHaveTextContent('Tập trung · còn 18 phút')
        expect(drawn(binh)).toBe('Tập trung · còn 18 phút')
        // The short form leaves out the room's name: screen readers and the Tooltip have the whole sentence.
        expect(within(binh).getByText('Tập trung · còn 18 phút · Phòng học im lặng')).toHaveClass('sr-only')
        expect(binh).not.toHaveTextContent('Ok 👍')
        const header = screen.getByRole('heading', { level: 1, name: 'Bình' }).closest('header')!
        expect(header).toHaveTextContent('binh.tran')
        expect(drawn(header)).toBe('·Tập trung · còn 18 phút · Phòng học im lặng')
        const profile = await screen.findByRole('complementary', { name: 'Hồ sơ' })
        expect(within(profile).getByText('Phòng học im lặng')).toBeInTheDocument()
        expect(profile).toHaveTextContent('Tập trung · còn 18 phút')
    })

    it('shows the whole sentence in a Tooltip on hovering the short form', async () => {
        rooms.set('binh', studyRoom())
        dmsApi.fetchDms.mockResolvedValue([dm('dm-binh', BINH, last(4, '2026-10-18T14:09:00.000Z'), studying)])
        renderAt('/study')
        const binh = await row(/Bình/)

        await userEvent.hover(within(binh).getByText('Tập trung'))
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Tập trung · còn 18 phút · Phòng học im lặng')
    })

    it('shows no activity in the Header nor the panel for someone offline, or someone I may not message', async () => {
        rooms.set('binh', studyRoom())
        rooms.set('tuan', studyRoom())
        socialApi.fetchPersonProfile.mockImplementation(async (userId) => ({
            user: userId === 'tuan' ? TUAN : BINH,
            bio: null,
            presence: null,
            activity: studying.activity,
            relationship: userId === 'tuan' ? 'none' : 'friend',
            mutualServers: []
        }))
        dmsApi.fetchDms.mockResolvedValue([
            dm('dm-binh', BINH, last(4, '2026-10-18T14:09:00.000Z'), { ...studying, presence: 'offline' }),
            dm('dm-tuan', TUAN, last(2, '2026-10-18T12:09:00.000Z'), { ...studying, presence: null, canMessage: false })
        ])
        vi.mocked(window.matchMedia).mockImplementation(
            (query: string) =>
                ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as never
        )
        const { router } = renderAt('/dm/dm-binh')

        const profile = await screen.findByRole('complementary', { name: 'Hồ sơ' })
        expect(profile).not.toHaveTextContent('còn 18 phút')
        expect(screen.getByRole('heading', { level: 1, name: 'Bình' }).closest('header')).not.toHaveTextContent(
            'còn 18 phút'
        )

        await act(() => router.navigate('/dm/dm-tuan'))
        expect(await screen.findByRole('heading', { level: 1, name: 'Tuấn' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 1, name: 'Tuấn' }).closest('header')).not.toHaveTextContent(
            'còn 18 phút'
        )
        expect(screen.getByRole('complementary', { name: 'Hồ sơ' })).not.toHaveTextContent('còn 18 phút')
    })

    it('says only "Đang học cùng nhóm" for a room I do not see: no name, no time (D-79)', async () => {
        dmsApi.fetchDms.mockResolvedValue([dm('dm-binh', BINH, last(4, '2026-10-18T14:09:00.000Z'), studying)])
        renderAt('/study')

        expect(await row(/Bình/)).toHaveTextContent('Đang học cùng nhóm')
    })

    it('shows no activity, the last message instead, for someone offline, someone I may not message, or someone I blocked', async () => {
        rooms.set('binh', studyRoom())
        rooms.set('chi', studyRoom())
        rooms.set('tuan', studyRoom())
        socialApi.fetchRelationships.mockResolvedValue([
            friend(BINH),
            { ...friend(CHI), type: 'blocked', presence: null }
        ])
        dmsApi.fetchDms.mockResolvedValue([
            dm('dm-binh', BINH, last(4, '2026-10-18T14:09:00.000Z', { content: 'Bình nói' }), {
                ...studying,
                presence: 'offline'
            }),
            dm('dm-chi', CHI, last(3, '2026-10-18T13:09:00.000Z', { content: 'Chi nói' }), studying),
            dm('dm-tuan', TUAN, last(2, '2026-10-18T12:09:00.000Z', { content: 'Tuấn nói' }), {
                ...studying,
                presence: null,
                canMessage: false
            })
        ])
        renderAt('/study')

        expect(await row(/Bình/)).toHaveTextContent('Bình nói')
        expect(await row(/Tuấn/)).toHaveTextContent('Tuấn nói')
        // Someone I blocked: neither their activity nor their last message (L7a).
        await waitFor(() =>
            expect(within(column()).getByRole('link', { name: /Chi/ })).not.toHaveTextContent('Tập trung')
        )
        expect(column()).not.toHaveTextContent('còn 18 phút')
    })

    it('hears activity.updated: the line comes and goes at once, no reading again', async () => {
        const { client } = renderAt('/study')
        client.setQueryData<PersonProfile>(['social', 'profile', 'binh'], {
            user: BINH,
            bio: null,
            presence: 'online',
            activity: null,
            relationship: 'friend',
            mutualServers: []
        })
        const binh = await row(/Bình/)
        expect(binh).toHaveTextContent('Ok 👍')

        act(() =>
            emitRealtimeEvent('activity.updated', {
                userId: 'binh',
                activity: { room: null, solo: { status: 'paused', phase: 'focus', phaseEndsAt: null } }
            })
        )
        await waitFor(() => expect(binh).toHaveTextContent('Một mình · Tạm dừng'))

        // The profile held of them follows too (S-CHAT-05, C-50).
        expect(client.getQueryData<PersonProfile>(['social', 'profile', 'binh'])?.activity).toMatchObject({
            room: null
        })
        act(() => emitRealtimeEvent('activity.updated', { userId: 'binh', activity: null }))
        await waitFor(() => expect(binh).toHaveTextContent('Ok 👍'))
        expect(dmsApi.fetchDms).toHaveBeenCalledTimes(1)
    })
})

// Last: the popover's body, once connected, stays so for the rest of the file.
describe('Hồ sơ từ header DM (S-CHAT-05, D-252 4e)', () => {
    it('opens their profile from the Header avatar, outside any server', async () => {
        connectProfilePopover(({ userId, serverId }) => <p>{`hồ sơ ${userId} ${serverId ?? 'ngoài server'}`}</p>)
        renderAt('/dm/dm-binh')
        await screen.findByRole('heading', { level: 1, name: 'Bình' })

        await userEvent.setup().click(screen.getByRole('button', { name: 'Hồ sơ của Bình' }))
        expect(await screen.findByText('hồ sơ binh ngoài server')).toBeInTheDocument()
    })
})
