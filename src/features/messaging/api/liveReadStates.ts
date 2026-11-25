import type { QueryClient } from '@tanstack/react-query'
import { onRealtimeEvent } from '@/features/realtime'
import { isBlockedIn, userKeys, type UserProfile } from '@/features/users'
import { hearDeleted, hearEdited, hearMessage, keepState, type Heard } from '../lib/read-state-cache'
import type { BareMessage, ReadState } from '../types'
import { messageKeys } from './keys'

/** How long after the first event that needs the list read again it is read: once for the whole burst. */
const REFETCH_DELAY_MS = 1000

const listening = new WeakSet<QueryClient>()

/**
 * Keep the read states live (REQ-MSG-09, ARCHITECTURE 10.2): a message from
 * someone else makes its channel unread (and mentions the reader, D-39), the
 * reader's own mark from another tab or device comes as `read_state.updated`
 * and is kept only when not behind the one held (D-173). What the client
 * cannot count itself (a role mention, a reply to a deleted message, an edit
 * or a deletion after the mark, one by one or a ban's batch, a channel with no state yet) reads the list
 * again a second after the first of a burst, once for it; so does each
 * `ready` (the socket live again: what was missed meanwhile, or a first
 * reading that failed).
 *
 * Once per query client, for as long as the app runs. Returns the way to
 * stop (the first call only; tests use it).
 */
export function listenForReadStates(client: QueryClient): () => void {
    if (listening.has(client)) return () => undefined
    listening.add(client)
    const key = messageKeys.readStates()
    let timer: ReturnType<typeof setTimeout> | undefined
    const readAgain = () => void client.invalidateQueries({ queryKey: key })

    const apply = ({ states, refetch }: Heard) => {
        if (states !== client.getQueryData(key)) client.setQueryData(key, states)
        if (!refetch || timer) return
        timer = setTimeout(() => {
            timer = undefined
            readAgain()
        }, REFETCH_DELAY_MS)
    }

    const stops = [
        onRealtimeEvent('message.created', (data) => {
            const { message } = data as { message: BareMessage }
            const me = client.getQueryData<UserProfile>(userKeys.profile())?.id
            // Whom the reader blocked, through the users feature's port (D-250): never unread.
            apply(hearMessage(client.getQueryData<ReadState[]>(key), message, me, (id) => isBlockedIn(client, id)))
        }),
        onRealtimeEvent('message.updated', (data) => {
            const { message } = data as { message: BareMessage }
            const me = client.getQueryData<UserProfile>(userKeys.profile())?.id
            apply(hearEdited(client.getQueryData<ReadState[]>(key), message, me))
        }),
        onRealtimeEvent('message.deleted', (data) => {
            const { id, channelId } = data as { id: string; channelId: string }
            apply(hearDeleted(client.getQueryData<ReadState[]>(key), channelId, id))
        }),
        // A batch of a ban's (D-181): as each of its messages deleted alone.
        onRealtimeEvent('message.bulk_deleted', (data) => {
            const { channelId, ids } = data as { channelId: string; ids: string[] }
            for (const id of ids) apply(hearDeleted(client.getQueryData<ReadState[]>(key), channelId, id))
        }),
        onRealtimeEvent('read_state.updated', (data) => {
            client.setQueryData<ReadState[]>(key, (states) => keepState(states, data as ReadState))
        }),
        onRealtimeEvent('ready', () => {
            // Not while the first reading is on its way: it answers for now.
            if (client.getQueryState(key)?.fetchStatus === 'idle') readAgain()
        })
    ]
    return () => {
        clearTimeout(timer)
        stops.forEach((stop) => stop())
        listening.delete(client)
    }
}
