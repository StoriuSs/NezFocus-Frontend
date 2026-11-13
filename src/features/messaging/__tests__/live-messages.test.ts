import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { apiError } from '@/test/helpers'
import type { ChannelMessages, Message, MessageCursor, MessagePage } from '../types'

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
