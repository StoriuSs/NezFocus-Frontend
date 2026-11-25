import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import i18n from '@/i18n'
import { ShellContext } from '@/components/shell/shell-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import type { Dm, DmLastMessage, Relationship } from '../types'

const socialApi = {
    fetchRelationships: vi.fn<() => Promise<Relationship[]>>(),
    lookUpPerson: vi.fn(),
    sendFriendRequest: vi.fn(),
    acceptFriendRequest: vi.fn(),
    removeRelationship: vi.fn(),
    blockPerson: vi.fn(),
    unblockPerson: vi.fn<(userId: string) => Promise<Relationship>>()
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
const { messagesPlace, rememberMessagesPlace } = await import('../lib/messages-place')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')

connectChatLinks(() => ({ readLink: () => null, channel: () => ({ kind: 'hidden' }) }))

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

function renderAt(at: string) {
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
            <ShellContext.Provider value={{ navOpen: false, toggleNav: () => undefined, connection: null }}>
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
        expect(header.querySelector('svg circle')).toBeNull()
        expect(screen.queryByPlaceholderText('Nhắn Phong')).toBeNull()
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
