import type { QueryClient } from '@tanstack/react-query'
import { onRealtimeEvent } from '@/features/realtime'
import { getApiErrorType, NETWORK_ERROR, retryAfterSeconds } from '@/lib/api-error'
import { reportError } from '@/lib/error-tracking'
import { generateIdempotencyKey } from '@/lib/idempotency'
import { useUploads } from '../attachment-tray.store'
import { addOutgoing, addSaved, dropOutgoing, setOutgoingFiles, setOutgoingState } from '../lib/message-cache'
import { goneFiles } from '../lib/upload-file'
import type { ChannelMessages, MessageAuthor, OutgoingMessage, OutgoingState, RepliedMessage } from '../types'
import { dropChannelUploads, markGone, removeUpload, retryUpload, whenUploaded } from './attachmentUploads'
import { messageKeys } from './keys'
import { sendMessage } from './messages.api'

/**
 * The messages on their way (REQ-MSG-01, ARCHITECTURE 10.2), outside React:
 * a message keeps going when its channel is left (S-CHAT-04 › Đổi kênh), its
 * files uploading, a rate limit waited out, the network waited for. Each
 * shows in its channel's history in the query cache, as `sending` at once,
 * with a nonce chosen here; the saved copy (this answer or `message.created`,
 * whichever comes first) takes its place. Otherwise (C-10, S-CHAT-01):
 * - no network (offline when typed, or no answer): `waiting`, sent again
 *   when the browser is back online or the socket is live again;
 * - too fast (429): `rate-limited`, sent again by itself after Retry-After;
 * - not found: the message was saved, then deleted before this answer came
 *   (a retry of its nonce, REQ-MSG-10), so the copy leaves without a word;
 * - anything else: `failed`, until "Try again" (the same nonce, so never
 *   twice, REQ-MSG-10) or "Discard".
 * One at a time per channel, in the order typed: a message typed while an
 * earlier one is still on its way is `queued` behind it, so a later message
 * never overtakes one waiting out the limit.
 *
 * Files (D-93): the tray's go with the message, which shows `sending` until
 * every one is uploaded and checked, and is sent then; one that fails makes
 * it `failed`, and "Try again" uploads only the files that failed, with the
 * same nonce. A file the backend no longer has (gone after 24 hours) fails
 * the same way. Discarding the message lets its files go.
 */

type OutgoingMentions = Pick<OutgoingMessage, 'mentionUsers' | 'mentionRoles' | 'mentionEveryone'>

/** Still on its way: a message typed after one of these waits behind it. A failed one holds nothing back. */
const ON_ITS_WAY = new Set<OutgoingState>(['sending', 'queued', 'waiting', 'rate-limited'])

/** Being sent right now, by nonce: "Thử lại" clicked twice sends it once. */
const delivering = new Set<string>()
/**
 * The Idempotency-Key of each message until it is saved, with the body it
 * went with: a retry of the same body after no answer is recognised by the
 * API if the first try went through; a different body (files uploaded again)
 * is a new key, or the old answer would come back for it.
 */
const keys = new Map<string, { key: string; body: string }>()
/** No answer while the browser says it is online (the API out of reach): tried again after this. */
const RETRY_UNREACHABLE_MS = 10_000

/** Rate-limited messages, and those the API did not answer, sent again at their time. */
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const listening = new WeakSet<QueryClient>()

const historyOf = (client: QueryClient, channelId: string) =>
    client.getQueryData<ChannelMessages>(messageKeys.channel(channelId))

const outgoingOf = (client: QueryClient, channelId: string) =>
    historyOf(client, channelId)?.pages.at(-1)?.outgoing ?? []

function update(client: QueryClient, channelId: string, change: (history: ChannelMessages) => ChannelMessages) {
    client.setQueryData<ChannelMessages>(messageKeys.channel(channelId), (history) => history && change(history))
}

/**
 * Sends again what waits, in every channel, when the browser is back online
 * and when the socket is live again (the API was down while the browser
 * stayed online). A channel's history leaving the cache (signing out clears
 * it; one that may no longer be read is forgotten) takes its messages with
 * it, and its files stop: nothing typed by one person is ever sent as
 * another (S-CHAT-04 › Edge case). Once per query client, for as long as the
 * app runs. Returns the way to stop (the first call only; tests use it).
 */
export function sendAlong(client: QueryClient): () => void {
    if (listening.has(client)) return () => undefined
    listening.add(client)
    const everyChannel = () => {
        for (const [key] of client.getQueriesData<ChannelMessages>({ queryKey: [...messageKeys.all, 'channel'] }))
            sendWaiting(client, key[2] as string)
    }
    window.addEventListener('online', everyChannel)
    const stopReady = onRealtimeEvent('ready', everyChannel)
    const stopRemoved = client.getQueryCache().subscribe((event) => {
        const key = event.query.queryKey
        if (event.type === 'removed' && key[0] === messageKeys.all[0] && key[1] === 'channel')
            dropChannelUploads(key[2] as string)
    })
    return () => {
        window.removeEventListener('online', everyChannel)
        stopReady()
        stopRemoved()
        listening.delete(client)
    }
}

/**
 * What waits for the network in one channel goes, the browser online: only
 * the first, those queued behind it following in turn, each once the one
 * before is saved. Also when the channel is opened again.
 */
export function sendWaiting(client: QueryClient, channelId: string): void {
    if (!navigator.onLine) return
    const first = outgoingOf(client, channelId).find((message) => message.state === 'waiting')
    if (first) void deliver(client, first)
}

/**
 * Whether the message was taken: not when it has no text and no file, or
 * before the history (where it shows) is loaded. `mentions`: as the
 * composer named them, drawn until the saved message names them
 * (REQ-MSG-03). The channel's tray goes with it.
 */
export function sendFrom(
    client: QueryClient,
    channelId: string,
    author: MessageAuthor | undefined,
    text: string,
    replyTo?: RepliedMessage | null,
    mentions?: OutgoingMentions
): boolean {
    const content = text.trim()
    const withFiles = (useUploads.getState().trays[channelId]?.length ?? 0) > 0
    if ((!content && !withFiles) || !author || !historyOf(client, channelId)) return false
    const files = withFiles ? useUploads.getState().take(channelId) : []
    const message: OutgoingMessage = {
        nonce: crypto.randomUUID(),
        channelId,
        content,
        author,
        createdAt: new Date().toISOString(),
        ...(replyTo ? { replyTo } : {}),
        ...mentions,
        ...(files.length ? { files } : {}),
        state: outgoingOf(client, channelId).some((item) => ON_ITS_WAY.has(item.state))
            ? 'queued'
            : navigator.onLine
              ? 'sending'
              : 'waiting'
    }
    update(client, channelId, (history) => addOutgoing(history, message))
    if (message.state === 'sending') void deliver(client, message)
    return true
}

/** "Try again" on a failed message: the same nonce; only the files that failed upload again. */
export async function retryMessage(client: QueryClient, channelId: string, nonce: string): Promise<void> {
    const message = outgoingOf(client, channelId).find((item) => item.nonce === nonce)
    if (!message) return
    // A file refused for its content can never be sent: it leaves the message (D-93).
    const { uploads } = useUploads.getState()
    const files = (message.files ?? []).filter((id) => uploads[id] && uploads[id].state !== 'rejected')
    // Nothing it could still send: it stays failed, its files showing why, for "Discard".
    if (!message.content && !files.length) return
    for (const id of message.files ?? []) if (!files.includes(id)) removeUpload(id)
    if (files.length !== (message.files?.length ?? 0))
        update(client, channelId, (history) => setOutgoingFiles(history, nonce, files))
    for (const id of files) retryUpload(id)
    await deliver(client, { ...message, files })
}

/** "Discard": the message and its files are let go, and the next one goes. */
export function discardMessage(client: QueryClient, channelId: string, nonce: string): void {
    const message = outgoingOf(client, channelId).find((item) => item.nonce === nonce)
    for (const id of message?.files ?? []) removeUpload(id)
    keys.delete(nonce)
    update(client, channelId, (history) => dropOutgoing(history, nonce))
    next(client, channelId)
}

/** The next queued message goes once none before it is on its way. */
function next(client: QueryClient, channelId: string): void {
    const head = outgoingOf(client, channelId).find((message) => ON_ITS_WAY.has(message.state))
    if (head?.state === 'queued') void deliver(client, head)
}

async function deliver(client: QueryClient, message: OutgoingMessage): Promise<void> {
    const { nonce, channelId, content, replyTo, files } = message
    if (delivering.has(nonce)) return
    delivering.add(nonce)
    clearTimeout(timers.get(nonce))
    timers.delete(nonce)
    const set = (state: OutgoingState, retryAt?: number) =>
        update(client, channelId, (history) => setOutgoingState(history, nonce, state, retryAt))
    set('sending')
    try {
        // Every file uploaded and checked first; one that fails fails the message (D-93).
        const attachments = files?.length ? await whenUploaded(files) : []
        if (!attachments) return set('failed')
        const body = {
            content,
            nonce,
            ...(replyTo ? { replyToId: replyTo.id } : {}),
            ...(attachments.length ? { attachmentIds: attachments.map((file) => file.id) } : {})
        }
        const sameBody = keys.get(nonce)?.body === JSON.stringify(body)
        const key = sameBody ? keys.get(nonce)!.key : generateIdempotencyKey()
        keys.set(nonce, { key, body: JSON.stringify(body) })
        try {
            const saved = await sendMessage(channelId, body, key)
            keys.delete(nonce)
            update(client, channelId, (history) => addSaved(history, saved, nonce))
            for (const id of files ?? []) useUploads.getState().drop(id)
        } catch (error) {
            failed(client, message, error, set)
        }
    } finally {
        delivering.delete(nonce)
        next(client, channelId)
    }
}

/** What an answer that is not the saved message makes of the message (see above). */
function failed(
    client: QueryClient,
    { nonce, channelId, files }: OutgoingMessage,
    error: unknown,
    set: (state: OutgoingState, retryAt?: number) => void
): void {
    const wait = retryAfterSeconds(error)
    const type = getApiErrorType(error)
    if (type === NETWORK_ERROR) {
        set('waiting')
        // The browser online, but no answer: no online event will come; try again a little later.
        if (navigator.onLine) later(nonce, RETRY_UNREACHABLE_MS, () => sendWaiting(client, channelId))
        return
    }
    if (type === 'NOT_FOUND_ERROR') {
        // Saved, then deleted before this retry's answer (REQ-MSG-10): nothing to show.
        for (const id of files ?? []) removeUpload(id)
        keys.delete(nonce)
        return update(client, channelId, (history) => dropOutgoing(history, nonce))
    }
    if (type === 'UPLOAD_FILE_NOT_FOUND') {
        // Gone after 24 hours: those files upload again on "Try again".
        markGone(goneFiles(error))
        return set('failed')
    }
    if (!wait) {
        // Not an answer of the API (those are reported by the backend): a bug of the app, as a mutation reported it.
        reportError(error, { outgoing_message: 'send' })
        return set('failed')
    }
    set('rate-limited', Date.now() + wait * 1000)
    later(nonce, wait * 1000, () => {
        const waiting = outgoingOf(client, channelId).find((item) => item.nonce === nonce)
        if (waiting?.state === 'rate-limited') void deliver(client, waiting)
    })
}

function later(nonce: string, ms: number, then: () => void): void {
    clearTimeout(timers.get(nonce))
    timers.set(nonce, setTimeout(then, ms))
}
