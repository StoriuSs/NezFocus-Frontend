import { io, type Socket } from 'socket.io-client'
import { toCamelCase } from './case-transform'

/**
 * The one socket.io connection of a tab (SRS 5.2, ARCHITECTURE 3.1). Loaded
 * with import() after the AppShell's first paint, so socket.io-client is not
 * in any download before it (CONSTRAINTS.md, performance).
 *
 * Knows no feature: what it needs comes in `options` (a ticket, what to do
 * with what it hears).
 */
export interface SocketOptions {
    /** The API's origin: socket.io is at `/socket.io` there. */
    url: string
    /** A fresh ticket (POST /realtime/ticket), bought before every attempt: each is spent once. */
    getTicket: () => Promise<string>
    /** `ready` came: live. `down`: lost, or never got in; trying again. */
    onStatus: (status: 'connected' | 'down') => void
    /**
     * This session ended (`session.revoked`, or a handshake refused as
     * AUTH_TOKEN_REVOKED). Resolves whether the person is still signed in
     * (another tab may have left a new session in the shared cookie, D-74):
     * then the socket connects again with a new ticket. Rejects when that
     * could not be found out (API unreachable): it is asked again later.
     */
    onSessionEnded: () => Promise<boolean>
    /** Every other event, its data in camelCase like the REST client's. */
    onEvent?: (event: string, data: unknown) => void
}

/** How long to wait before trying again after a refused handshake: doubling, up to 30 s. */
export const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000)

/**
 * Opens the connection and keeps it open until the returned function closes
 * it. socket.io reconnects by itself after a network drop; a handshake the
 * API refused it leaves alone, so this tries again with a new ticket, unless
 * the refusal says the session is over.
 *
 * Websocket only, no long-polling: with several API instances, polling needs
 * sticky sessions at the load balancer, a websocket does not.
 */
export function openSocket(options: SocketOptions): () => void {
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    let closed = false
    // One question per ending: `session.revoked` and the disconnect after it ask once.
    let ending: Promise<boolean> | undefined

    const tryAgainLater = () => {
        clearTimeout(retry)
        retry = setTimeout(() => socket.connect(), retryDelay(attempt++))
    }
    const sessionEnded = () => (ending ??= options.onSessionEnded())
    const reconnectIfSignedIn = () => {
        sessionEnded().then(
            (signedIn) => {
                ending = undefined
                if (signedIn && !closed) socket.connect()
            },
            () => {
                ending = undefined
                if (!closed) tryAgainLater()
            }
        )
    }

    const socket: Socket = io(options.url, {
        transports: ['websocket'],
        // Called before each attempt, so every attempt spends a new ticket.
        auth: (send) => {
            options.getTicket().then(
                (ticket) => send({ ticket }),
                // No ticket (offline, API down): the handshake is refused and retried.
                () => send({ ticket: '' })
            )
        }
    })

    socket.on('ready', () => {
        attempt = 0
        options.onStatus('connected')
    })
    socket.on('disconnect', (reason: string) => {
        options.onStatus('down')
        // The server cut it off (its session ended): socket.io will not reconnect by itself.
        if (reason === 'io server disconnect') reconnectIfSignedIn()
    })
    socket.on('connect_error', (error: Error & { data?: { type?: string } }) => {
        options.onStatus('down')
        // Still active: a network failure socket.io retries itself.
        if (socket.active || closed) return
        if (error.data?.type === 'AUTH_TOKEN_REVOKED') return reconnectIfSignedIn()
        tryAgainLater()
    })
    // Ask at once: signing out need not wait for the disconnect that follows.
    socket.on('session.revoked', () => void sessionEnded().catch(() => undefined))
    socket.onAny((event: string, data: unknown) => {
        if (event === 'ready' || event === 'session.revoked') return
        options.onEvent?.(event, toCamelCase(data))
    })

    return () => {
        closed = true
        clearTimeout(retry)
        socket.disconnect()
    }
}
