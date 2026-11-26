import type { QueryClient } from '@tanstack/react-query'
import { onRealtimeEvent } from '@/features/realtime'
import { bindCallCache, callHeard, callsReadAgain, holdsSoFar } from '../lib/call-session'
import type { CallChanged } from '../types'
import { fetchMyCall } from './calls.api'
import { socialKeys } from './keys'

const listening = new WeakSet<QueryClient>()

/**
 * Keeps my calls live (SRS 5.2, D-242): `call.ringing` (a card on every
 * tab), `call.updated` (answered; ringing out in another tab of mine),
 * `call.ended`, each through `callHeard` (my calls in the cache, this tab's
 * own call, B6). Each `ready` may follow missed words: `GET /me/call` read
 * again, and a call of this tab no longer there let go.
 *
 * Once per query client, for the app's life. Returns the way to stop (the
 * first call only; tests use it).
 */
export function listenForCalls(client: QueryClient): () => void {
    if (listening.has(client)) return () => undefined
    listening.add(client)
    bindCallCache(client)
    const heard = (data: unknown) => callHeard((data as CallChanged).call)
    const stops = [
        onRealtimeEvent('call.ringing', heard),
        onRealtimeEvent('call.updated', heard),
        onRealtimeEvent('call.ended', heard),
        onRealtimeEvent('ready', () => {
            const since = holdsSoFar()
            void client.fetchQuery({ queryKey: socialKeys.call(), queryFn: fetchMyCall, staleTime: 0 }).then(
                (my) => callsReadAgain(my, since),
                () => undefined
            )
        })
    ]
    return () => {
        for (const stop of stops) stop()
        listening.delete(client)
    }
}
