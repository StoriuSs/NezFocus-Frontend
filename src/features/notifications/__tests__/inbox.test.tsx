import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Volume2 } from 'lucide-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import i18n from '@/i18n'
import { ShellContext, type ConnectionNotice } from '@/components/shell/shell-context'
import { Popover, PopoverAnchor } from '@/components/ui/popover'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { relationshipsQuery, type Relationship } from '@/features/social'
import { apiError } from '@/test/helpers'
import { expectNoA11yViolations } from '@/test/a11y'
import type { InboxPlaces, MarkNotificationsReadRequest, Notification, NotificationList } from '../types'

const notificationsApi = {
    INBOX_PAGE: 30,
    fetchNotifications: vi.fn<(before: string | null) => Promise<NotificationList>>(),
    markNotificationsRead: vi.fn<(body: MarkNotificationsReadRequest) => Promise<number>>()
}
vi.mock('../api/notifications.api', () => notificationsApi)
// Accept / Decline of a request (the social feature's hooks, D-248).
const socialApi = vi.hoisted(() => ({
    fetchRelationships: vi.fn(async (): Promise<unknown[]> => []),
    acceptFriendRequest: vi.fn<(userId: string, key: string) => Promise<unknown>>(),
    removeRelationship: vi.fn<(userId: string) => Promise<unknown>>()
}))
vi.mock('@/features/social/api/social.api', () => socialApi)
// "Message" from a friend item opens the DM (M6 L7).
const dmsApi = vi.hoisted(() => ({
    fetchDms: vi.fn(async (): Promise<unknown[]> => []),
    openDm: vi.fn<(userId: string, key: string) => Promise<unknown>>(),
    closeDm: vi.fn()
}))
vi.mock('@/features/social/api/dms.api', () => dmsApi)

const { default: InboxPanel } = await import('../components/InboxPanel')
const { unreadCountOf } = await import('../lib/inbox-cache')
const { notificationKeys } = await import('../api/keys')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')

const ZONE = 'Asia/Ho_Chi_Minh'
const ND = 'nd'
const OT = 'ot'
const HOI_DAP_ND = 'hoi-dap-nd'
const HOI_DAP_OT = 'hoi-dap-ot'
const PHONG_HOC = 'phong-hoc-nd'
const AN = '0193a000-0000-7000-8000-0000000000a1'

/** Today in Hồ Chí Minh at that clock; `days` back for an earlier day. */
const today = (time: string, days = 0) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date(Date.now() - days * 86_400_000))
    return new Date(`${day}T${time}:00+07:00`).toISOString()
}

/** Ids sort as time does (UUIDv7): a higher number is a newer item. */
const id = (n: number) => `0193a000-0000-7000-8000-${String(n).padStart(12, '0')}`
const person = (name: string) => ({
    id: name.toLowerCase(),
    username: `${name.toLowerCase()}.x`,
    displayName: name,
    avatarUrl: null
})
const mention = (n: number, name: string, content: string, more: Partial<Notification> = {}): Notification => ({
    id: id(n),
    type: 'mention',
    serverId: ND,
    channelId: HOI_DAP_ND,
    messageId: `m${n}`,
    roleId: null,
    taskId: null,
    note: null,
    task: null,
    server: null,
    reason: 'user',
    actor: person(name),
    message: {
        id: `m${n}`,
        content,
        mentionUsers: [{ id: AN, username: 'an.x', displayName: 'An' }],
        mentionRoles: [],
        files: { count: 0, images: 0 }
    },
    readAt: null,
    createdAt: today('21:00'),
    ...more
})

/** 06 › Hộp thư mẫu của An, the mentions of it. */
const LAN = mention(5, 'Lan', `<@${AN}> mai bạn mang laptop giúp nhóm nhé`, { createdAt: today('21:30') })
const MINH = mention(4, 'Minh', `<@${AN}> review giúp PR #12 trước 22:00 nhé`, { createdAt: today('21:20') })
const BINH = mention(3, 'Bình', `<@${AN}> tối nay 21:00 vào Phòng học im lặng ôn tiếp nhé`, {
    serverId: OT,
    channelId: HOI_DAP_OT,
    createdAt: today('20:10'),
    readAt: today('20:11')
})
const CHI = mention(2, 'Chi', 'Slide chương 4 ở đây nhé, có cả bài tập', {
    type: 'reply',
    reason: null,
    serverId: OT,
    channelId: HOI_DAP_OT,
    createdAt: today('15:20', 1),
    readAt: today('15:30', 1)
})
/** 06 › Hộp thư mẫu: a task given by Minh, a reminder, a task no one is on any more. */
const taskItem = (
    n: number,
    type: Notification['type'],
    task: Partial<NonNullable<Notification['task']>>,
    more: Partial<Notification> = {}
): Notification =>
    mention(n, 'Minh', '', {
        type,
        messageId: null,
        reason: null,
        message: null,
        taskId: `t${n}`,
        task: { title: 'Chuẩn bị demo cuối kỳ', dueAt: null, reminder: null, unassignedBy: null, ...task },
        ...more
    })
const GIVEN = taskItem(8, 'task_assigned', { dueAt: today('23:59') }, { createdAt: today('21:05') })
const REMINDED = taskItem(
    7,
    'task_reminder',
    { title: 'Cập nhật tiến độ tuần', reminder: '24h' },
    { actor: null, createdAt: today('20:59') }
)
const NO_ONE = taskItem(
    6,
    'task_unassigned',
    { title: 'Làm slide thuyết trình', unassignedBy: 'withdrew' },
    { actor: person('Giang'), createdAt: today('20:30'), readAt: today('20:31') }
)
/** 06 S-NOTI-01 `types`: a server handed over by Minh; a timeout, a kick and a ban, no one named (ROLE-04). */
const CG = 'cg'
const serverItem = (
    n: number,
    type: Notification['type'],
    server: Partial<NonNullable<Notification['server']>>,
    more: Partial<Notification> = {}
): Notification =>
    mention(n, 'Minh', '', {
        type,
        serverId: CG,
        channelId: null,
        messageId: null,
        reason: null,
        message: null,
        actor: null,
        server: { name: 'CLB Guitar PTIT', action: null, timeoutUntil: null, reason: null, ...server },
        ...more
    })
const HANDED = serverItem(
    14,
    'owner_transferred',
    { name: 'Nhóm đồ án Mobile' },
    { serverId: ND, actor: person('Minh'), createdAt: today('21:40') }
)
const TIMED_OUT = serverItem(
    13,
    'moderation',
    { action: 'timeout', timeoutUntil: today('22:30'), reason: 'Gửi tin liên tục' },
    { createdAt: today('21:30') }
)
const KICKED = serverItem(
    12,
    'moderation',
    { action: 'kick', reason: 'Nhắn ngoài chủ đề nhiều lần' },
    { createdAt: today('21:20') }
)
const BANNED = serverItem(
    11,
    'moderation',
    { name: 'Toán rời rạc', action: 'ban' },
    { serverId: 'trr', createdAt: today('21:10') }
)
const page = (items: Notification[], unreadCount: number, hasMore = false): NotificationList => ({
    items,
    unreadCount,
    hasMore
})
const INBOX = page([LAN, MINH, BINH, CHI], 2)

const PLACES: InboxPlaces = {
    placeOf: (serverId, channelId) =>
        channelId === HOI_DAP_ND
            ? { serverName: 'Nhóm đồ án Mobile', channelName: 'hoi-dap' }
            : channelId === PHONG_HOC
              ? { serverName: 'Nhóm đồ án Mobile', channelName: 'Phòng học im lặng', icon: Volume2 }
              : channelId === HOI_DAP_OT
                ? { serverName: 'Ôn thi Giải tích 2', channelName: 'hoi-dap' }
                : serverId === ND
                  ? null
                  : undefined,
    mentionChannel: () => ({ kind: 'hidden' }),
    messagePath: (serverId, channelId, messageId) => `/channels/${serverId}/${channelId}/${messageId}`,
    inServer: () => true,
    serverPath: (serverId) => `/channels/${serverId}`,
    settingsPath: (serverId) => `/servers/${serverId}/settings`
}

function WhereAmI() {
    const { pathname, search } = useLocation()
    const how = useNavigationType()
    return (
        <>
            <output aria-label='where'>{`${pathname}${search}`}</output>
            <output aria-label='how'>{how}</output>
        </>
    )
}

/** As the rail: the panel mounted only while open, gone once it closes (`closes`). */
function Inbox({ places, onClose, closes }: { places: InboxPlaces; onClose: () => void; closes: boolean }) {
    const [open, setOpen] = useState(true)
    const close = () => {
        onClose()
        if (closes) setOpen(false)
    }
    return open ? <InboxPanel places={places} onClose={close} /> : null
}

function renderInbox({
    places = PLACES,
    connection = null,
    at = '/tasks',
    closes = false
}: { places?: InboxPlaces; connection?: ConnectionNotice | null; at?: string; closes?: boolean } = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    client.setQueryData(userKeys.profile(), { id: AN, username: 'an.x', displayName: 'An', avatarUrl: null })
    client.setQueryData(userKeys.settings(), { timezone: ZONE })
    const onClose = vi.fn()
    const view = render(
        <MemoryRouter initialEntries={[at]}>
            <QueryClientProvider client={client}>
                <ShellContext.Provider value={{ navOpen: false, toggleNav: () => undefined, connection }}>
                    <TooltipProvider>
                        <Popover open>
                            <PopoverAnchor />
                            <Inbox places={places} onClose={onClose} closes={closes} />
                        </Popover>
                        <Toaster />
                        <WhereAmI />
                    </TooltipProvider>
                </ShellContext.Provider>
            </QueryClientProvider>
        </MemoryRouter>
    )
    return { ...view, client, onClose }
}

const panel = () => screen.getByRole('dialog', { name: 'Thông báo' })
const row = (name: RegExp) => screen.getByRole('link', { name })
const where = () => screen.getByRole('status', { name: 'where' }).textContent

beforeEach(async () => {
    await i18n.changeLanguage('vi')
    notificationsApi.fetchNotifications.mockReset().mockResolvedValue(INBOX)
    notificationsApi.markNotificationsRead.mockReset().mockResolvedValue(0)
})
afterEach(() => {
    act(() => void toast.dismiss())
})

describe('Hộp thư thông báo (S-NOTI-01)', () => {
    it('lists the items newest first in day groups, each saying who, what and where, unread ones first in the reading', async () => {
        const { container } = renderInbox()

        expect(await screen.findByRole('heading', { name: 'Hôm nay' })).toBeInTheDocument()
        const feed = screen.getByRole('feed', { name: 'Thông báo' })
        const articles = within(feed).getAllByRole('article')
        expect(articles).toHaveLength(4)
        expect(articles[3]).toHaveAttribute('aria-posinset', '4')
        expect(articles[3]).toHaveAttribute('aria-setsize', '4')
        // Hôm nay, then Hôm qua before Chi's reply.
        const yesterday = within(feed).getByRole('heading', { name: 'Hôm qua' })
        expect(yesterday.compareDocumentPosition(articles[3]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(yesterday.compareDocumentPosition(articles[2]!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
        expect(
            row(
                /^Chưa đọc\. Lan nhắc tới bạn: @An mai bạn mang laptop giúp nhóm nhé\. #hoi-dap, Nhóm đồ án Mobile, 21:30$/
            )
        ).toBeVisible()
        expect(row(/^Bình nhắc tới bạn: .*Ôn thi Giải tích 2, 20:10$/)).toBeVisible()
        expect(row(/^Chi trả lời bạn: Slide chương 4/)).toBeVisible()
        expect(within(panel()).getByText('Lan nhắc tới bạn')).toHaveClass('font-semibold')
        expect(within(panel()).getByText('Bình nhắc tới bạn')).not.toHaveClass('font-semibold')
        expect(screen.getByRole('button', { name: 'Đánh dấu tất cả là đã đọc' })).toBeVisible()
        expect(screen.getByText('Đã hiện hết thông báo trong 90 ngày qua')).toBeVisible()
        await expectNoA11yViolations(container)
    })

    it('puts keyboard focus on the first row, and moves it with ↑ ↓ Home End', async () => {
        const user = userEvent.setup()
        renderInbox()

        await waitFor(() => expect(row(/Lan nhắc tới bạn/)).toHaveFocus())
        await user.keyboard('{ArrowDown}')
        expect(row(/Minh nhắc tới bạn/)).toHaveFocus()
        await user.keyboard('{End}')
        expect(row(/Chi trả lời bạn/)).toHaveFocus()
        await user.keyboard('{ArrowDown}')
        expect(row(/Chi trả lời bạn/)).toHaveFocus()
        await user.keyboard('{Home}')
        expect(row(/Lan nhắc tới bạn/)).toHaveFocus()
        // One Tab stop in the list: the row, then its ✓.
        expect(row(/Minh nhắc tới bạn/)).toHaveAttribute('tabindex', '-1')
    })

    it('opening a row marks it read, closes the inbox and goes to the message', async () => {
        const user = userEvent.setup()
        const { onClose } = renderInbox()

        await user.click(await screen.findByRole('link', { name: /Minh nhắc tới bạn/ }))

        expect(notificationsApi.markNotificationsRead).toHaveBeenCalledWith({ ids: [MINH.id] })
        expect(onClose).toHaveBeenCalled()
        expect(where()).toBe(`/channels/${ND}/${HOI_DAP_ND}/m4`)
    })

    it('says a voice room’s chat by the room’s icon and name, no "#", and opens its message there (S-ROOM-08)', async () => {
        const user = userEvent.setup()
        const inRoom = mention(6, 'Tuấn', `<@${AN}> vào phòng nghe mình giảng nhé`, {
            channelId: PHONG_HOC,
            createdAt: today('21:40')
        })
        notificationsApi.fetchNotifications.mockResolvedValue(page([inRoom], 1))
        const { container } = renderInbox()

        const link = await screen.findByRole('link', {
            name: /^Chưa đọc. Tuấn nhắc tới bạn: .*. Phòng học im lặng, Nhóm đồ án Mobile, 21:40$/
        })
        const source = within(panel()).getByText('Phòng học im lặng')
        expect(source.textContent).toBe('Phòng học im lặng')
        expect(source.parentElement?.querySelector('svg')).not.toBeNull()
        await expectNoA11yViolations(container)

        await user.click(link)
        expect(where()).toBe(`/channels/${ND}/${PHONG_HOC}/m6`)
    })

    it('says the task items as made: who gave it and its due date, the time left, no one on it (06 › Nội dung chữ)', async () => {
        notificationsApi.fetchNotifications.mockResolvedValue(page([GIVEN, REMINDED, NO_ONE], 2))
        const { container } = renderInbox()

        expect(
            await screen.findByRole('link', {
                name: /^Chưa đọc\. Minh giao cho bạn: Chuẩn bị demo cuối kỳ: Hạn \d\d\/\d\d · 23:59\. #hoi-dap, Nhóm đồ án Mobile, 21:05$/
            })
        ).toBeVisible()
        expect(
            row(/^Chưa đọc\. Còn 24 giờ tới hạn: Cập nhật tiến độ tuần\. #hoi-dap, Nhóm đồ án Mobile, 20:59$/)
        ).toBeVisible()
        expect(row(/^Không còn ai làm: Làm slide thuyết trình: Giang đã rút khỏi việc\. #hoi-dap/)).toBeVisible()
        // The person who gave it is pictured; a reminder and "no one on it" have their type's square (C-29).
        const articles = within(screen.getByRole('feed')).getAllByRole('article')
        expect(within(articles[0]!).getByText('M')).toBeInTheDocument()
        expect(articles[1]!.querySelector('[data-type-square]')).not.toBeNull()
        expect(articles[2]!.querySelector('[data-type-square]')).not.toBeNull()
        expect(articles[0]!.querySelector('[data-type-square]')).toBeNull()
        await expectNoA11yViolations(container)
    })

    it('opening a task item marks it read, closes the inbox and opens the task on this page (05 S-TASK-02)', async () => {
        notificationsApi.fetchNotifications.mockResolvedValue(page([GIVEN, REMINDED, NO_ONE], 2))
        const user = userEvent.setup()
        const { onClose } = renderInbox({ at: '/tasks?server=nd' })

        await user.click(await screen.findByRole('link', { name: /Còn 24 giờ tới hạn/ }))

        expect(notificationsApi.markNotificationsRead).toHaveBeenCalledWith({ ids: [REMINDED.id] })
        expect(onClose).toHaveBeenCalled()
        // The page's own query stays; the detail takes no step in the history (05 Q6).
        expect(where()).toBe('/tasks?server=nd&task=t7')
        expect(screen.getByRole('status', { name: 'how' })).toHaveTextContent('REPLACE')
    })

    it('a task item of a channel no longer viewed says the task is not available, and its items leave', async () => {
        notificationsApi.fetchNotifications.mockResolvedValue(page([GIVEN, REMINDED], 2))
        const user = userEvent.setup()
        const { onClose } = renderInbox({
            places: {
                ...PLACES,
                placeOf: (serverId, channelId) =>
                    channelId === HOI_DAP_ND ? null : PLACES.placeOf(serverId, channelId)
            }
        })

        await user.click(await screen.findByRole('link', { name: /Minh giao cho bạn/ }))

        expect(await screen.findByText('Việc này không còn khả dụng')).toBeVisible()
        expect(screen.queryByText(/Còn 24 giờ tới hạn/)).not.toBeInTheDocument()
        expect(notificationsApi.markNotificationsRead).not.toHaveBeenCalled()
        expect(onClose).not.toHaveBeenCalled()
        expect(where()).toBe('/tasks')
    })

    it('a row of a channel no longer viewed stays, says so, and its items leave (lost-access-tap)', async () => {
        const user = userEvent.setup()
        const { onClose } = renderInbox({
            places: {
                ...PLACES,
                placeOf: (serverId, channelId) =>
                    channelId === HOI_DAP_ND ? null : PLACES.placeOf(serverId, channelId)
            }
        })

        await user.click(await screen.findByRole('link', { name: /Lan nhắc tới bạn/ }))

        expect(await screen.findByText('Bạn không còn xem được kênh này')).toBeVisible()
        expect(screen.queryByText('Lan nhắc tới bạn')).not.toBeInTheDocument()
        expect(screen.queryByText('Minh nhắc tới bạn')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Đánh dấu tất cả là đã đọc' })).not.toBeInTheDocument()
        expect(notificationsApi.markNotificationsRead).not.toHaveBeenCalled()
        expect(onClose).not.toHaveBeenCalled()
        expect(where()).toBe('/tasks')
    })

    it('✓ marks one item read where it is, the inbox staying open', async () => {
        const user = userEvent.setup()
        const { onClose } = renderInbox()
        notificationsApi.markNotificationsRead.mockResolvedValue(1)

        const lan = (await screen.findByText('Lan nhắc tới bạn')).closest('article')!
        await user.click(within(lan).getByRole('button', { name: 'Đánh dấu đã đọc' }))

        expect(notificationsApi.markNotificationsRead).toHaveBeenCalledWith({ ids: [LAN.id] })
        expect(within(panel()).getByText('Lan nhắc tới bạn')).not.toHaveClass('font-semibold')
        expect(within(lan).queryByRole('button', { name: 'Đánh dấu đã đọc' })).not.toBeInTheDocument()
        expect(onClose).not.toHaveBeenCalled()
    })

    it('keeps the count of events come after a mark was answered, not the answer’s older one', async () => {
        const user = userEvent.setup()
        let answer: (count: number) => void = () => undefined
        notificationsApi.markNotificationsRead.mockReturnValue(new Promise((resolve) => (answer = resolve)))
        const { client } = renderInbox()
        const count = () => unreadCountOf(client.getQueryData(notificationKeys.inbox()))

        const lan = (await screen.findByRole('link', { name: /Lan nhắc tới bạn/ })).closest('article')!
        await user.click(within(lan).getByRole('button', { name: 'Đánh dấu đã đọc' }))
        expect(count()).toBe(1)
        // Counted by the server before Mai's item came: 1; then Mai's item, and its count, 2.
        act(() =>
            emitRealtimeEvent('notification.created', {
                notification: mention(6, 'Mai', 'ai làm phần này?', { createdAt: today('21:47') })
            })
        )
        await waitFor(() => expect(count()).toBe(2))
        await act(async () => answer(1))

        expect(count()).toBe(2)
    })

    it('marked from the keyboard, the row keeps the focus its ✓ had', async () => {
        const user = userEvent.setup()
        renderInbox()
        const link = await screen.findByRole('link', { name: /Lan nhắc tới bạn/ })
        await waitFor(() => expect(link).toHaveFocus())

        await user.keyboard('{Tab}')
        expect(within(link.closest('article')!).getByRole('button', { name: 'Đánh dấu đã đọc' })).toHaveFocus()
        await user.keyboard('{Enter}')

        expect(row(/^Lan nhắc tới bạn/)).toHaveFocus()
    })

    it('a new item on top keeps the focus where it was', async () => {
        renderInbox()
        await waitFor(() => expect(row(/Lan nhắc tới bạn/)).toHaveFocus())
        const lan = row(/Lan nhắc tới bạn/)

        act(() =>
            emitRealtimeEvent('notification.created', {
                notification: mention(6, 'Mai', 'ai làm phần này?', { createdAt: today('21:47') })
            })
        )
        await screen.findByRole('link', { name: /Mai nhắc tới bạn/ })

        expect(lan).toBeInTheDocument()
        expect(lan).toHaveFocus()
    })

    it('reads the inbox again when the socket is back, and after a change of one’s own standing, not another member’s', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        try {
            renderInbox()
            await screen.findByRole('link', { name: /Lan nhắc tới bạn/ })
            expect(notificationsApi.fetchNotifications).toHaveBeenCalledTimes(1)

            act(() => emitRealtimeEvent('ready', {}))
            await waitFor(() => expect(notificationsApi.fetchNotifications).toHaveBeenCalledTimes(2))

            act(() => emitRealtimeEvent('member.left', { serverId: ND, userId: 'someone-else' }))
            await act(async () => void vi.advanceTimersByTime(1000))
            expect(notificationsApi.fetchNotifications).toHaveBeenCalledTimes(2)

            act(() => emitRealtimeEvent('member.updated', { serverId: ND, userId: AN }))
            await act(async () => void vi.advanceTimersByTime(1000))
            await waitFor(() => expect(notificationsApi.fetchNotifications).toHaveBeenCalledTimes(3))

            act(() => emitRealtimeEvent('role.updated', { serverId: ND }))
            await act(async () => void vi.advanceTimersByTime(1000))
            await waitFor(() => expect(notificationsApi.fetchNotifications).toHaveBeenCalledTimes(4))
        } finally {
            vi.useRealTimers()
        }
    })

    it('"Đọc hết" marks every item up to the newest held, and goes', async () => {
        const user = userEvent.setup()
        renderInbox()

        await user.click(await screen.findByRole('button', { name: 'Đánh dấu tất cả là đã đọc' }))

        expect(notificationsApi.markNotificationsRead).toHaveBeenCalledWith({ all: true, beforeId: LAN.id })
        expect(screen.queryByRole('button', { name: 'Đánh dấu tất cả là đã đọc' })).not.toBeInTheDocument()
        expect(screen.queryAllByRole('link', { name: /^Chưa đọc/ })).toHaveLength(0)
    })

    it('offline, opening a row goes without marking it, and the marks are off (D-24)', async () => {
        const user = userEvent.setup()
        renderInbox({ connection: 'offline' })

        await screen.findByRole('link', { name: /Lan nhắc tới bạn/ })
        expect(screen.getByText('Bạn đang mất kết nối')).toBeVisible()
        expect(screen.getByRole('button', { name: 'Đánh dấu tất cả là đã đọc' })).toBeDisabled()
        const lan = screen.getByText('Lan nhắc tới bạn').closest('article')!
        expect(within(lan).getByRole('button', { name: 'Đánh dấu đã đọc' })).toBeDisabled()

        await user.click(row(/Lan nhắc tới bạn/))

        expect(notificationsApi.markNotificationsRead).not.toHaveBeenCalled()
        expect(where()).toBe(`/channels/${ND}/${HOI_DAP_ND}/m5`)
    })

    it('keeps live: a new item on top, items read elsewhere, items gone', async () => {
        renderInbox()
        await screen.findByText('Lan nhắc tới bạn')

        act(() =>
            emitRealtimeEvent('notification.created', {
                notification: mention(6, 'Mai', 'ai làm phần này?', { createdAt: today('21:47') })
            })
        )
        await waitFor(() =>
            expect(screen.getAllByRole('article')[0]).toHaveAccessibleName(/^Chưa đọc\. Mai nhắc tới bạn/)
        )

        act(() => emitRealtimeEvent('notification.read', { ids: [LAN.id], beforeId: null, unreadCount: 2 }))
        await waitFor(() => expect(within(panel()).getByText('Lan nhắc tới bạn')).not.toHaveClass('font-semibold'))

        act(() => emitRealtimeEvent('notification.deleted', { ids: [MINH.id], unreadCount: 1 }))
        await waitFor(() => expect(screen.queryByText('Minh nhắc tới bạn')).not.toBeInTheDocument())
    })

    it('scrolled down, a new item leaves the list still and shows "1 thông báo mới", which goes back up', async () => {
        const user = userEvent.setup()
        renderInbox()
        const list = (await screen.findByRole('feed', { name: 'Thông báo' })).parentElement!

        list.scrollTop = 300
        fireEvent.scroll(list)
        act(() =>
            emitRealtimeEvent('notification.created', {
                notification: mention(6, 'Mai', 'ai làm phần này?', { createdAt: today('21:47') })
            })
        )

        list.scrollTo = vi.fn()
        await user.click(await screen.findByRole('button', { name: /1 thông báo mới/ }))
        expect(list.scrollTo).toHaveBeenCalledWith({ top: 0 })
        expect(screen.queryByRole('button', { name: /thông báo mới/ })).not.toBeInTheDocument()
    })

    it('reads the next 30 near the end, until there are no more', async () => {
        notificationsApi.fetchNotifications.mockImplementation(async (before) =>
            before ? page([CHI], 2) : page([LAN, MINH, BINH], 2, true)
        )
        renderInbox()
        const list = (await screen.findByRole('feed', { name: 'Thông báo' })).parentElement!
        expect(screen.queryByText('Đã hiện hết thông báo trong 90 ngày qua')).not.toBeInTheDocument()

        Object.defineProperty(list, 'scrollHeight', { value: 1000, configurable: true })
        Object.defineProperty(list, 'clientHeight', { value: 800, configurable: true })
        list.scrollTop = 100
        fireEvent.scroll(list)

        expect(await screen.findByText('Chi trả lời bạn')).toBeVisible()
        expect(notificationsApi.fetchNotifications).toHaveBeenLastCalledWith(BINH.id)
        expect(screen.getByText('Đã hiện hết thông báo trong 90 ngày qua')).toBeVisible()
    })

    it('says so when there is nothing yet, without "Đọc hết"', async () => {
        notificationsApi.fetchNotifications.mockResolvedValue(page([], 0))
        renderInbox()

        expect(await screen.findByRole('heading', { name: 'Chưa có thông báo nào' })).toBeVisible()
        expect(screen.queryByRole('button', { name: 'Đánh dấu tất cả là đã đọc' })).not.toBeInTheDocument()
    })

    it('offers to try again when the inbox could not be read', async () => {
        const user = userEvent.setup()
        notificationsApi.fetchNotifications.mockRejectedValueOnce(new Error('network'))
        renderInbox()

        await user.click(await screen.findByRole('button', { name: 'Thử lại' }))

        expect(await screen.findByText('Lan nhắc tới bạn')).toBeVisible()
    })

    describe('server items (M3 L8)', () => {
        const SERVER_INBOX = () => page([HANDED, TIMED_OUT, KICKED, BANNED], 4)

        it('says them as made, each with its square; a kick and a ban are no links (06 › Nội dung chữ, Luật hộp thư)', async () => {
            notificationsApi.fetchNotifications.mockResolvedValue(SERVER_INBOX())
            const { container } = renderInbox()

            expect(
                await screen.findByRole('link', {
                    name: /^Chưa đọc\. Minh đã chuyển quyền chủ server Nhóm đồ án Mobile cho bạn\. Nhóm đồ án Mobile, 21:40$/
                })
            ).toBeVisible()
            expect(
                row(
                    /^Chưa đọc\. Bạn bị tạm khóa ở CLB Guitar PTIT tới 22:30\. Chưa gửi tin hay vào phòng được\. Lý do: Gửi tin liên tục\. CLB Guitar PTIT, 21:30$/
                )
            ).toBeVisible()
            const kicked = screen.getByRole('article', {
                name: /Bạn đã bị mời ra khỏi CLB Guitar PTIT\. Lý do: Nhắn ngoài chủ đề nhiều lần\. Bạn có thể quay lại khi có lời mời mới\. 21:20$/
            })
            const banned = screen.getByRole('article', {
                name: /Bạn đã bị cấm khỏi Toán rời rạc\. Bạn không thể tham gia lại server này\. 21:10$/
            })
            expect(screen.queryByRole('link', { name: /bị mời ra|bị cấm/ })).not.toBeInTheDocument()
            // No hover and no hand: nothing to open (06 › Luật hộp thư).
            expect(kicked).not.toHaveClass('hover:bg-surface-2')
            expect(banned).toHaveAttribute('tabindex', '-1')
            for (const one of within(screen.getByRole('feed')).getAllByRole('article'))
                expect(one.querySelector('[data-type-square]')).not.toBeNull()
            await expectNoA11yViolations(container)
        })

        it('the keyboard moves through a kick as through any row', async () => {
            notificationsApi.fetchNotifications.mockResolvedValue(SERVER_INBOX())
            const user = userEvent.setup()
            renderInbox()

            await waitFor(() => expect(row(/chuyển quyền/)).toHaveFocus())
            await user.keyboard('{ArrowDown}{ArrowDown}')
            expect(screen.getByRole('article', { name: /bị mời ra/ })).toHaveFocus()
            await user.keyboard('{End}')
            expect(screen.getByRole('article', { name: /bị cấm/ })).toHaveFocus()
        })

        it('opening the inbox marks its kicks and bans read, not the others (11 S-MOD-02 › H1)', async () => {
            notificationsApi.fetchNotifications.mockResolvedValue(SERVER_INBOX())
            renderInbox()

            await waitFor(() =>
                expect(notificationsApi.markNotificationsRead).toHaveBeenCalledWith({ ids: [KICKED.id, BANNED.id] })
            )
            expect(notificationsApi.markNotificationsRead).toHaveBeenCalledTimes(1)
            expect(screen.getByRole('article', { name: /bị mời ra/ })).not.toHaveAccessibleName(/^Chưa đọc/)
            expect(row(/tạm khóa/)).toHaveAccessibleName(/^Chưa đọc/)
        })

        it('sends them once while open, a failed mark not again and again', async () => {
            notificationsApi.fetchNotifications.mockResolvedValue(SERVER_INBOX())
            notificationsApi.markNotificationsRead.mockRejectedValue(new Error('down'))
            renderInbox()

            await waitFor(() => expect(notificationsApi.markNotificationsRead).toHaveBeenCalled())
            // The failure reads the inbox again, the kick and the ban unread once more.
            await waitFor(() => expect(notificationsApi.fetchNotifications).toHaveBeenCalledTimes(2))
            await screen.findByRole('article', { name: /^Chưa đọc\. Bạn đã bị mời ra/ })
            expect(notificationsApi.markNotificationsRead).toHaveBeenCalledTimes(1)
        })

        it('the arrow keys on a ✓ inside a row with nowhere to go stay on it', async () => {
            notificationsApi.fetchNotifications.mockResolvedValue(page([TIMED_OUT, KICKED], 1))
            const user = userEvent.setup()
            renderInbox({ places: { ...PLACES, inServer: (serverId) => serverId !== CG } })

            const timedOut = await screen.findByRole('article', { name: /^Chưa đọc\. Bạn bị tạm khóa/ })
            await waitFor(() => expect(timedOut).toHaveFocus())
            await user.tab()
            const check = within(timedOut).getByRole('button', { name: 'Đánh dấu đã đọc' })
            expect(check).toHaveFocus()
            await user.keyboard('{ArrowDown}')
            expect(check).toHaveFocus()
        })

        it('a kick shows no ✓ on hover, only on focus (06 › Luật hộp thư)', async () => {
            notificationsApi.fetchNotifications.mockResolvedValue(SERVER_INBOX())
            renderInbox({ connection: 'offline' })

            const kicked = await screen.findByRole('article', { name: /^Chưa đọc\. Bạn đã bị mời ra/ })
            expect(kicked.innerHTML).not.toContain('group-hover:')
        })

        it('offline, the inbox leaves them unread (D-24)', async () => {
            notificationsApi.fetchNotifications.mockResolvedValue(SERVER_INBOX())
            renderInbox({ connection: 'offline' })

            expect(await screen.findByRole('article', { name: /^Chưa đọc\. Bạn đã bị mời ra/ })).toBeVisible()
            expect(notificationsApi.markNotificationsRead).not.toHaveBeenCalled()
        })

        it('the handed server opens its settings, the timeout its first text channel, each marked read', async () => {
            notificationsApi.fetchNotifications.mockResolvedValue(SERVER_INBOX())
            const user = userEvent.setup()
            const { onClose } = renderInbox()

            await user.click(await screen.findByRole('link', { name: /chuyển quyền/ }))
            expect(notificationsApi.markNotificationsRead).toHaveBeenCalledWith({ ids: [HANDED.id] })
            expect(onClose).toHaveBeenCalled()
            expect(where()).toBe(`/servers/${ND}/settings`)

            await user.click(row(/tạm khóa/))
            expect(notificationsApi.markNotificationsRead).toHaveBeenCalledWith({ ids: [TIMED_OUT.id] })
            expect(where()).toBe(`/channels/${CG}`)
        })

        it('a timeout of a server one is no longer in is no link, its ✓ still there', async () => {
            notificationsApi.fetchNotifications.mockResolvedValue(page([TIMED_OUT], 1))
            renderInbox({ places: { ...PLACES, inServer: (serverId) => serverId !== CG } })

            const timedOut = await screen.findByRole('article', { name: /^Chưa đọc\. Bạn bị tạm khóa/ })
            expect(screen.queryByRole('link', { name: /tạm khóa/ })).not.toBeInTheDocument()
            expect(within(timedOut).getByRole('button', { name: 'Đánh dấu đã đọc', hidden: true })).toBeInTheDocument()
        })
    })
})

describe('Lời mời kết bạn trong hộp thư (06 C-29, D-110, D-111, D-248)', () => {
    const giang = { id: 'giang', username: 'giang.vo', displayName: 'Giang', avatarUrl: null }
    const friendItem = (n: number, type: Notification['type'], more: Partial<Notification> = {}): Notification =>
        mention(n, 'Giang', '', {
            type,
            serverId: null,
            channelId: null,
            messageId: null,
            reason: null,
            message: null,
            actor: giang,
            createdAt: today('19:48'),
            ...more
        })
    const REQUEST = friendItem(20, 'friend_request', { note: 'Mình là Giang lớp K22, xin vào nhóm ôn cùng nhé' })
    const ACCEPTED = friendItem(19, 'friend_accepted', { readAt: today('19:50') })
    const asked: Relationship = {
        type: 'incoming',
        since: today('19:48'),
        presence: null,
        activity: null,
        note: REQUEST.note,
        user: giang
    }

    beforeEach(() => {
        notificationsApi.fetchNotifications.mockResolvedValue(page([REQUEST, ACCEPTED, LAN], 2))
        socialApi.acceptFriendRequest.mockReset()
        socialApi.removeRelationship.mockReset()
    })

    it('says who wants to be friends, their note and username, with Accept and Decline; its body opens Pending', async () => {
        const { container } = renderInbox()

        const request = await screen.findByRole('link', { name: /Giang muốn kết bạn/ })
        expect(request).toHaveAttribute('href', '/friends?tab=pending')
        const item = request.closest('article')!
        expect(item).toHaveTextContent('“Mình là Giang lớp K22, xin vào nhóm ôn cùng nhé”')
        expect(item).toHaveTextContent('giang.vo')
        expect(within(item).getByRole('button', { name: 'Chấp nhận' })).toBeInTheDocument()
        expect(row(/Giang đã chấp nhận lời mời kết bạn/)).toHaveAttribute('href', '/friends?tab=all')
        await expectNoA11yViolations(container)
    })

    it('keeps a request accepted here as "now friends" until the inbox closes, the API having deleted it; the friend list too', async () => {
        socialApi.acceptFriendRequest.mockResolvedValue({ ...asked, type: 'friend', presence: 'online' })
        const { client } = renderInbox()
        client.setQueryData(relationshipsQuery.queryKey, [asked])
        const item = (await screen.findByRole('link', { name: /Giang muốn kết bạn/ })).closest('article')!

        await userEvent.click(within(item).getByRole('button', { name: 'Chấp nhận' }))
        await waitFor(() => expect(row(/Bạn và Giang đã là bạn bè/)).toHaveAttribute('href', '/friends?tab=all'))
        act(() => emitRealtimeEvent('notification.deleted', { ids: [REQUEST.id], unreadCount: 1 }))

        const now = row(/Bạn và Giang đã là bạn bè/).closest('article')!
        expect(within(now).queryByRole('button')).not.toBeInTheDocument()
        expect(socialApi.acceptFriendRequest).toHaveBeenCalledWith('giang', expect.any(String))
        expect(client.getQueryData<Relationship[]>(relationshipsQuery.queryKey)?.[0]?.type).toBe('friend')
    })

    it('declines with a Toast, and says "no longer valid" for a request gone meanwhile', async () => {
        socialApi.removeRelationship.mockResolvedValue({ ...asked, type: 'none', since: null })
        renderInbox()
        const item = (await screen.findByRole('link', { name: /Giang muốn kết bạn/ })).closest('article')!

        await userEvent.click(within(item).getByRole('button', { name: 'Từ chối' }))
        expect(await screen.findByText('Đã từ chối lời mời của Giang')).toBeInTheDocument()
        expect(socialApi.removeRelationship).toHaveBeenCalledWith('giang')

        socialApi.acceptFriendRequest.mockRejectedValue(apiError(404, 'NOT_FOUND_ERROR'))
        await userEvent.click(within(item).getByRole('button', { name: 'Chấp nhận' }))
        expect(await screen.findByText('Lời mời không còn hiệu lực')).toBeInTheDocument()
    })

    it('opens the DM with a new friend from the body of "accepted" (09 S-DM-03 › Mở từ, D-249)', async () => {
        dmsApi.openDm.mockResolvedValue({
            id: 'dm-giang',
            user: giang,
            presence: 'online',
            activity: null,
            lastMessage: null,
            canMessage: true,
            createdAt: today('19:51')
        })
        // The inbox goes as it closes: the DM still opens once the API answers.
        const { onClose } = renderInbox({ closes: true })

        await userEvent.click(await screen.findByRole('link', { name: /Giang đã chấp nhận lời mời kết bạn/ }))

        expect(dmsApi.openDm).toHaveBeenCalledWith('giang', expect.any(String))
        await waitFor(() => expect(where()).toBe('/dm/dm-giang'))
        expect(onClose).toHaveBeenCalled()
    })

    it('turns Accept and Decline off while offline', async () => {
        renderInbox({ connection: 'offline' })
        const item = (await screen.findByRole('link', { name: /Giang muốn kết bạn/ })).closest('article')!

        expect(within(item).getByRole('button', { name: 'Chấp nhận' })).toBeDisabled()
        expect(within(item).getByRole('button', { name: 'Từ chối' })).toBeDisabled()
    })
})
