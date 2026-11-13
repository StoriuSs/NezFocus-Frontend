import type { QueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { onRealtimeEvent } from '@/features/realtime'
import { addNewer, addSaved, lastSavedId, startOver } from '../lib/message-cache'
import type { ChannelMessages, Message } from '../types'
import { messageKeys } from './keys'
import { fetchMessages } from './messages.api'

/** The most a catch-up reads in one go; more missed than this, and the history starts over. */
const CATCH_UP_LIMIT = 100

const listening = new WeakSet<QueryClient>()
const isChannelKey = (key: readonly unknown[]) => key[0] === messageKeys.all[0] && key[1] === 'channel'

function listenToWindow(type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void): () => void {
    window.addEventListener(type, listener)
    return () => window.removeEventListener(type, listener)
}

/**
 * Keep every open channel history in the cache live (ARCHITECTURE 10.2,
 * 3.4): `message.created` goes into its channel's history when that history
 * is loaded (a channel never opened has nothing to keep), and each time the
 * socket is live again, every loaded history reads what it missed.
 *
 * A message heard while a history's first page is still on its way may be
 * missing from that page: once the page is in, the history catches up
 * (`after=<its newest id>`).
 *
 * Once per query client, for as long as the app runs: a history left on
 * another channel stays right for coming back. Signing out clears the cache.
 * While any message is still on its way (not failed), leaving or reloading
 * the page asks first (C-12 › Luật): it would be lost.
 *
 * Returns the way to stop (the first call only; tests use it).
 */
export function listenForMessages(client: QueryClient): () => void {
    if (listening.has(client)) return () => undefined
    listening.add(client)
    const heardWhileLoading = new Set<string>()

    const stops = [
        onRealtimeEvent('message.created', (data) => {
            const { message, nonce } = data as { message: Message; nonce?: string }
            const key = messageKeys.channel(message.channelId)
            if (client.getQueryState(key)?.status === 'pending') heardWhileLoading.add(message.channelId)
            client.setQueryData<ChannelMessages>(key, (history) => history && addSaved(history, message, nonce))
        }),
        onRealtimeEvent('ready', () => {
            for (const [key] of client.getQueriesData<ChannelMessages>({ queryKey: [...messageKeys.all, 'channel'] })) {
                void catchUp(client, key[2] as string)
            }
        }),
        listenToWindow('beforeunload', (event) => {
            const onItsWay = client
                .getQueriesData<ChannelMessages>({ queryKey: [...messageKeys.all, 'channel'] })
                .some(([, history]) => history?.pages.at(-1)?.outgoing?.some((message) => message.state !== 'failed'))
            if (onItsWay) event.preventDefault()
        }),
        client.getQueryCache().subscribe((event) => {
            if (event.type !== 'updated' || event.action.type !== 'success') return
            const key = event.query.queryKey
            const channelId = key[2] as string
            if (!isChannelKey(key) || !heardWhileLoading.delete(channelId)) return
            void catchUp(client, channelId)
        })
    ]
    return () => {
        stops.forEach((stop) => stop())
        listening.delete(client)
    }
}

/**
 * What one history missed while the socket was down: the messages after its
 * newest saved one. More than a page missed: the newest page alone, older
 * ones read again on scrolling up. A channel no longer readable (deleted,
 * access lost) is forgotten; any other failure leaves the history for the
 * next time the socket is live.
 */
async function catchUp(client: QueryClient, channelId: string): Promise<void> {
    const key = messageKeys.channel(channelId)
    const history = client.getQueryData<ChannelMessages>(key)
    if (!history) return
    const after = lastSavedId(history)
    try {
        const missed = after ? await fetchMessages(channelId, { after }, CATCH_UP_LIMIT) : undefined
        const latest = !missed || missed.hasMoreAfter ? await fetchMessages(channelId, null) : undefined
        client.setQueryData<ChannelMessages>(key, (now) => {
            if (!now) return now
            return latest ? startOver(now, latest) : addNewer(now, missed!)
        })
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) client.removeQueries({ queryKey: key })
    }
}
