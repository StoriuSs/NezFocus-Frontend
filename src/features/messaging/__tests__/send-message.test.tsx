import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AxiosError } from 'axios'
import { apiError } from '@/test/helpers'
import type { ChannelMessages, Message } from '../types'

const sendMessage =
    vi.fn<(channelId: string, body: { content: string; nonce: string }, key: string) => Promise<Message>>()
vi.mock('../api/messages.api', () => ({ sendMessage, fetchMessages: vi.fn() }))
const reportError = vi.fn()
vi.mock('@/lib/error-tracking', async (original) => ({
    ...(await original<typeof import('@/lib/error-tracking')>()),
    reportError
}))

const { useSendMessage } = await import('../api/useSendMessage')
const { sendAlong } = await import('../api/outgoingMessages')
const { useUploads } = await import('../attachment-tray.store')
const { messageKeys } = await import('../api/keys')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')

const me = { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null }
const savedFrom = (body: { content: string }, id = 'm9'): Message => ({
    attachments: [],
    id,
    channelId: 'hoi-dap',
    type: 'regular',
    author: me,
    content: body.content,
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
    createdAt: new Date().toISOString()
})
const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK')

let client: QueryClient
/** Leaves the channel: the chat that sent is gone. */
let leave: () => void
/** Each test's client stops listening for the network once it is done. */
const stops: Array<() => void> = []
afterEach(() => stops.splice(0).forEach((stop) => stop()))
const history = () => client.getQueryData<ChannelMessages>(messageKeys.channel('hoi-dap'))!
const outgoing = () => history().pages[0]!.outgoing ?? []
const savedIds = () => history().pages[0]!.items.map((item) => item.id)

function setUp({ loaded = true, waiting = [] as string[] } = {}) {
    client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    stops.push(sendAlong(client))
    if (loaded) {
        client.setQueryData<ChannelMessages>(messageKeys.channel('hoi-dap'), {
            pages: [
                {
                    items: [],
                    hasMoreBefore: false,
                    hasMoreAfter: false,
                    outgoing: waiting.map((content, index) => ({
                        nonce: `w${index}`,
                        channelId: 'hoi-dap',
                        content,
                        author: me,
                        createdAt: new Date().toISOString(),
                        state: 'waiting' as const
                    }))
                }
            ],
            pageParams: [null]
        })
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const rendered = renderHook(() => useSendMessage('hoi-dap', me), { wrapper })
    leave = rendered.unmount
    return rendered.result
}

const setOnline = (online: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)

describe('Sending a message (REQ-MSG-01, C-10 sending / failed / rate-limited)', () => {
    beforeEach(() => {
        sendMessage.mockReset()
        setOnline(true)
    })
    afterEach(() => vi.restoreAllMocks())

    it('shows it at once as sending, then swaps it for the saved one', async () => {
        let answer!: (message: Message) => void
        sendMessage.mockImplementation(
            (_channel, body) => new Promise((resolve) => (answer = () => resolve(savedFrom(body))))
        )
        const hook = setUp()

        act(() => void hook.current.send('  Ok, mình vào sớm giữ chỗ \n'))

        expect(outgoing()).toMatchObject([{ content: 'Ok, mình vào sớm giữ chỗ', state: 'sending', author: me }])
        await waitFor(() => expect(sendMessage).toHaveBeenCalled())
        const [, body] = sendMessage.mock.calls[0]!
        expect(body).toEqual({ content: 'Ok, mình vào sớm giữ chỗ', nonce: outgoing()[0]!.nonce })

        await act(async () => answer(savedFrom(body)))
        expect(outgoing()).toEqual([])
        expect(savedIds()).toEqual(['m9'])
    })

    it('says whether it took the message: not before the history is there to show it', () => {
        const hook = setUp({ loaded: false })
        let taken = true
        act(() => {
            taken = hook.current.send('Chưa tải xong')
        })
        expect(taken).toBe(false)
        expect(sendMessage).not.toHaveBeenCalled()
    })

    it('sends what waited for the network once the socket is live again, though the browser never went offline', async () => {
        sendMessage.mockRejectedValueOnce(networkError())
        sendMessage.mockImplementation(async (_channel, body) => savedFrom(body))
        const hook = setUp()
        act(() => void hook.current.send('API khởi động lại'))
        await waitFor(() => expect(outgoing()[0]?.state).toBe('waiting'))

        act(() => emitRealtimeEvent('ready', undefined))

        await waitFor(() => expect(savedIds()).toEqual(['m9']))
    })

    it('sends what waited when the channel is opened again, online', async () => {
        sendMessage.mockImplementation(async (_channel, body) => savedFrom(body))
        setUp({ waiting: ['Gõ lúc mất mạng'] })
        await waitFor(() => expect(savedIds()).toEqual(['m9']))
    })

    it('sends nothing blank', () => {
        const hook = setUp()
        act(() => void hook.current.send(' \n '))
        expect(sendMessage).not.toHaveBeenCalled()
        expect(outgoing()).toEqual([])
    })

    it('marks a refused message failed; "Try again" sends it with the same nonce, "Discard" drops it', async () => {
        sendMessage.mockRejectedValueOnce(apiError(500, 'GENERIC_ERROR'))
        const hook = setUp()
        act(() => void hook.current.send('Câu 4?'))
        await waitFor(() => expect(outgoing()[0]?.state).toBe('failed'))
        const { nonce } = outgoing()[0]!

        sendMessage.mockRejectedValueOnce(apiError(500, 'GENERIC_ERROR'))
        await act(async () => hook.current.retry(nonce))
        expect(sendMessage.mock.calls.map(([, body]) => body.nonce)).toEqual([nonce, nonce])
        expect(outgoing()[0]!.state).toBe('failed')

        act(() => {
            hook.current.discard(nonce)
        })
        expect(outgoing()).toEqual([])
    })

    it('sends a failed message once though "Try again" is clicked twice', async () => {
        sendMessage.mockRejectedValueOnce(apiError(500, 'GENERIC_ERROR'))
        let answer!: () => void
        sendMessage.mockImplementation(
            (_channel, body) => new Promise((resolve) => (answer = () => resolve(savedFrom(body))))
        )
        const hook = setUp()
        act(() => void hook.current.send('Bấm hai lần'))
        await waitFor(() => expect(outgoing()[0]?.state).toBe('failed'))
        const { nonce } = outgoing()[0]!

        act(() => {
            void hook.current.retry(nonce)
            void hook.current.retry(nonce)
        })
        await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
        await act(async () => answer())

        expect(sendMessage).toHaveBeenCalledTimes(2)
        expect(savedIds()).toEqual(['m9'])
    })

    it('waits out a rate limit, saying when, then sends again by itself', async () => {
        sendMessage.mockRejectedValueOnce(apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': '1' } }))
        sendMessage.mockImplementationOnce(async (_channel, body) => savedFrom(body))
        const hook = setUp()
        const before = Date.now()

        act(() => void hook.current.send('Tin thứ 6'))

        await waitFor(() => expect(outgoing()[0]?.state).toBe('rate-limited'))
        expect(outgoing()[0]!.retryAt).toBeGreaterThanOrEqual(before + 1000)
        await waitFor(() => expect(savedIds()).toEqual(['m9']), { timeout: 3000 })
        expect(sendMessage).toHaveBeenCalledTimes(2)
    })

    it('keeps a message typed offline until the network is back, then sends it', async () => {
        setOnline(false)
        sendMessage.mockImplementation(async (_channel, body) => savedFrom(body))
        const hook = setUp()

        act(() => void hook.current.send('Sẽ gửi khi có mạng'))
        expect(outgoing()[0]!.state).toBe('waiting')
        expect(sendMessage).not.toHaveBeenCalled()

        setOnline(true)
        act(() => void window.dispatchEvent(new Event('online')))
        await waitFor(() => expect(savedIds()).toEqual(['m9']))
    })

    it('drops, without a word, a message saved then deleted before its answer came (REQ-MSG-10)', async () => {
        sendMessage.mockRejectedValueOnce(apiError(404, 'NOT_FOUND_ERROR'))
        sendMessage.mockImplementation(async (_channel, body) => savedFrom(body))
        const hook = setUp()

        act(() => void hook.current.send('Đã bị xóa'))
        act(() => void hook.current.send('Tin sau'))

        await waitFor(() => expect(savedIds()).toEqual(['m9']))
        expect(outgoing()).toEqual([])
    })

    it('waits for the network when the request got no answer', async () => {
        sendMessage.mockRejectedValueOnce(networkError())
        const hook = setUp()
        act(() => void hook.current.send('Mất mạng giữa chừng'))
        await waitFor(() => expect(outgoing()[0]?.state).toBe('waiting'))
    })
})

describe('Messages keep the order they were typed in (S-CHAT-01 message-states)', () => {
    beforeEach(() => {
        sendMessage.mockReset()
        setOnline(true)
    })
    afterEach(() => vi.restoreAllMocks())

    /** Saves each message under the next id, as the API does: m1, m2, … */
    const savingInTurn = () => {
        let next = 0
        return async (_channel: string, body: { content: string }) => savedFrom(body, `m${++next}`)
    }
    const contents = () => history().pages[0]!.items.map((item) => item.content)

    it('sends one typed while another waits out a limit only after it', async () => {
        const save = savingInTurn()
        sendMessage.mockRejectedValueOnce(apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': '1' } }))
        sendMessage.mockImplementation(save)
        const hook = setUp()

        act(() => void hook.current.send('Tin 3'))
        await waitFor(() => expect(outgoing()[0]?.state).toBe('rate-limited'))
        act(() => void hook.current.send('Tin 4'))
        act(() => void hook.current.send('Tin 5'))

        expect(sendMessage).toHaveBeenCalledTimes(1)
        await waitFor(() => expect(contents()).toEqual(['Tin 3', 'Tin 4', 'Tin 5']), { timeout: 3000 })
    })

    it('sends what was typed offline in its order once the network is back', async () => {
        setOnline(false)
        sendMessage.mockImplementation(savingInTurn())
        const hook = setUp()

        act(() => void hook.current.send('Một'))
        act(() => void hook.current.send('Hai'))
        expect(outgoing().map((item) => item.state)).toEqual(['waiting', 'queued'])
        expect(sendMessage).not.toHaveBeenCalled()

        setOnline(true)
        act(() => void window.dispatchEvent(new Event('online')))
        await waitFor(() => expect(contents()).toEqual(['Một', 'Hai']))
    })

    it('does not hold the others back behind one that failed', async () => {
        sendMessage.mockRejectedValueOnce(apiError(500, 'GENERIC_ERROR'))
        sendMessage.mockImplementation(savingInTurn())
        const hook = setUp()

        act(() => void hook.current.send('Lỗi'))
        act(() => void hook.current.send('Vẫn đi'))

        await waitFor(() => expect(contents()).toEqual(['Vẫn đi']))
        expect(outgoing()).toMatchObject([{ content: 'Lỗi', state: 'failed' }])
    })
})

describe('Messages keep going once their channel is left (S-CHAT-04 › Đổi kênh)', () => {
    beforeEach(() => {
        sendMessage.mockReset()
        setOnline(true)
        useUploads.setState({ uploads: {}, trays: {} })
    })
    afterEach(() => vi.restoreAllMocks())

    const checked = {
        id: 'a1',
        filename: 'cau4.jpg',
        size: 1,
        contentType: 'image/jpeg',
        width: 4,
        height: 3,
        thumbnailUrl: 'https://kho/t',
        url: 'https://kho/a',
        downloadUrl: 'https://kho/d'
    }

    it('sends a message whose files finish uploading after the channel is left', async () => {
        sendMessage.mockImplementation(async (_channel, body) => savedFrom(body))
        const hook = setUp()
        useUploads.getState().put([
            {
                id: 'u1',
                channelId: 'hoi-dap',
                file: new File(['x'], 'cau4.jpg'),
                kind: 'image',
                preview: null,
                state: 'uploading',
                progress: 0.5,
                attachment: null,
                refusal: null
            }
        ])
        act(() => void hook.current.send('Câu 4 đây'))
        leave()

        act(() => useUploads.getState().change('u1', { state: 'done', attachment: checked }))

        await waitFor(() => expect(savedIds()).toEqual(['m9']))
        expect(sendMessage.mock.calls[0]![1]).toMatchObject({ attachmentIds: ['a1'] })
    })

    it('sends what waited for the network in a channel no longer open, once the browser is back online', async () => {
        setOnline(false)
        sendMessage.mockImplementation(async (_channel, body) => savedFrom(body))
        const hook = setUp()
        act(() => void hook.current.send('Gõ rồi chuyển kênh'))
        leave()

        setOnline(true)
        act(() => void window.dispatchEvent(new Event('online')))

        await waitFor(() => expect(savedIds()).toEqual(['m9']))
    })

    it('sends one waiting out a rate limit at its time, the channel left meanwhile', async () => {
        sendMessage.mockRejectedValueOnce(apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': '1' } }))
        sendMessage.mockImplementationOnce(async (_channel, body) => savedFrom(body))
        const hook = setUp()
        act(() => void hook.current.send('Tin thứ 6'))
        await waitFor(() => expect(outgoing()[0]?.state).toBe('rate-limited'))
        leave()

        await waitFor(() => expect(savedIds()).toEqual(['m9']), { timeout: 3000 })
    })

    it('sends a message typed while the socket was down only once, though the browser and the socket both come back', async () => {
        sendMessage.mockRejectedValueOnce(networkError())
        let answer!: () => void
        sendMessage.mockImplementation(
            (_channel, body) => new Promise((resolve) => (answer = () => resolve(savedFrom(body))))
        )
        const hook = setUp()
        act(() => void hook.current.send('Một lần thôi'))
        await waitFor(() => expect(outgoing()[0]?.state).toBe('waiting'))

        act(() => {
            window.dispatchEvent(new Event('online'))
            emitRealtimeEvent('ready', undefined)
        })
        await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
        await act(async () => answer())

        expect(savedIds()).toEqual(['m9'])
        expect(sendMessage).toHaveBeenCalledTimes(2)
    })
})

describe('Each message has one Idempotency-Key until saved (CONSTRAINTS.md E3)', () => {
    beforeEach(() => {
        sendMessage.mockReset()
        setOnline(true)
        useUploads.setState({ uploads: {}, trays: {} })
    })
    afterEach(() => vi.restoreAllMocks())

    const keys = () => sendMessage.mock.calls.map(([, , key]) => key)

    it('sends a message again after no answer with the same key, so the API knows a repeat', async () => {
        sendMessage.mockRejectedValueOnce(networkError())
        sendMessage.mockImplementation(async (_channel, body) => savedFrom(body))
        const hook = setUp()
        act(() => void hook.current.send('Lần hai cùng khóa'))
        await waitFor(() => expect(outgoing()[0]?.state).toBe('waiting'))

        act(() => void window.dispatchEvent(new Event('online')))

        await waitFor(() => expect(savedIds()).toEqual(['m9']))
        expect(keys()).toHaveLength(2)
        expect(keys()[0]).toBe(keys()[1])
    })

    it('gives two messages two keys', async () => {
        sendMessage.mockImplementation(async (_channel, body) => savedFrom(body, body.content === 'Một' ? 'm1' : 'm2'))
        const hook = setUp()
        act(() => void hook.current.send('Một'))
        await waitFor(() => expect(savedIds()).toEqual(['m1']))
        act(() => void hook.current.send('Hai'))
        await waitFor(() => expect(savedIds()).toEqual(['m1', 'm2']))
        expect(keys()[0]).not.toBe(keys()[1])
    })

    it('makes a new key when the body changed, its files uploaded again, or the old answer would come back', async () => {
        const file = (state: 'done', id: string) => ({
            id: 'u1',
            channelId: 'hoi-dap',
            file: new File(['x'], 'cau4.jpg'),
            kind: 'image' as const,
            preview: null,
            state,
            progress: 1,
            attachment: {
                id,
                filename: 'cau4.jpg',
                size: 1,
                contentType: 'image/jpeg',
                width: 1,
                height: 1,
                thumbnailUrl: null,
                url: 'u',
                downloadUrl: 'd'
            },
            refusal: null
        })
        sendMessage.mockRejectedValueOnce(apiError(404, 'UPLOAD_FILE_NOT_FOUND', { data: { attachmentIds: ['a1'] } }))
        sendMessage.mockImplementation(async (_channel, body) => savedFrom(body))
        const hook = setUp()
        useUploads.getState().put([file('done', 'a1')])
        act(() => void hook.current.send('Tệp quá 24 giờ'))
        await waitFor(() => expect(outgoing()[0]?.state).toBe('failed'))

        // Uploaded again: another file id, so another body.
        act(() => useUploads.getState().change('u1', { state: 'done', attachment: file('done', 'a2').attachment }))
        await act(async () => hook.current.retry(outgoing()[0]!.nonce))

        await waitFor(() => expect(savedIds()).toEqual(['m9']))
        expect(sendMessage.mock.calls[1]![1]).toMatchObject({ attachmentIds: ['a2'] })
        expect(keys()[0]).not.toBe(keys()[1])
    })
})

describe('What happens to messages on their way when one signs out or loses the channel', () => {
    beforeEach(() => {
        sendMessage.mockReset()
        setOnline(true)
        useUploads.setState({ uploads: {}, trays: {} })
    })
    afterEach(() => vi.restoreAllMocks())

    it('never sends a message whose files finish after the history went (signing out clears the cache), and drops its files', async () => {
        sendMessage.mockImplementation(async (_channel, body) => savedFrom(body))
        const hook = setUp()
        useUploads.getState().put([
            {
                id: 'u1',
                channelId: 'hoi-dap',
                file: new File(['x'], 'cau4.jpg'),
                kind: 'image',
                preview: null,
                state: 'uploading',
                progress: 0.5,
                attachment: null,
                refusal: null
            }
        ])
        act(() => void hook.current.send('Của An'))
        leave()

        act(() => client.clear())

        expect(useUploads.getState().uploads).toEqual({})
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(sendMessage).not.toHaveBeenCalled()
    })
})

describe('Waiting while the browser says it is online (the API was not reachable)', () => {
    beforeEach(() => {
        sendMessage.mockReset()
        setOnline(true)
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('tries again by itself a little later, with no online or socket event to wake it', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        sendMessage.mockRejectedValueOnce(networkError())
        sendMessage.mockImplementation(async (_channel, body) => savedFrom(body))
        const hook = setUp()
        act(() => void hook.current.send('API chập chờn'))
        await waitFor(() => expect(outgoing()[0]?.state).toBe('waiting'))

        await act(async () => vi.advanceTimersByTime(10_000))

        await waitFor(() => expect(savedIds()).toEqual(['m9']))
    })
})

describe('A send that breaks in the app itself', () => {
    beforeEach(() => {
        sendMessage.mockReset()
        reportError.mockReset()
        setOnline(true)
    })
    afterEach(() => vi.restoreAllMocks())

    it('fails the message and reports the error, as a mutation did', async () => {
        const bug = new TypeError('broken')
        sendMessage.mockRejectedValueOnce(bug)
        const hook = setUp()
        act(() => void hook.current.send('Lỗi của app'))

        await waitFor(() => expect(outgoing()[0]?.state).toBe('failed'))
        expect(reportError).toHaveBeenCalledWith(bug, expect.anything())
    })
})

describe('A send in a DM to someone I may no longer write to (09 DM-EDGE `lost-permission`, D-250)', () => {
    beforeEach(() => {
        sendMessage.mockReset()
        reportError.mockReset()
        setOnline(true)
    })

    it('refuses the message, not reported, and "Try again" sends nothing', async () => {
        sendMessage.mockRejectedValue(apiError(403, 'CANNOT_MESSAGE_USER'))
        const hook = setUp()
        act(() => void hook.current.send('Chào Tuấn'))

        await waitFor(() => expect(outgoing()[0]?.state).toBe('refused'))
        expect(reportError).not.toHaveBeenCalled()
        await act(async () => hook.current.retry(outgoing()[0]!.nonce))
        expect(sendMessage).toHaveBeenCalledTimes(1)
    })
})
