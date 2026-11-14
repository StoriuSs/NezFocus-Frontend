import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import type { RawEmoji } from '../lib/emoji-data'
import type { ChatPermissions, Message, MessageCursor, MessagePage, PinnedMessage, Reactors } from '../types'

const messagesApi = {
    fetchMessages: vi.fn<(channelId: string, cursor: MessageCursor, limit?: number) => Promise<MessagePage>>(),
    sendMessage: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn()
}
vi.mock('../api/messages.api', () => messagesApi)
const reactionsApi = {
    addReaction: vi.fn<(messageId: string, emoji: string) => Promise<void>>(),
    removeReaction: vi.fn<(messageId: string, emoji: string) => Promise<void>>(),
    fetchReactors: vi.fn<(messageId: string, emoji: string) => Promise<Reactors>>()
}
vi.mock('../api/reactions.api', () => reactionsApi)
const pinsApi = {
    fetchPins: vi.fn<(channelId: string) => Promise<PinnedMessage[]>>(),
    pinMessage: vi.fn<(channelId: string, messageId: string) => Promise<void>>(),
    unpinMessage: vi.fn<(channelId: string, messageId: string) => Promise<void>>()
}
vi.mock('../api/pins.api', () => pinsApi)

// A few emoji instead of emojibase's 1,900: the picker's data is read the same way.
const EMOJI: RawEmoji[] = [
    { emoji: '😀', label: 'mặt cười', group: 0, order: 1, version: 1, tags: ['vui'] },
    { emoji: '👍\u{FE0F}', label: 'thích', group: 1, order: 2, version: 0.6, tags: [] },
    { emoji: '🐶', label: 'mặt chó', group: 3, order: 3, version: 0.6, tags: [] }
]
vi.mock('../lib/emoji-data', async (original) => {
    const real = await original<typeof import('../lib/emoji-data')>()
    return { ...real, loadEmoji: async () => real.buildGroups(EMOJI) }
})

const { default: ChannelChat, PinsPanel } = await import('../components/ChannelChat')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')

const ZONE = 'Asia/Ho_Chi_Minh'
const person = (id: string, displayName: string) => ({ id, username: `${id}.tran`, displayName, avatarUrl: null })
const AN = person('an', 'An')
const DUNG = person('dung', 'Dũng')
const TUAN = person('tuan', 'Tuấn')
const at = (time: string) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date())
    return new Date(`${day}T${time}:00+07:00`).toISOString()
}
const message = (
    id: string,
    author: typeof AN,
    content: string,
    time: string,
    more: Partial<Message> = {}
): Message => ({
    id,
    channelId: 'hoi-dap',
    type: 'regular',
    author,
    content,
    systemEvent: null,
    systemData: null,
    systemUser: null,
    pinned: false,
    reactions: [],
    replyTo: null,
    editedAt: null,
    createdAt: at(time),
    ...more
})
const DUNGS = message('m1', DUNG, 'Cảm ơn Chi, mình ra rồi', '20:06', {
    reactions: [
        { emoji: '👍', count: 3, me: false },
        { emoji: '🎉', count: 1, me: true }
    ]
})
const TUANS = message('m2', TUAN, 'Câu 4 đổi cận thế nào vậy mọi người?', '21:45')
const PINNED_NOTICE = message('m3', AN, '', '21:46', {
    type: 'system',
    author: null,
    systemEvent: 'message_pinned',
    systemData: { userId: 'an', messageId: 'm2' },
    systemUser: AN
})

const MEMBER: ChatPermissions = { send: true, manage: false, deleteOwn: true, react: true, addReactions: true }
const MODERATOR: ChatPermissions = { ...MEMBER, manage: true }
const NO_NEW: ChatPermissions = { ...MEMBER, addReactions: false }
const TIMED_OUT: ChatPermissions = { send: false, manage: false, deleteOwn: false, react: false, addReactions: false }

function newClient() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    client.setQueryData(userKeys.profile(), { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null })
    client.setQueryData(userKeys.settings(), { timezone: ZONE })
    return client
}

function renderChat(permissions: ChatPermissions = MEMBER) {
    const client = newClient()
    const view = render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <div className='flex h-[600px] flex-col'>
                    <ChannelChat
                        channelId='hoi-dap'
                        channelName='hoi-dap'
                        permissions={permissions}
                        linkTo={(id) => `${window.location.origin}/channels/ot/hoi-dap/${id}`}
                        readLink={() => null}
                    />
                </div>
                <Toaster />
            </TooltipProvider>
        </QueryClientProvider>
    )
    return { ...view, client }
}

const row = async (text: string) => (await screen.findByText(text)).closest('article') as HTMLElement
const chip = async (text: string, emoji: string) =>
    within(await row(text)).getByRole('button', { name: new RegExp(`^${emoji},`) })
async function openMenu(text: string) {
    await userEvent.click(within(await row(text)).getByRole('button', { name: 'Thêm' }))
    return screen.findByRole('menu')
}

describe('Reactions on a message (REQ-MSG-05, C-10 ReactionChip, SRS 1.71)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        for (const api of [messagesApi, reactionsApi, pinsApi]) Object.values(api).forEach((fn) => fn.mockReset())
        messagesApi.fetchMessages.mockResolvedValue({
            items: [DUNGS, TUANS],
            hasMoreBefore: false,
            hasMoreAfter: false
        })
        reactionsApi.addReaction.mockResolvedValue()
        reactionsApi.removeReaction.mockResolvedValue()
        sessionStorage.clear()
        localStorage.clear()
    })
    afterEach(() => vi.restoreAllMocks())

    it('shows each emoji with its count under the text, one’s own marked, and reads them out with the message', async () => {
        const { container } = renderChat()

        expect(await chip(DUNGS.content, '👍')).toHaveAttribute('aria-pressed', 'false')
        expect(await chip(DUNGS.content, '🎉')).toHaveAttribute('aria-pressed', 'true')
        expect((await row(DUNGS.content)).getAttribute('aria-label')).toMatch(/, 2 cảm xúc$/)
        await expectNoA11yViolations(container)
    })

    it('gives an emoji at once on a click and takes it back on the next', async () => {
        renderChat()

        await userEvent.click(await chip(DUNGS.content, '👍'))
        expect(await chip(DUNGS.content, '👍')).toHaveAttribute('aria-pressed', 'true')
        expect(await chip(DUNGS.content, '👍')).toHaveAccessibleName('👍, 4 người')
        await waitFor(() => expect(reactionsApi.addReaction).toHaveBeenCalledWith('m1', '👍'))

        await userEvent.click(await chip(DUNGS.content, '🎉'))
        await waitFor(() => expect(reactionsApi.removeReaction).toHaveBeenCalledWith('m1', '🎉'))
        expect(within(await row(DUNGS.content)).queryByRole('button', { name: /^🎉,/ })).not.toBeInTheDocument()
    })

    it('counts its own event once after the click, and others’ as they come', async () => {
        renderChat()
        await userEvent.click(await chip(DUNGS.content, '👍'))

        act(() => {
            emitRealtimeEvent('reaction.added', { channelId: 'hoi-dap', messageId: 'm1', emoji: '👍', userId: 'an' })
            emitRealtimeEvent('reaction.added', { channelId: 'hoi-dap', messageId: 'm2', emoji: '😂', userId: 'tuan' })
        })

        expect(await chip(DUNGS.content, '👍')).toHaveAccessibleName('👍, 4 người')
        expect(await chip(TUANS.content, '😂')).toHaveAttribute('aria-pressed', 'false')
    })

    it('puts the emoji back and says why when the server refuses it', async () => {
        reactionsApi.addReaction.mockRejectedValueOnce(apiError(409, 'MAX_REACTIONS_REACHED'))
        renderChat()

        await userEvent.click(await chip(DUNGS.content, '👍'))

        expect(await screen.findByText('Tin này đã có 20 loại cảm xúc')).toBeInTheDocument()
        expect(await chip(DUNGS.content, '👍')).toHaveAttribute('aria-pressed', 'false')
        expect(await chip(DUNGS.content, '👍')).toHaveAccessibleName('👍, 3 người')
    })

    it('ends as the server has it when two quick clicks both fail', async () => {
        // The first still on its way when the second is clicked.
        let failPut: (error: unknown) => void = () => undefined
        reactionsApi.addReaction.mockImplementationOnce(() => new Promise((_, reject) => (failPut = reject)))
        reactionsApi.removeReaction.mockRejectedValueOnce(apiError(503, 'SERVICE_UNAVAILABLE'))
        renderChat()

        await userEvent.click(await chip(DUNGS.content, '👍'))
        await userEvent.click(await chip(DUNGS.content, '👍'))
        act(() => failPut(apiError(503, 'SERVICE_UNAVAILABLE')))

        await waitFor(() => expect(reactionsApi.removeReaction).toHaveBeenCalled())
        await waitFor(async () => expect(await chip(DUNGS.content, '👍')).toHaveAccessibleName('👍, 3 người'))
        expect(await chip(DUNGS.content, '👍')).toHaveAttribute('aria-pressed', 'false')
    })

    it('keeps what the server took when only the second of two quick clicks fails', async () => {
        let put: () => void = () => undefined
        reactionsApi.addReaction.mockImplementationOnce(() => new Promise<void>((resolve) => (put = resolve)))
        reactionsApi.removeReaction.mockRejectedValueOnce(apiError(503, 'SERVICE_UNAVAILABLE'))
        renderChat()

        await userEvent.click(await chip(DUNGS.content, '👍'))
        await userEvent.click(await chip(DUNGS.content, '👍'))
        act(() => put())

        await waitFor(() => expect(reactionsApi.removeReaction).toHaveBeenCalled())
        await waitFor(async () => expect(await chip(DUNGS.content, '👍')).toHaveAttribute('aria-pressed', 'true'))
        expect(await chip(DUNGS.content, '👍')).toHaveAccessibleName('👍, 4 người')
    })

    it('drops a message deleted meanwhile, without a Toast', async () => {
        reactionsApi.addReaction.mockRejectedValueOnce(apiError(404, 'NOT_FOUND_ERROR'))
        renderChat()

        await userEvent.click(await chip(DUNGS.content, '👍'))

        await waitFor(() => expect(screen.queryByText(DUNGS.content)).not.toBeInTheDocument())
        expect(screen.queryByRole('status', { name: /Không tìm thấy/ })).not.toBeInTheDocument()
    })

    it('names who gave it on hover, the reader as "Bạn"', async () => {
        reactionsApi.fetchReactors.mockResolvedValue({
            users: [
                { id: 'binh', username: 'binh', displayName: 'Bình' },
                { id: 'an', username: 'an', displayName: 'An' },
                { id: 'dung', username: 'dung', displayName: 'Dũng' }
            ],
            count: 8
        })
        renderChat()

        fireEvent.focus(await chip(DUNGS.content, '👍'))

        // The count first, the names once read.
        await waitFor(() =>
            expect(screen.getByRole('tooltip')).toHaveTextContent('Bình, Bạn, Dũng và 5 người khác đã thả 👍')
        )
        expect(reactionsApi.fetchReactors).toHaveBeenCalledWith('m1', '👍')
    })

    it('leaves someone timed out the chips to look at, not to click; no "Add reaction"', async () => {
        renderChat(TIMED_OUT)

        const thumbs = await chip(DUNGS.content, '👍')
        expect(thumbs).toHaveAttribute('aria-disabled', 'true')
        await userEvent.click(thumbs)
        expect(reactionsApi.addReaction).not.toHaveBeenCalled()
        expect(within(await row(DUNGS.content)).queryByRole('button', { name: 'Thêm cảm xúc' })).not.toBeInTheDocument()
    })

    it('without ADD_REACTIONS lets one click an emoji already there, not add a new one (C-11)', async () => {
        renderChat(NO_NEW)

        expect(within(await row(DUNGS.content)).queryByRole('button', { name: 'Thêm cảm xúc' })).not.toBeInTheDocument()
        await userEvent.click(await chip(DUNGS.content, '👍'))
        await waitFor(() => expect(reactionsApi.addReaction).toHaveBeenCalledWith('m1', '👍'))
    })

    it('adds a new emoji from the picker on the toolbar, in the server’s form, and remembers it', async () => {
        renderChat()

        await userEvent.click(within(await row(TUANS.content)).getAllByRole('button', { name: 'Thêm cảm xúc' })[0]!)
        const picker = await screen.findByRole('dialog', { name: 'Chọn emoji' })
        expect(within(picker).getByRole('searchbox', { name: 'Tìm emoji' })).toHaveFocus()
        expect(within(picker).getByRole('heading', { name: 'Dùng gần đây' })).toBeInTheDocument()
        await expectNoA11yViolations()

        // In "Recently used" (the frame's eight) and in its group.
        await userEvent.click((await within(picker).findAllByRole('button', { name: 'thích' }))[1]!)

        await waitFor(() => expect(reactionsApi.addReaction).toHaveBeenCalledWith('m2', '👍'))
        expect(screen.queryByRole('dialog', { name: 'Chọn emoji' })).not.toBeInTheDocument()
        expect(await chip(TUANS.content, '👍')).toHaveAttribute('aria-pressed', 'true')
        expect(JSON.parse(localStorage.getItem('emoji-recent:an')!)).toEqual(['👍'])
    })

    it('only adds from the picker: picking one already given leaves it (S-CHAT-03)', async () => {
        renderChat()

        await userEvent.click(within(await row(DUNGS.content)).getAllByRole('button', { name: 'Thêm cảm xúc' })[0]!)
        const picker = await screen.findByRole('dialog', { name: 'Chọn emoji' })
        await userEvent.click(within(picker).getByRole('button', { name: '🎉' }))

        expect(await chip(DUNGS.content, '🎉')).toHaveAttribute('aria-pressed', 'true')
        expect(reactionsApi.removeReaction).not.toHaveBeenCalled()
        expect(reactionsApi.addReaction).not.toHaveBeenCalled()
    })

    it('opens the picker from ☺+ after the reactions too', async () => {
        renderChat()
        const buttons = within(await row(DUNGS.content)).getAllByRole('button', { name: 'Thêm cảm xúc' })
        // The one after the chips comes first in the row; the toolbar's is last.
        expect(buttons).toHaveLength(2)
        await userEvent.click(buttons[0]!)
        expect(await screen.findByRole('dialog', { name: 'Chọn emoji' })).toBeInTheDocument()
    })

    it('leaves focus where one clicks outside the picker', async () => {
        renderChat()
        await userEvent.click(within(await row(TUANS.content)).getByRole('button', { name: 'Thêm cảm xúc' }))
        await screen.findByRole('dialog', { name: 'Chọn emoji' })

        const box = screen.getByRole('textbox', { name: /Nhắn #hoi-dap/ })
        await userEvent.click(box)

        expect(screen.queryByRole('dialog', { name: 'Chọn emoji' })).not.toBeInTheDocument()
        expect(box).toHaveFocus()
    })

    it('finds emoji without accents, says when none match, and moves with the arrow keys', async () => {
        renderChat()
        await userEvent.click(within(await row(TUANS.content)).getAllByRole('button', { name: 'Thêm cảm xúc' })[0]!)
        const picker = await screen.findByRole('dialog', { name: 'Chọn emoji' })
        const search = within(picker).getByRole('searchbox', { name: 'Tìm emoji' })

        await userEvent.type(search, 'mat')
        const found = await within(picker).findAllByRole('button', { name: /mặt/ })
        expect(found.map((button) => button.textContent)).toEqual(['😀', '🐶'])

        await userEvent.keyboard('{ArrowDown}')
        expect(found[0]).toHaveFocus()
        await userEvent.keyboard('{ArrowRight}')
        expect(found[1]).toHaveFocus()
        await userEvent.keyboard('{ArrowUp}')
        expect(search).toHaveFocus()

        await userEvent.clear(search)
        await userEvent.type(search, 'xyz')
        expect(await within(picker).findByText('Không tìm thấy emoji nào')).toBeInTheDocument()
    })

    it('opens the same picker from "Add reaction" in the menu, in the order of S-CHAT-03', async () => {
        renderChat(MODERATOR)

        const menu = await openMenu(TUANS.content)
        expect(
            within(menu)
                .getAllByRole('menuitem')
                .map((item) => item.textContent)
        ).toEqual(['Trả lời', 'Thêm cảm xúc', 'Ghim', 'Sao chép chữ', 'Sao chép link tin', 'Xóa tin nhắn'])
        await userEvent.click(within(menu).getByRole('menuitem', { name: 'Thêm cảm xúc' }))

        expect(await screen.findByRole('dialog', { name: 'Chọn emoji' })).toBeInTheDocument()
    })

    it('inserts an emoji from the composer’s button where the cursor is (C-12)', async () => {
        renderChat()
        const box = await screen.findByRole('textbox', { name: /Nhắn #hoi-dap/ })
        await userEvent.type(box, 'Hay quá')

        await userEvent.click(screen.getByRole('button', { name: 'Chèn emoji' }))
        const picker = await screen.findByRole('dialog', { name: 'Chọn emoji' })
        await userEvent.click(await within(picker).findByRole('button', { name: 'mặt cười' }))

        expect(box).toHaveValue('Hay quá😀')
        expect(reactionsApi.addReaction).not.toHaveBeenCalled()
    })
})

describe('Pins from the chat (REQ-MSG-07, REQ-MSG-08, S-CHAT-03)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        for (const api of [messagesApi, reactionsApi, pinsApi]) Object.values(api).forEach((fn) => fn.mockReset())
        messagesApi.fetchMessages.mockResolvedValue({
            items: [DUNGS, TUANS, PINNED_NOTICE],
            hasMoreBefore: false,
            hasMoreAfter: false
        })
        pinsApi.pinMessage.mockResolvedValue()
        pinsApi.unpinMessage.mockResolvedValue()
        sessionStorage.clear()
    })
    afterEach(() => vi.restoreAllMocks())

    it('pins a message from the menu, which then offers "Unpin"; unpinning says so', async () => {
        renderChat(MODERATOR)

        await userEvent.click(within(await openMenu(DUNGS.content)).getByRole('menuitem', { name: 'Ghim' }))
        await waitFor(() => expect(pinsApi.pinMessage).toHaveBeenCalledWith('hoi-dap', 'm1'))

        await userEvent.click(within(await openMenu(DUNGS.content)).getByRole('menuitem', { name: 'Bỏ ghim' }))
        await waitFor(() => expect(pinsApi.unpinMessage).toHaveBeenCalledWith('hoi-dap', 'm1'))
        expect(await screen.findByText('Đã bỏ ghim')).toBeInTheDocument()
    })

    it('offers no pin without MANAGE_MESSAGES', async () => {
        renderChat(MEMBER)
        const menu = await openMenu(DUNGS.content)
        expect(within(menu).queryByRole('menuitem', { name: 'Ghim' })).not.toBeInTheDocument()
    })

    it('says a channel has 50 pins already', async () => {
        pinsApi.pinMessage.mockRejectedValueOnce(apiError(409, 'MAX_PINS_REACHED'))
        renderChat(MODERATOR)

        await userEvent.click(within(await openMenu(DUNGS.content)).getByRole('menuitem', { name: 'Ghim' }))

        expect(await screen.findByText('Kênh đã có 50 tin ghim · bỏ ghim một tin trước')).toBeInTheDocument()
    })

    it('shows "An pinned a message · View" with no toolbar; View lights the pinned message up', async () => {
        const { container } = renderChat(MODERATOR)

        const notice = (await screen.findByText(/đã ghim một tin nhắn/)).closest('article') as HTMLElement
        expect(notice).toHaveTextContent('An đã ghim một tin nhắn · Xem')
        expect(within(notice).queryByRole('button', { name: 'Thêm' })).not.toBeInTheDocument()
        fireEvent.contextMenu(notice)
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()

        within(await row(TUANS.content))
            .getByText(TUANS.content)
            .closest('article')!
            .focus()
        await userEvent.keyboard('{ArrowDown}')
        expect(notice).toHaveFocus()
        await userEvent.keyboard('{ArrowUp}')
        expect(await row(TUANS.content)).toHaveFocus()

        await userEvent.click(within(notice).getByRole('button', { name: 'Xem tin đã ghim' }))
        const pinned = await row(TUANS.content)
        await waitFor(() => expect(pinned.dataset.highlight).toBe('true'))
        await expectNoA11yViolations(container)
    })
})

describe('The pins panel (S-CHAT-02)', () => {
    const pin = (id: string, author: typeof AN, content: string): PinnedMessage => ({
        ...message(id, author, content, '20:30'),
        createdAt: '2026-10-16T13:30:00.000Z',
        pinned: true,
        pinnedAt: '2026-10-18T14:00:00.000Z'
    })
    const PINS = [pin('p1', TUAN, 'Đề cương ôn tập giữa kỳ'), pin('p2', DUNG, 'Tổng hợp công thức chương 3')]

    function renderPanel(manage: boolean) {
        const client = newClient()
        const onOpen = vi.fn()
        const view = render(
            <QueryClientProvider client={client}>
                <TooltipProvider>
                    <PinsPanel channelId='hoi-dap' manage={manage} onOpen={onOpen} />
                    <Toaster />
                </TooltipProvider>
            </QueryClientProvider>
        )
        return { ...view, client, onOpen }
    }

    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        Object.values(pinsApi).forEach((fn) => fn.mockReset())
        pinsApi.unpinMessage.mockResolvedValue()
    })

    it('lists the pinned messages, the latest pinned first, each a card that opens its message', async () => {
        pinsApi.fetchPins.mockResolvedValue(PINS)
        const { container, onOpen } = renderPanel(false)

        const cards = await screen.findAllByRole('button', { name: /Đề cương|Tổng hợp/ })
        expect(cards[0]).toHaveTextContent('Tuấn16/10/2026 20:30Đề cương ôn tập giữa kỳ')
        expect(screen.queryByRole('button', { name: 'Tùy chọn của tin ghim' })).not.toBeInTheDocument()
        await expectNoA11yViolations(container)

        cards[0]!.focus()
        await userEvent.keyboard('{ArrowDown}')
        expect(cards[1]).toHaveFocus()
        await userEvent.keyboard('{ArrowUp}{Enter}')
        expect(onOpen).toHaveBeenCalledWith('p1')
    })

    it('says when nothing is pinned', async () => {
        pinsApi.fetchPins.mockResolvedValue([])
        renderPanel(true)
        expect(await screen.findByText('Chưa có tin ghim')).toBeInTheDocument()
        expect(screen.getByText('Người quản lý ghim tin quan trọng để cả kênh dễ tìm.')).toBeInTheDocument()
    })

    it('lets a moderator unpin from the card: it leaves at once, with "Unpinned"', async () => {
        pinsApi.fetchPins.mockResolvedValue(PINS)
        renderPanel(true)

        const options = await screen.findAllByRole('button', { name: 'Tùy chọn của tin ghim' })
        await userEvent.click(options[1]!)
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Bỏ ghim' }))

        await waitFor(() => expect(pinsApi.unpinMessage).toHaveBeenCalledWith('hoi-dap', 'p2'))
        expect(await screen.findByText('Đã bỏ ghim')).toBeInTheDocument()
        expect(screen.queryByText('Tổng hợp công thức chương 3')).not.toBeInTheDocument()
        // Focus stays in the list, on the card before it.
        expect(screen.getByRole('button', { name: /Đề cương ôn tập giữa kỳ/ })).toHaveFocus()
    })
})
