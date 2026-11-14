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

const { useSendMessage } = await import('../api/useSendMessage')
const { messageKeys } = await import('../api/keys')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')

const me = { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null }
const savedFrom = (body: { content: string }, id = 'm9'): Message => ({
    id,
    channelId: 'hoi-dap',
    type: 'regular',
    author: me,
    content: body.content,
    systemEvent: null,
    systemData: null,
    systemUser: null,
    pinned: false,
    reactions: [],
    replyTo: null,
    editedAt: null,
    createdAt: new Date().toISOString()
})
const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK')

let client: QueryClient
const history = () => client.getQueryData<ChannelMessages>(messageKeys.channel('hoi-dap'))!
const outgoing = () => history().pages[0]!.outgoing ?? []
const savedIds = () => history().pages[0]!.items.map((item) => item.id)

function setUp({ loaded = true, waiting = [] as string[] } = {}) {
    client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
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
    return renderHook(() => useSendMessage('hoi-dap', me), { wrapper }).result
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
