import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import type { MentionSource, Message, MessageCursor, MessagePage, ReadState } from '../types'

const NO_MENTIONS: MentionSource = {
    members: () => ({ queryKey: ['test', 'members'], queryFn: async () => [] }),
    roles: { queryKey: ['test', 'roles'], queryFn: async () => [] },
    channels: [],
    channel: () => ({ kind: 'hidden' }),
    roleIds: []
}

const messagesApi = {
    fetchMessages: vi.fn<(channelId: string, cursor: MessageCursor, limit?: number) => Promise<MessagePage>>(),
    sendMessage: vi.fn()
}
vi.mock('../api/messages.api', () => messagesApi)
const readStatesApi = {
    fetchReadStates: vi.fn<() => Promise<ReadState[]>>(),
    ackChannel: vi.fn<(channelId: string, messageId: string | null) => Promise<ReadState>>()
}
vi.mock('../api/readStates.api', () => readStatesApi)

const { default: ChannelChat } = await import('../components/ChannelChat')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')
const { messageKeys } = await import('../api/keys')

const ZONE = 'Asia/Ho_Chi_Minh'
const BINH = { id: 'binh', username: 'binh.tran', displayName: 'Bình', avatarUrl: null }
const AN = { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null }
const today = (time: string) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date())
    return new Date(`${day}T${time}:00+07:00`).toISOString()
}
/** Message `n` at 20:0n today. */
const message = (n: number, author = BINH): Message => ({
    attachments: [],
    id: `m${String(n).padStart(2, '0')}`,
    channelId: 'hoi-dap',
    type: 'regular',
    author,
    content: `Tin ${n}`,
    mentionUsers: [],
    mentionRoles: [],
    mentionEveryone: false,
    mentionHereUserIds: [],
    systemEvent: null,
    systemData: null,
    systemUser: null,
    pinned: false,
    reactions: [],
    replyTo: null,
    editedAt: null,
    createdAt: today(`20:${String(n).padStart(2, '0')}`)
})
const page = (items: Message[], more: Partial<MessagePage> = {}): MessagePage => ({
    items,
    hasMoreBefore: false,
    hasMoreAfter: false,
    ...more
})
const readState = (lastReadId: string, unreadCount: number, mentionCount = 0): ReadState => ({
    serverId: 'ot',
    channelId: 'hoi-dap',
    lastReadId,
    unreadCount,
    mentionCount
})

let focused = false
let visibility: DocumentVisibilityState = 'visible'

function renderChat(state: ReadState, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
    client.setQueryData(userKeys.profile(), { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null })
    client.setQueryData(userKeys.settings(), { timezone: ZONE })
    client.setQueryData(messageKeys.readStates(), [state])
    const view = render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <div className='flex h-[600px] flex-col'>
                    <ChannelChat
                        linkTo={(id) => `/channels/ot/hoi-dap/${id}`}
                        readLink={() => null}
                        mentions={NO_MENTIONS}
                        channelId='hoi-dap'
                        channelName='hoi-dap'
                        permissions={{
                            attachFiles: true,
                            send: true,
                            manage: false,
                            deleteOwn: true,
                            react: true,
                            addReactions: true,
                            mentionEveryone: false
                        }}
                    />
                </div>
            </TooltipProvider>
        </QueryClientProvider>
    )
    return { ...view, client }
}

const held = (client: QueryClient) => client.getQueryData<ReadState[]>(messageKeys.readStates())?.[0]
const log = () => screen.findByRole('log', { name: 'Messages in #hoi-dap' })

/** Come back to the tab, or to the window (D-46). */
function comeBack() {
    act(() => {
        visibility = 'visible'
        focused = true
        document.dispatchEvent(new Event('visibilitychange'))
        window.dispatchEvent(new Event('focus'))
    })
}

describe('Unread messages in an open channel (REQ-MSG-09, D-46, C-10)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        messagesApi.fetchMessages.mockReset()
        readStatesApi.fetchReadStates.mockReset()
        readStatesApi.ackChannel.mockReset()
        readStatesApi.ackChannel.mockImplementation(async (_channel, messageId) => readState(messageId ?? 'm09', 0))
        sessionStorage.clear()
        // jsdom lays nothing out: every message counts as in view. Whether the reader can see it is set here.
        focused = false
        visibility = 'visible'
        vi.spyOn(document, 'hasFocus').mockImplementation(() => focused)
        vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    })
    afterEach(() => vi.restoreAllMocks())

    it('marks the first unread message with "New", and says how many came since when', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([1, 2, 3, 4, 5, 6, 7].map((n) => message(n))))
        const { container } = renderChat(readState('m04', 3))

        const list = await log()
        const divider = await within(list).findByRole('separator', { name: 'New' })
        // Right above the first unread message, which starts a group of its own.
        const rows = within(list).getAllByRole('article')
        expect(divider.compareDocumentPosition(rows[4]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(divider.compareDocumentPosition(rows[3]!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
        expect(within(rows[4]!).getByText('Bình')).toBeInTheDocument()

        expect(screen.getByRole('button', { name: '3 new messages since 20:05' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Mark as read' })).toBeInTheDocument()
        // The window is not focused: nothing is read (D-46).
        expect(readStatesApi.ackChannel).not.toHaveBeenCalled()
        await expectNoA11yViolations(container)
    })

    it('opens a channel whose first unread message is not held at the page around the mark', async () => {
        messagesApi.fetchMessages.mockResolvedValue(
            page(
                [3, 4, 5, 6].map((n) => message(n)),
                { hasMoreAfter: true }
            )
        )
        renderChat(readState('m04', 40))

        await within(await log()).findByRole('separator', { name: 'New' })
        expect(messagesApi.fetchMessages).toHaveBeenCalledWith('hoi-dap', { around: 'm04' })
        expect(screen.getByRole('button', { name: '40 new messages since 20:05' })).toBeInTheDocument()
    })

    it('reads nothing until the list is at the first unread message: the newest page held is not what was seen', async () => {
        focused = true
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        // The newest messages, held from an earlier visit; the mark is older than all of them.
        client.setQueryData(messageKeys.channel('hoi-dap'), {
            pages: [
                page(
                    [5, 6, 7, 8, 9].map((n) => message(n)),
                    { hasMoreBefore: true }
                )
            ],
            pageParams: [null]
        })
        let around!: (page: MessagePage) => void
        messagesApi.fetchMessages.mockReturnValue(new Promise((resolve) => (around = resolve)))
        renderChat(readState('m02', 7), client)

        await within(await log()).findByText('Tin 9')
        expect(messagesApi.fetchMessages).toHaveBeenCalledWith('hoi-dap', { around: 'm02' })
        expect(readStatesApi.ackChannel).not.toHaveBeenCalled()

        await act(async () => around(page([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => message(n)))))
        expect(await screen.findByRole('separator', { name: 'New' })).toBeInTheDocument()
        await waitFor(() => expect(readStatesApi.ackChannel).toHaveBeenCalledWith('hoi-dap', 'm09'))
    })

    it('opens a history left at an older message (a link) at the page around the mark, not there', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        client.setQueryData(messageKeys.channel('hoi-dap'), {
            pages: [
                page(
                    [1, 2, 3].map((n) => message(n)),
                    { hasMoreAfter: true }
                )
            ],
            pageParams: [{ around: 'm02' }]
        })
        messagesApi.fetchMessages.mockResolvedValue(page([3, 4, 5, 6].map((n) => message(n))))
        renderChat(readState('m04', 2), client)

        expect(await screen.findByRole('separator', { name: 'New' })).toBeInTheDocument()
        expect(messagesApi.fetchMessages).toHaveBeenCalledWith('hoi-dap', { around: 'm04' })
    })

    it('keeps "New" when its message is deleted: above the next one (C-10)', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([1, 2, 3, 4, 5, 6, 7].map((n) => message(n))))
        renderChat(readState('m04', 3))
        await within(await log()).findByRole('separator', { name: 'New' })

        act(() => emitRealtimeEvent('message.deleted', { id: 'm05', channelId: 'hoi-dap' }))

        await waitFor(() => expect(screen.queryByText('Tin 5')).not.toBeInTheDocument())
        const divider = screen.getByRole('separator', { name: 'New' })
        const next = screen.getByText('Tin 6').closest('article')!
        expect(divider.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('puts no "New" on a history that no longer reaches back to the mark (it started over)', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([1, 2, 3].map((n) => message(n))))
        const { client } = renderChat(readState('m03', 0))
        await within(await log()).findByText('Tin 3')

        // More than a page missed while away: the history is the newest page alone.
        act(() => {
            client.setQueryData(messageKeys.channel('hoi-dap'), {
                pages: [
                    page(
                        [40, 41, 42].map((n) => ({ ...message(n % 60), id: `m${n}` })),
                        { hasMoreBefore: true }
                    )
                ],
                pageParams: [null]
            })
            client.setQueryData(messageKeys.readStates(), [readState('m03', 39)])
        })

        await within(await log()).findByText('Tin 40')
        await act(async () => {})
        expect(screen.queryByRole('separator', { name: /New$/ })).not.toBeInTheDocument()
    })

    it('says the day in "New" when the first unread message starts it (Divider/new+date)', async () => {
        const yesterday = (n: number) => ({
            ...message(n),
            createdAt: new Date(new Date(message(n).createdAt).getTime() - 86_400_000).toISOString()
        })
        messagesApi.fetchMessages.mockResolvedValue(page([yesterday(1), yesterday(2), message(3), message(4)]))
        renderChat(readState('m02', 2))

        expect(await screen.findByRole('separator', { name: 'Today, New' })).toBeInTheDocument()
        expect(screen.queryByRole('separator', { name: 'Today' })).not.toBeInTheDocument()
        expect(screen.getByRole('separator', { name: 'Yesterday' })).toBeInTheDocument()
    })

    it('says 99+ past 99', async () => {
        messagesApi.fetchMessages.mockResolvedValue(
            page(
                [4, 5].map((n) => message(n)),
                { hasMoreAfter: true }
            )
        )
        renderChat(readState('m04', 100))
        expect(await screen.findByRole('button', { name: '99+ new messages since 20:05' })).toBeInTheDocument()
    })

    it('reads what is in view once the reader can see it, up to the newest: the bar goes, "New" stays', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([1, 2, 3, 4, 5, 6, 7].map((n) => message(n))))
        const { client } = renderChat(readState('m04', 3, 1))
        await within(await log()).findByRole('separator', { name: 'New' })
        expect(readStatesApi.ackChannel).not.toHaveBeenCalled()

        comeBack()

        await waitFor(() => expect(readStatesApi.ackChannel).toHaveBeenCalledWith('hoi-dap', 'm07'))
        expect(readStatesApi.ackChannel).toHaveBeenCalledTimes(1)
        expect(held(client)).toMatchObject({ lastReadId: 'm07', unreadCount: 0, mentionCount: 0 })
        expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument()
        expect(screen.getByRole('separator', { name: 'New' })).toBeInTheDocument()
    })

    it('reads nothing while the tab is hidden, though the window has focus', async () => {
        visibility = 'hidden'
        focused = true
        messagesApi.fetchMessages.mockResolvedValue(page([1, 2, 3, 4, 5].map((n) => message(n))))
        renderChat(readState('m04', 1))
        await within(await log()).findByRole('separator', { name: 'New' })
        expect(readStatesApi.ackChannel).not.toHaveBeenCalled()
    })

    it('"Mark as read" reads the whole channel: the bar goes, "New" stays', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([1, 2, 3, 4, 5, 6, 7].map((n) => message(n))))
        const { client } = renderChat(readState('m04', 3))

        await userEvent.click(await screen.findByRole('button', { name: 'Mark as read' }))

        expect(readStatesApi.ackChannel).toHaveBeenCalledWith('hoi-dap', null)
        expect(held(client)).toMatchObject({ unreadCount: 0 })
        expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument()
        expect(screen.getByRole('separator', { name: 'New' })).toBeInTheDocument()
    })

    it('has no "New" when nothing was unread on opening', async () => {
        focused = true
        messagesApi.fetchMessages.mockResolvedValue(page([1, 2, 3].map((n) => message(n))))
        renderChat(readState('m03', 0))
        await within(await log()).findByText('Tin 3')
        expect(screen.queryByRole('separator', { name: 'New' })).not.toBeInTheDocument()
        expect(readStatesApi.ackChannel).not.toHaveBeenCalled()
    })

    it('a message that comes while the reader cannot see it gets "New", and stays unread', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([1, 2, 3].map((n) => message(n))))
        const { client } = renderChat(readState('m03', 0))
        await within(await log()).findByText('Tin 3')

        act(() => emitRealtimeEvent('message.created', { message: message(4), nonce: null }))

        expect(await screen.findByRole('separator', { name: 'New' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '1 new message since 20:04' })).toBeInTheDocument()
        expect(held(client)).toMatchObject({ unreadCount: 1 })
        expect(readStatesApi.ackChannel).not.toHaveBeenCalled()
    })

    it('a window that lost focus since reads nothing more: a message coming then gets "New" (D-46)', async () => {
        focused = true
        messagesApi.fetchMessages.mockResolvedValue(page([1, 2, 3].map((n) => message(n))))
        renderChat(readState('m03', 0))
        await within(await log()).findByText('Tin 3')

        focused = false
        act(() => emitRealtimeEvent('message.created', { message: message(4), nonce: null }))

        expect(await screen.findByRole('separator', { name: 'New' })).toBeInTheDocument()
        expect(readStatesApi.ackChannel).not.toHaveBeenCalled()
    })

    it('a message that comes while the reader sees the bottom is read at once, with no "New"', async () => {
        focused = true
        messagesApi.fetchMessages.mockResolvedValue(page([1, 2, 3].map((n) => message(n))))
        renderChat(readState('m03', 0))
        await within(await log()).findByText('Tin 3')

        act(() => emitRealtimeEvent('message.created', { message: message(4), nonce: null }))

        await waitFor(() => expect(readStatesApi.ackChannel).toHaveBeenCalledWith('hoi-dap', 'm04'))
        expect(screen.queryByRole('separator', { name: 'New' })).not.toBeInTheDocument()
    })

    it('one’s own message neither gets "New" nor is sent as read: the backend marks it (D-173)', async () => {
        messagesApi.fetchMessages.mockResolvedValue(page([1, 2, 3].map((n) => message(n))))
        renderChat(readState('m03', 0))
        await within(await log()).findByText('Tin 3')

        act(() => emitRealtimeEvent('message.created', { message: message(4, AN), nonce: null }))

        expect(await screen.findByText('Tin 4')).toBeInTheDocument()
        expect(screen.queryByRole('separator', { name: 'New' })).not.toBeInTheDocument()
    })
})
