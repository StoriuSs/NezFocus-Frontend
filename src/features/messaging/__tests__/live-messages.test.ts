import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { apiError } from '@/test/helpers'
import { userKeys } from '@/features/users'
import type { ChannelMessages, Message, MessageCursor, MessagePage, PinnedMessage } from '../types'

const fetchMessages = vi.fn<(channelId: string, cursor: MessageCursor, limit?: number) => Promise<MessagePage>>()
vi.mock('../api/messages.api', () => ({ fetchMessages }))

const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')
const { listenForMessages } = await import('../api/liveMessages')
const { messageKeys } = await import('../api/keys')

const saved = (id: string, channelId = 'hoi-dap'): Message => ({
    id,
    channelId,
    type: 'regular',
    author: { id: 'binh', username: 'binh.tran', displayName: 'Bình', avatarUrl: null },
    content: `Tin ${id}`,
    systemEvent: null,
    systemData: null,
    systemUser: null,
    pinned: false,
    reactions: [],
    replyTo: null,
    editedAt: null,
    createdAt: '2026-10-18T13:02:00.000Z'
})
const page = (ids: string[], more: Partial<MessagePage> = {}): MessagePage => ({
    items: ids.map((id) => saved(id)),
    hasMoreBefore: false,
    hasMoreAfter: false,
    ...more
})
const cached = (ids: string[]): ChannelMessages => ({ pages: [page(ids)], pageParams: [null] })

let client: QueryClient
let stopListening: () => void
const history = (channelId = 'hoi-dap') => client.getQueryData<ChannelMessages>(messageKeys.channel(channelId))
const ids = (channelId = 'hoi-dap') => history(channelId)?.pages.flatMap((p) => p.items.map((item) => item.id))

describe('Keeping open histories live (ARCHITECTURE 3.4, 10.2)', () => {
    beforeEach(() => {
        fetchMessages.mockReset()
        client = new QueryClient()
        stopListening = listenForMessages(client)
    })
    afterEach(() => stopListening())

    it('adds a message heard on the socket to its channel, only if that history is open', () => {
        client.setQueryData(messageKeys.channel('hoi-dap'), cached(['m1']))

        emitRealtimeEvent('message.created', { message: saved('m2'), nonce: 'n1' })
        emitRealtimeEvent('message.created', { message: saved('x1', 'tai-lieu'), nonce: 'n2' })

        expect(ids()).toEqual(['m1', 'm2'])
        expect(history('tai-lieu')).toBeUndefined()
    })

    it('swaps an edited message heard on the socket into its channel (REQ-MSG-05)', () => {
        client.setQueryData(messageKeys.channel('hoi-dap'), cached(['m1', 'm2']))

        emitRealtimeEvent('message.updated', {
            message: { ...saved('m1'), content: 'Đã sửa', editedAt: '2026-10-18T13:05:00.000Z' }
        })

        expect(history()?.pages[0]?.items[0]).toMatchObject({ content: 'Đã sửa', editedAt: '2026-10-18T13:05:00.000Z' })
    })

    it('drops a message deleted elsewhere from its channel (REQ-MSG-05)', () => {
        client.setQueryData(messageKeys.channel('hoi-dap'), cached(['m1', 'm2']))

        emitRealtimeEvent('message.deleted', { id: 'm1', channelId: 'hoi-dap' })

        expect(ids()).toEqual(['m2'])
    })

    it('listens once per query client, however many lists mount', () => {
        listenForMessages(client)()
        client.setQueryData(messageKeys.channel('hoi-dap'), cached(['m1']))
        const set = vi.spyOn(client, 'setQueryData')

        emitRealtimeEvent('message.created', { message: saved('m2') })

        expect(set).toHaveBeenCalledTimes(1)
    })

    it('reads after the first page what was heard while it loaded', async () => {
        let answer!: (page: MessagePage) => void
        fetchMessages.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
        fetchMessages.mockResolvedValue(page(['m2']))
        const loading = client.fetchInfiniteQuery({
            queryKey: messageKeys.channel('hoi-dap'),
            queryFn: () => fetchMessages('hoi-dap', null),
            initialPageParam: null
        })

        emitRealtimeEvent('message.created', { message: saved('m2'), nonce: 'n1' })
        answer(page(['m1']))
        await loading

        await vi.waitFor(() => expect(ids()).toEqual(['m1', 'm2']))
        expect(fetchMessages).toHaveBeenLastCalledWith('hoi-dap', { after: 'm1' }, 100)
    })

    it('reads what was missed after the newest saved message once the socket is live again', async () => {
        client.setQueryData(messageKeys.channel('hoi-dap'), cached(['m1', 'm2']))
        fetchMessages.mockResolvedValue(page(['m2', 'm3'], { hasMoreBefore: true }))

        emitRealtimeEvent('ready', undefined)

        await vi.waitFor(() => expect(ids()).toEqual(['m1', 'm2', 'm3']))
        expect(fetchMessages).toHaveBeenCalledWith('hoi-dap', { after: 'm2' }, 100)
    })

    it('leaves a history opened at a link where it is: it reads newer messages on scrolling down (D-48)', async () => {
        client.setQueryData<ChannelMessages>(messageKeys.channel('hoi-dap'), {
            pages: [page(['m4', 'm5'], { hasMoreAfter: true })],
            pageParams: [{ around: 'm4' }]
        })
        fetchMessages.mockResolvedValue(page(['m200'], { hasMoreBefore: true }))

        emitRealtimeEvent('ready', undefined)
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(fetchMessages).not.toHaveBeenCalled()
        expect(ids()).toEqual(['m4', 'm5'])
    })

    it('reads what came meanwhile once a history that stopped short is back at the newest', async () => {
        const key = messageKeys.channel('hoi-dap')
        client.setQueryData<ChannelMessages>(key, {
            pages: [page(['m4', 'm5'], { hasMoreAfter: true })],
            pageParams: [{ around: 'm4' }]
        })
        emitRealtimeEvent('message.created', { message: saved('m9') })
        fetchMessages.mockResolvedValue(page(['m9']))

        // Back at the newest, read before m9 was saved.
        client.setQueryData<ChannelMessages>(key, { pages: [page(['m7', 'm8'])], pageParams: [null] })

        await vi.waitFor(() => expect(ids()).toEqual(['m7', 'm8', 'm9']))
        expect(fetchMessages).toHaveBeenCalledWith('hoi-dap', { after: 'm8' }, 100)
    })

    it('leaves a history opened at a link meanwhile as it is when a catch-up ends', async () => {
        const key = messageKeys.channel('hoi-dap')
        client.setQueryData(key, cached(['m1', 'm2']))
        let answer: (value: MessagePage) => void = () => undefined
        fetchMessages.mockReturnValue(new Promise((resolve) => (answer = resolve)))
        emitRealtimeEvent('ready', undefined)

        client.setQueryData<ChannelMessages>(key, {
            pages: [page(['a1', 'a2'], { hasMoreAfter: true })],
            pageParams: [{ around: 'a1' }]
        })
        answer(page(['m3']))
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(ids()).toEqual(['a1', 'a2'])
        expect(history()?.pages.at(-1)?.hasMoreAfter).toBe(true)
    })

    it('starts over from the newest page when more than a page was missed', async () => {
        client.setQueryData(messageKeys.channel('hoi-dap'), cached(['m1']))
        fetchMessages.mockImplementation(async (_channel, cursor) =>
            cursor ? page(['m2'], { hasMoreAfter: true }) : page(['m200'], { hasMoreBefore: true })
        )

        emitRealtimeEvent('ready', undefined)

        await vi.waitFor(() => expect(ids()).toEqual(['m200']))
        expect(history()?.pages[0]?.hasMoreBefore).toBe(true)
    })

    it('asks before the page is left while a message is still on its way, not for one that failed', () => {
        const withOutgoing = (state: 'sending' | 'failed'): ChannelMessages => ({
            pages: [
                {
                    ...page(['m1']),
                    outgoing: [
                        {
                            nonce: 'n1',
                            channelId: 'hoi-dap',
                            content: 'Đang gửi',
                            author: saved('m1').author!,
                            createdAt: '2026-10-18T13:02:00.000Z',
                            state
                        }
                    ]
                }
            ],
            pageParams: [null]
        })
        const leave = () => {
            const event = new Event('beforeunload', { cancelable: true })
            window.dispatchEvent(event)
            return event.defaultPrevented
        }

        client.setQueryData(messageKeys.channel('hoi-dap'), withOutgoing('sending'))
        expect(leave()).toBe(true)
        client.setQueryData(messageKeys.channel('hoi-dap'), withOutgoing('failed'))
        expect(leave()).toBe(false)
    })

    it('forgets a history the person may no longer read', async () => {
        client.setQueryData(messageKeys.channel('hoi-dap'), cached(['m1']))
        fetchMessages.mockRejectedValue(apiError(404, 'NOT_FOUND_ERROR'))

        emitRealtimeEvent('ready', undefined)

        await vi.waitFor(() => expect(history()).toBeUndefined())
    })

    it('keeps the history as it was when catching up fails another way, for the next time', async () => {
        client.setQueryData(messageKeys.channel('hoi-dap'), cached(['m1']))
        fetchMessages.mockRejectedValue(apiError(503, 'SERVICE_UNAVAILABLE'))

        emitRealtimeEvent('ready', undefined)

        await vi.waitFor(() => expect(fetchMessages).toHaveBeenCalled())
        expect(ids()).toEqual(['m1'])
    })
})
describe('Keeping reactions and pins live (REQ-MSG-05, REQ-MSG-07, SRS 1.71)', () => {
    beforeEach(() => {
        client = new QueryClient()
        stopListening = listenForMessages(client)
        client.setQueryData(userKeys.profile(), { id: 'an' })
        client.setQueryData(messageKeys.channel('hoi-dap'), cached(['m1', 'm2']))
    })
    afterEach(() => stopListening())

    const reactions = (id = 'm1') => history()?.pages[0]?.items.find((item) => item.id === id)?.reactions
    const pins = () => client.getQueryData<PinnedMessage[]>(messageKeys.pins('hoi-dap'))
    const pin = (id: string): PinnedMessage => ({ ...saved(id), pinned: true, pinnedAt: '2026-10-18T14:00:00.000Z' })
    const event = (emoji: string, userId: string) => ({ channelId: 'hoi-dap', messageId: 'm1', emoji, userId })

    it('counts an emoji given or taken back by anyone, the reader’s own marked as theirs', () => {
        emitRealtimeEvent('reaction.added', event('👍', 'binh'))
        emitRealtimeEvent('reaction.added', event('👍', 'an'))
        expect(reactions()).toEqual([{ emoji: '👍', count: 2, me: true }])

        emitRealtimeEvent('reaction.removed', event('👍', 'an'))
        expect(reactions()).toEqual([{ emoji: '👍', count: 1, me: false }])
    })

    it('marks a message pinned and reads the pins again; an unpinned one leaves them at once', () => {
        client.setQueryData(messageKeys.pins('hoi-dap'), [pin('m2')])

        emitRealtimeEvent('pins.updated', { channelId: 'hoi-dap', messageId: 'm1', pinned: true })
        expect(history()?.pages[0]?.items[0]?.pinned).toBe(true)
        expect(client.getQueryState(messageKeys.pins('hoi-dap'))?.isInvalidated).toBe(true)

        emitRealtimeEvent('pins.updated', { channelId: 'hoi-dap', messageId: 'm2', pinned: false })
        expect(history()?.pages[0]?.items[1]?.pinned).toBe(false)
        expect(pins()).toEqual([])
    })

    it('adds the "pinned a message" notice, which comes with no nonce', () => {
        emitRealtimeEvent('message.created', {
            message: {
                ...saved('m3'),
                type: 'system',
                author: null,
                systemEvent: 'message_pinned',
                systemData: { userId: 'an', messageId: 'm1' }
            },
            nonce: null
        })
        expect(ids()).toEqual(['m1', 'm2', 'm3'])
        expect(reactions('m3')).toEqual([])
    })

    it('reads the pins again once the socket is live again: pins and unpins may have been missed', () => {
        client.setQueryData(messageKeys.pins('hoi-dap'), [pin('m2')])
        fetchMessages.mockResolvedValue(page([]))

        emitRealtimeEvent('ready', undefined)

        expect(client.getQueryState(messageKeys.pins('hoi-dap'))?.isInvalidated).toBe(true)
    })

    it('shows an edit on its pinned card, and drops the card of a deleted message', () => {
        client.setQueryData(messageKeys.pins('hoi-dap'), [pin('m1'), pin('m2')])

        emitRealtimeEvent('message.updated', {
            message: { ...saved('m1'), content: 'Đã sửa', editedAt: '2026-10-18T13:05:00.000Z' }
        })
        expect(pins()?.[0]).toMatchObject({ content: 'Đã sửa', pinnedAt: '2026-10-18T14:00:00.000Z' })

        emitRealtimeEvent('message.deleted', { id: 'm2', channelId: 'hoi-dap' })
        expect(pins()?.map((item) => item.id)).toEqual(['m1'])
    })
})
