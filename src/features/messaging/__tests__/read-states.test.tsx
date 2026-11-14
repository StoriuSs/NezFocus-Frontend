import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { userKeys } from '@/features/users'
import type { BareMessage, ReadState } from '../types'

const fetchReadStates = vi.fn<() => Promise<ReadState[]>>()
const ackChannel = vi.fn<(channelId: string, messageId: string | null) => Promise<ReadState>>()
vi.mock('../api/readStates.api', () => ({ fetchReadStates, ackChannel }))

const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')
const { listenForReadStates } = await import('../api/liveReadStates')
const { useChannelReadState, useMentionTotal, useServerReadState } = await import('../api/useReadStates')
const { useAckChannel } = await import('../api/useAckChannel')
const { messageKeys } = await import('../api/keys')

const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`
const state = (channelId: string, more: Partial<ReadState> = {}): ReadState => ({
    serverId: 'nd',
    channelId,
    lastReadId: id(10),
    unreadCount: 0,
    mentionCount: 0,
    ...more
})
const message = (n: number, more: Partial<BareMessage> = {}): BareMessage => ({
    attachments: [],
    id: id(n),
    channelId: 'hoi-dap',
    type: 'regular',
    author: { id: 'binh', username: 'binh.tran', displayName: 'Bình', avatarUrl: null },
    content: 'Chào',
    mentionUsers: [],
    mentionRoles: [],
    mentionEveryone: false,
    mentionHereUserIds: [],
    systemEvent: null,
    systemData: null,
    systemUser: null,
    pinned: false,
    replyTo: null,
    editedAt: null,
    createdAt: '2026-11-14T13:02:00.000Z',
    ...more
})
const an = { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null }

let client: QueryClient
const held = () => client.getQueryData<ReadState[]>(messageKeys.readStates())
const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

beforeEach(() => {
    fetchReadStates.mockReset()
    ackChannel.mockReset()
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(userKeys.profile(), { id: 'an' })
})

describe('Read states kept live by the socket (REQ-MSG-09)', () => {
    let stop: () => void
    beforeEach(() => {
        vi.useFakeTimers()
        stop = listenForReadStates(client)
        client.setQueryData(messageKeys.readStates(), [state('hoi-dap'), state('tai-lieu')])
    })
    afterEach(() => {
        stop()
        vi.useRealTimers()
    })
    const refetching = () => client.getQueryState(messageKeys.readStates())?.isInvalidated

    it('counts a message heard from someone else, and a mention of the reader', () => {
        emitRealtimeEvent('message.created', { message: message(11, { mentionUsers: [an] }), nonce: null })
        expect(held()?.[0]).toMatchObject({ unreadCount: 1, mentionCount: 1 })
    })

    it('counts nothing for the reader’s own message', () => {
        emitRealtimeEvent('message.created', { message: message(11, { author: an }), nonce: 'n1' })
        expect(held()?.[0]).toMatchObject({ unreadCount: 0 })
    })

    it('takes the reader’s mark from another tab, but not one behind the mark held (D-173)', () => {
        emitRealtimeEvent('read_state.updated', state('hoi-dap', { lastReadId: id(20), unreadCount: 2 }))
        emitRealtimeEvent('read_state.updated', state('hoi-dap', { lastReadId: id(15), unreadCount: 7 }))
        expect(held()?.[0]).toMatchObject({ lastReadId: id(20), unreadCount: 2 })
    })

    it('reads the list again, once, a moment after a role mention or a deletion after the mark', () => {
        emitRealtimeEvent('message.created', { message: message(11, { mentionRoles: [{ id: 'r1', name: 'x' }] }) })
        emitRealtimeEvent('message.deleted', { id: id(12), channelId: 'hoi-dap' })
        expect(refetching()).toBe(false)

        vi.advanceTimersByTime(1000)
        expect(refetching()).toBe(true)
    })

    it('reads the list again each time the socket is live again: what was missed meanwhile', () => {
        emitRealtimeEvent('ready', {})
        expect(refetching()).toBe(true)
    })

    it('reads the list again when an unread message is edited: a mention may have come or gone', () => {
        emitRealtimeEvent('message.updated', { message: message(11, { mentionUsers: [an] }) })
        vi.advanceTimersByTime(1000)
        expect(refetching()).toBe(true)
    })

    it('reads the list again within a second of the first such event, though more keep coming', () => {
        for (let step = 0; step < 4; step++) {
            emitRealtimeEvent('message.deleted', { id: id(20 + step), channelId: 'hoi-dap' })
            vi.advanceTimersByTime(500)
        }
        expect(refetching()).toBe(true)
    })
})

describe('Reading the list', () => {
    it('reads it again once the socket is back, after a first reading that failed', async () => {
        const stop = listenForReadStates(client)
        fetchReadStates
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValue([state('hoi-dap', { mentionCount: 1 })])
        const { result } = renderHook(() => useMentionTotal(), { wrapper })
        await waitFor(() => expect(client.getQueryState(messageKeys.readStates())?.status).toBe('error'))

        act(() => emitRealtimeEvent('ready', {}))

        await waitFor(() => expect(result.current).toBe(1))
        stop()
    })

    it('gives each part of the app its share: a channel, a server, the tab’s number', async () => {
        fetchReadStates.mockResolvedValue([
            state('hoi-dap', { unreadCount: 3, mentionCount: 2 }),
            state('cg-chung', { serverId: 'cg', unreadCount: 1 })
        ])

        const { result } = renderHook(
            () => ({
                channel: useChannelReadState('hoi-dap'),
                server: useServerReadState('cg', ['cg-chung']),
                total: useMentionTotal()
            }),
            { wrapper }
        )

        await waitFor(() => expect(result.current.total).toBe(2))
        expect(result.current.channel).toMatchObject({ unreadCount: 3 })
        expect(result.current.server).toEqual({ unread: true, mentions: 0 })
    })

    it('keeps a channel marked here meanwhile over an older answer (D-173)', async () => {
        fetchReadStates.mockResolvedValue([state('hoi-dap', { lastReadId: id(10), unreadCount: 6 })])
        const { result } = renderHook(() => useChannelReadState('hoi-dap'), { wrapper })
        await waitFor(() => expect(result.current).toMatchObject({ unreadCount: 6 }))

        // Marked here while the list was read again; the answer was counted before that mark.
        fetchReadStates.mockResolvedValue([state('hoi-dap', { lastReadId: id(20), unreadCount: 4 })])
        const reading = client.invalidateQueries({ queryKey: messageKeys.readStates() })
        client.setQueryData(messageKeys.readStates(), [state('hoi-dap', { lastReadId: id(30) })])
        await act(() => reading)

        await waitFor(() => expect(result.current).toMatchObject({ lastReadId: id(30), unreadCount: 0 }))
        expect(fetchReadStates).toHaveBeenCalledTimes(2)
    })
})

describe('Marking read (D-46)', () => {
    beforeEach(() => {
        client.setQueryData(messageKeys.readStates(), [state('hoi-dap', { unreadCount: 4, mentionCount: 1 })])
    })

    it('moves the mark at once, and takes the backend’s counts when they come', async () => {
        let answer!: (state: ReadState) => void
        ackChannel.mockReturnValue(new Promise((resolve) => (answer = resolve)))
        const { result } = renderHook(() => useAckChannel('hoi-dap'), { wrapper })

        act(() => result.current(id(12), { all: false }))
        expect(ackChannel).toHaveBeenCalledWith('hoi-dap', id(12))
        expect(held()?.[0]).toMatchObject({ lastReadId: id(12), unreadCount: 4 })

        await act(async () => answer(state('hoi-dap', { lastReadId: id(12), unreadCount: 2, mentionCount: 0 })))
        expect(held()?.[0]).toMatchObject({ lastReadId: id(12), unreadCount: 2, mentionCount: 0 })
    })

    it('reads up to the newest message as nothing left unread, and "Mark as read" sends no message', async () => {
        ackChannel.mockResolvedValue(state('hoi-dap', { lastReadId: id(14) }))
        const { result } = renderHook(() => useAckChannel('hoi-dap'), { wrapper })

        act(() => result.current(id(14), { all: true, newest: true }))
        expect(ackChannel).toHaveBeenCalledWith('hoi-dap', null)
        expect(held()?.[0]).toMatchObject({ lastReadId: id(14), unreadCount: 0, mentionCount: 0 })
        await waitFor(() => expect(ackChannel).toHaveBeenCalledTimes(1))
    })

    it('sends one mark at a time: what is seen meanwhile goes after, only the newest of it', async () => {
        const answers: ((state: ReadState) => void)[] = []
        ackChannel.mockImplementation(
            (_channel, messageId) =>
                new Promise((resolve) => answers.push(() => resolve(state('hoi-dap', { lastReadId: messageId! }))))
        )
        const { result } = renderHook(() => useAckChannel('hoi-dap'), { wrapper })

        act(() => result.current(id(11), { all: false }))
        act(() => result.current(id(12), { all: false }))
        act(() => result.current(id(13), { all: false }))
        expect(ackChannel).toHaveBeenCalledTimes(1)

        await act(async () => answers[0]!(state('hoi-dap')))
        expect(ackChannel).toHaveBeenCalledTimes(2)
        expect(ackChannel).toHaveBeenLastCalledWith('hoi-dap', id(13))
    })

    it('sends nothing for a message at or before the mark', () => {
        const { result } = renderHook(() => useAckChannel('hoi-dap'), { wrapper })
        act(() => result.current(id(10), { all: false }))
        expect(ackChannel).not.toHaveBeenCalled()
    })

    it('after a mark fails, sends none for 5 seconds (a list telling what it sees would retry at once), but "Mark as read"', async () => {
        ackChannel
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValue(state('hoi-dap', { lastReadId: id(14) }))
        const { result } = renderHook(() => useAckChannel('hoi-dap'), { wrapper })
        act(() => result.current(id(12), { all: true }))
        await waitFor(() => expect(held()?.[0]).toMatchObject({ lastReadId: id(10) }))

        act(() => result.current(id(12), { all: true }))
        expect(ackChannel).toHaveBeenCalledTimes(1)
        act(() => result.current(id(14), { all: true, newest: true }))
        expect(ackChannel).toHaveBeenCalledTimes(2)
    })

    it('a mark that fails goes back, quietly, and the list is read again: the next one seen tries again', async () => {
        ackChannel.mockRejectedValue(new Error('offline'))
        const { result } = renderHook(() => useAckChannel('hoi-dap'), { wrapper })

        act(() => result.current(id(12), { all: true }))
        await waitFor(() => expect(client.getQueryState(messageKeys.readStates())?.isInvalidated).toBe(true))
        expect(held()?.[0]).toMatchObject({ lastReadId: id(10), unreadCount: 4, mentionCount: 1 })
    })
})
