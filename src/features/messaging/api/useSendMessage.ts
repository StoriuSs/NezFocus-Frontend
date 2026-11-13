import { useCallback, useEffect, useMemo, useRef } from 'react'
import { hashKey, useQueryClient } from '@tanstack/react-query'
import { onRealtimeEvent } from '@/features/realtime'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { getApiErrorType, NETWORK_ERROR, retryAfterSeconds } from '@/lib/api-error'
import { addOutgoing, addSaved, dropOutgoing, setOutgoingState } from '../lib/message-cache'
import type { ChannelMessages, MessageAuthor, OutgoingMessage, OutgoingState, RepliedMessage } from '../types'
import { messageKeys } from './keys'
import { sendMessage } from './messages.api'

/** Still on its way: a message typed after one of these waits behind it. A failed one holds nothing back. */
const ON_ITS_WAY = new Set<OutgoingState>(['sending', 'queued', 'waiting', 'rate-limited'])

/**
 * Sending in one channel (REQ-MSG-01, ARCHITECTURE 10.2). A message shows at
 * once, `sending`, with a nonce chosen here; the saved copy (this answer or
 * `message.created`, whichever comes first) takes its place. Otherwise
 * (C-10, S-CHAT-01):
 * - no network (offline when typed, or no answer): `waiting`, sent again
 *   when the browser is back online;
 * - too fast (429): `rate-limited`, sent again by itself after Retry-After;
 * - not found: the message was saved, then deleted before this answer came
 *   (a retry of its nonce, REQ-MSG-10), so the copy leaves without a word;
 * - anything else: `failed`, until "Try again" (the same nonce, so never
 *   twice, REQ-MSG-10) or "Discard".
 * One at a time per channel, in the order typed: a message typed while an
 * earlier one is still on its way is `queued` behind it, so a later message
 * never overtakes one waiting out the limit.
 * The row itself says what happened, so no error toast. A reply carries the
 * message it answers, quoted at once as the saved one will be (REQ-MSG-05).
 */
export function useSendMessage(channelId: string, author: MessageAuthor | undefined) {
    const client = useQueryClient()
    const key = useMemo(() => messageKeys.channel(channelId), [channelId])
    const update = useCallback(
        (change: (history: ChannelMessages) => ChannelMessages) =>
            client.setQueryData<ChannelMessages>(key, (history) => history && change(history)),
        [client, key]
    )
    const { mutateAsync } = useIdempotentMutation({
        mutationFn: (body: { content: string; nonce: string; replyToId?: string }, idempotencyKey: string) =>
            sendMessage(channelId, body, idempotencyKey),
        meta: { errorToast: false }
    })

    const outgoing = useCallback(
        () => client.getQueryData<ChannelMessages>(key)?.pages.at(-1)?.outgoing ?? [],
        [client, key]
    )

    // The next queued message goes once none before it is on its way.
    const next = useRef<() => void>(() => undefined)

    const deliver = useCallback(
        async ({ nonce, content, replyTo }: OutgoingMessage) => {
            update((history) => setOutgoingState(history, nonce, 'sending'))
            try {
                const saved = await mutateAsync({ content, nonce, ...(replyTo ? { replyToId: replyTo.id } : {}) })
                update((history) => addSaved(history, saved, nonce))
            } catch (error) {
                const wait = retryAfterSeconds(error)
                const type = getApiErrorType(error)
                if (type === NETWORK_ERROR) {
                    update((history) => setOutgoingState(history, nonce, 'waiting'))
                } else if (type === 'NOT_FOUND_ERROR') {
                    // Saved, then deleted before this retry's answer (REQ-MSG-10): nothing to show.
                    update((history) => dropOutgoing(history, nonce))
                } else if (wait) {
                    update((history) => setOutgoingState(history, nonce, 'rate-limited', Date.now() + wait * 1000))
                } else {
                    update((history) => setOutgoingState(history, nonce, 'failed'))
                }
            }
            next.current()
        },
        [mutateAsync, update]
    )

    useEffect(() => {
        next.current = () => {
            const head = outgoing().find((message) => ON_ITS_WAY.has(message.state))
            if (head?.state === 'queued') void deliver(head)
        }
    }, [outgoing, deliver])

    // Rate-limited messages go again at their time, armed again whenever the
    // history changes (a page left and opened again re-arms what is waiting).
    useEffect(() => {
        const timers = new Map<string, ReturnType<typeof setTimeout>>()
        const arm = () => {
            for (const message of outgoing()) {
                const id = `${message.nonce}@${message.retryAt}`
                if (message.state !== 'rate-limited' || !message.retryAt || timers.has(id)) continue
                timers.set(
                    id,
                    setTimeout(() => void deliver(message), Math.max(0, message.retryAt - Date.now()))
                )
            }
        }
        arm()
        const hash = hashKey(key)
        const stop = client.getQueryCache().subscribe((event) => {
            if (event.query.queryHash === hash) arm()
        })
        return () => {
            stop()
            timers.forEach(clearTimeout)
        }
    }, [client, key, outgoing, deliver])

    // What waits for the network goes when the browser is back online, when
    // the socket is live again (the API was down while the browser stayed
    // online), and when the channel is opened again online. Only the first:
    // those queued behind it follow in turn, each once the one before is saved.
    useEffect(() => {
        const retryWaiting = () => {
            if (!navigator.onLine) return
            const first = outgoing().find((message) => message.state === 'waiting')
            if (first) void deliver(first)
        }
        retryWaiting()
        window.addEventListener('online', retryWaiting)
        const stopReady = onRealtimeEvent('ready', retryWaiting)
        return () => {
            window.removeEventListener('online', retryWaiting)
            stopReady()
        }
    }, [outgoing, deliver])

    /** Whether the message was taken: not when blank, or before the history (where it shows) is loaded. */
    const send = useCallback(
        (text: string, replyTo?: RepliedMessage | null): boolean => {
            const content = text.trim()
            if (!content || !author || !client.getQueryData<ChannelMessages>(key)) return false
            const message: OutgoingMessage = {
                nonce: crypto.randomUUID(),
                channelId,
                content,
                author,
                createdAt: new Date().toISOString(),
                ...(replyTo ? { replyTo } : {}),
                state: outgoing().some((item) => ON_ITS_WAY.has(item.state))
                    ? 'queued'
                    : navigator.onLine
                      ? 'sending'
                      : 'waiting'
            }
            update((history) => addOutgoing(history, message))
            if (message.state === 'sending') void deliver(message)
            return true
        },
        [author, channelId, client, deliver, key, outgoing, update]
    )

    const retry = useCallback(
        async (nonce: string) => {
            const message = outgoing().find((item) => item.nonce === nonce)
            if (message) await deliver(message)
        },
        [outgoing, deliver]
    )

    const discard = useCallback(
        (nonce: string) => {
            update((history) => dropOutgoing(history, nonce))
            next.current()
        },
        [update]
    )

    return { send, retry, discard }
}
