import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import i18n from '@/i18n'
import { ShellContext, type ConnectionNotice } from '@/components/shell/shell-context'
import { Popover, PopoverAnchor } from '@/components/ui/popover'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import type { InboxPlaces, MarkNotificationsReadRequest, Notification, NotificationList } from '../types'

const notificationsApi = {
    INBOX_PAGE: 30,
    fetchNotifications: vi.fn<(before: string | null) => Promise<NotificationList>>(),
    markNotificationsRead: vi.fn<(body: MarkNotificationsReadRequest) => Promise<number>>()
}
vi.mock('../api/notifications.api', () => notificationsApi)

const { default: InboxPanel } = await import('../components/InboxPanel')
const { unreadCountOf } = await import('../lib/inbox-cache')
const { notificationKeys } = await import('../api/keys')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')

const ZONE = 'Asia/Ho_Chi_Minh'
const ND = 'nd'
const OT = 'ot'
const HOI_DAP_ND = 'hoi-dap-nd'
const HOI_DAP_OT = 'hoi-dap-ot'
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
            : channelId === HOI_DAP_OT
              ? { serverName: 'Ôn thi Giải tích 2', channelName: 'hoi-dap' }
              : serverId === ND
                ? null
                : undefined,
    mentionChannel: () => ({ kind: 'hidden' }),
    messagePath: (serverId, channelId, messageId) => `/channels/${serverId}/${channelId}/${messageId}`
}

function WhereAmI() {
    return <output aria-label='where'>{useLocation().pathname}</output>
}

function renderInbox({
    places = PLACES,
    connection = null
}: { places?: InboxPlaces; connection?: ConnectionNotice | null } = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    client.setQueryData(userKeys.profile(), { id: AN, username: 'an.x', displayName: 'An', avatarUrl: null })
    client.setQueryData(userKeys.settings(), { timezone: ZONE })
    const onClose = vi.fn()
    const view = render(
        <MemoryRouter initialEntries={['/tasks']}>
            <QueryClientProvider client={client}>
                <ShellContext.Provider value={{ navOpen: false, toggleNav: () => undefined, connection }}>
                    <TooltipProvider>
                        <Popover open>
                            <PopoverAnchor />
                            <InboxPanel places={places} onClose={onClose} />
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
})
