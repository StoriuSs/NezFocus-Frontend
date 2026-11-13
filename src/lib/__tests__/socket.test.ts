import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** A stand-in for socket.io-client's socket: handlers kept by event, fired by the test. */
class FakeSocket {
    handlers = new Map<string, ((...args: unknown[]) => void)[]>()
    anyHandlers: ((event: string, data: unknown) => void)[] = []
    active = true
    connects = 0
    disconnected = false
    options: { auth: (send: (data: object) => void) => void; transports: string[] }
    url: string
    constructor(url: string, options: FakeSocket['options']) {
        this.url = url
        this.options = options
    }
    on(event: string, handler: (...args: unknown[]) => void) {
        this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
        return this
    }
    onAny(handler: (event: string, data: unknown) => void) {
        this.anyHandlers.push(handler)
        return this
    }
    connect() {
        this.connects++
    }
    disconnect() {
        this.disconnected = true
    }
    /** As if the server sent `event`. */
    fire(event: string, ...args: unknown[]) {
        for (const handler of this.handlers.get(event) ?? []) handler(...args)
        if (!['connect_error', 'disconnect'].includes(event)) for (const any of this.anyHandlers) any(event, args[0])
    }
}

let socket: FakeSocket
vi.mock('socket.io-client', () => ({
    io: (url: string, options: FakeSocket['options']) => (socket = new FakeSocket(url, options))
}))

const { openSocket, retryDelay } = await import('../socket')

function open(stillSignedIn = false) {
    const calls = { status: [] as string[], ended: 0, events: [] as [string, unknown][] }
    const close = openSocket({
        url: 'http://api.test',
        getTicket: async () => 'ticket-1',
        onStatus: (status) => calls.status.push(status),
        onSessionEnded: async () => {
            calls.ended++
            return stillSignedIn
        },
        onEvent: (event, data) => calls.events.push([event, data])
    })
    return { calls, close }
}

const refused = (type: string) => Object.assign(new Error('refused'), { data: { type } })

describe('The tab socket', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('opens over websocket only, at the API origin, with a fresh ticket for each attempt', async () => {
        open()
        expect(socket.url).toBe('http://api.test')
        expect(socket.options.transports).toEqual(['websocket'])

        const sent = await new Promise((resolve) => socket.options.auth(resolve))
        expect(sent).toEqual({ ticket: 'ticket-1' })
    })

    it('sends an empty ticket when none could be bought, so the handshake is refused and retried', async () => {
        openSocket({
            url: 'http://api.test',
            getTicket: () => Promise.reject(new Error('offline')),
            onStatus: () => undefined,
            onSessionEnded: async () => false
        })
        const sent = await new Promise((resolve) => socket.options.auth(resolve))
        expect(sent).toEqual({ ticket: '' })
    })

    it('is connected on ready, and down when lost', () => {
        const { calls } = open()
        socket.fire('ready', { server_time: 'now' })
        socket.fire('disconnect', 'transport close')
        expect(calls.status).toEqual(['connected', 'down'])
    })

    it('tries again with a new ticket after a refused handshake, waiting longer each time', () => {
        const { calls } = open()
        socket.active = false

        socket.fire('connect_error', refused('AUTH_TOKEN_INVALID'))
        vi.advanceTimersByTime(999)
        expect(socket.connects).toBe(0)
        vi.advanceTimersByTime(1)
        expect(socket.connects).toBe(1)

        socket.fire('connect_error', refused('AUTH_TOKEN_INVALID'))
        vi.advanceTimersByTime(2000)
        expect(socket.connects).toBe(2)
        expect(calls.status).toEqual(['down', 'down'])
        expect(calls.ended).toBe(0)
    })

    it('leaves a network failure to socket.io, which retries by itself', () => {
        open()
        socket.fire('connect_error', new Error('xhr poll error'))
        vi.advanceTimersByTime(60_000)
        expect(socket.connects).toBe(0)
    })

    it('says the session ended when the handshake says so, and stops trying', () => {
        const { calls } = open()
        socket.active = false
        socket.fire('connect_error', refused('AUTH_TOKEN_REVOKED'))
        vi.advanceTimersByTime(60_000)
        expect(calls.ended).toBe(1)
        expect(socket.connects).toBe(0)
    })

    it('says the session ended on session.revoked', () => {
        const { calls } = open()
        socket.fire('session.revoked', {})
        expect(calls.ended).toBe(1)
        expect(calls.events).toEqual([])
    })

    it('connects again with a new ticket when the session ended but the account is still signed in (D-74)', async () => {
        // Another tab reset the password: the shared cookie holds a new session.
        open(true)
        socket.fire('session.revoked', {})
        socket.active = false
        socket.fire('disconnect', 'io server disconnect')
        await vi.runAllTimersAsync()
        expect(socket.connects).toBe(1)
    })

    it('connects again after a handshake refused as revoked, when still signed in', async () => {
        open(true)
        socket.active = false
        socket.fire('connect_error', refused('AUTH_TOKEN_REVOKED'))
        await vi.runAllTimersAsync()
        expect(socket.connects).toBe(1)
    })

    it('stays closed when the session ended and nobody is signed in any more', async () => {
        open(false)
        socket.fire('session.revoked', {})
        socket.active = false
        socket.fire('disconnect', 'io server disconnect')
        await vi.runAllTimersAsync()
        expect(socket.connects).toBe(0)
    })

    it('hands other events on in camelCase', () => {
        const { calls } = open()
        socket.fire('message.created', { channel_id: 'c1', message: { author_id: 'u1' } })
        expect(calls.events).toEqual([['message.created', { channelId: 'c1', message: { authorId: 'u1' } }]])
    })

    it('closes for good: no retry after it is closed', () => {
        const { close } = open()
        socket.active = false
        close()
        socket.fire('connect_error', refused('AUTH_TOKEN_INVALID'))
        vi.advanceTimersByTime(60_000)
        expect(socket.disconnected).toBe(true)
        expect(socket.connects).toBe(0)
    })

    it('waits at most 30 seconds between attempts', () => {
        expect([0, 1, 2, 5, 10].map(retryDelay)).toEqual([1000, 2000, 4000, 30_000, 30_000])
    })
})
