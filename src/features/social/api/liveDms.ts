import type { QueryClient } from '@tanstack/react-query'
import { forgetReadState } from '@/features/messaging'
import { onRealtimeEvent } from '@/features/realtime'
import { isLastOf, withDm, withDmPresence, withEdited, withMessage, withoutDm, type HeardMessage } from '../lib/dm-list'
import type { Dm, DmCreated, DmUpdated, PresenceUpdated } from '../types'
import { forgetMessagesPlace } from '../lib/messages-place'
import { dmPath } from '../lib/paths'
import { socialKeys } from './keys'

const listening = new WeakSet<QueryClient>()

function update(client: QueryClient, change: (list: readonly Dm[]) => readonly Dm[]): void {
    client.setQueryData<readonly Dm[]>(socialKeys.dms(), (list) => list && change(list))
}

/**
 * Keeps my DM list live (SRS 5.2, D-244), the column's rows wherever I am:
 * `dm.created` / `dm.updated` from my other tabs (opened, closed: `shown`,
 * its read state let go as the backend's is, 💬 no longer coming back to it);
 * a message in a DM held makes it the last one, an edit of the last one
 * changes its words, a deletion of it reads the list again (which is last now
 * is the server's to say); `presence.updated` moves the dot; a change of a
 * relationship may change whether I may message someone (`can_message`), and
 * each `ready` may follow missed events: the list is read again.
 *
 * A message in a DM not held (shown again by it, or the first of someone
 * new) is not heard here: the read states read their list again for it, and
 * `useDms` reads this one when they hold a DM it has not.
 *
 * Once per query client, for the app's life. Returns the way to stop (the
 * first call only; tests use it).
 */
export function listenForDms(client: QueryClient): () => void {
    if (listening.has(client)) return () => undefined
    listening.add(client)
    const readAgain = () => void client.invalidateQueries({ queryKey: socialKeys.dms() })
    const deleted = (channelId: string, ids: readonly string[]) => {
        const list = client.getQueryData<readonly Dm[]>(socialKeys.dms())
        if (ids.some((id) => isLastOf(list, channelId, id))) readAgain()
    }
    const stops = [
        onRealtimeEvent('dm.created', (data) => update(client, (list) => withDm(list, (data as DmCreated).dm))),
        onRealtimeEvent('dm.updated', (data) => {
            const { dm, shown } = data as DmUpdated
            update(client, (list) => (shown ? withDm(list, dm) : withoutDm(list, dm.id)))
            if (shown) return
            forgetReadState(client, dm.id)
            forgetMessagesPlace(dmPath(dm.id))
        }),
        onRealtimeEvent('message.created', (data) =>
            update(client, (list) => withMessage(list, (data as { message: HeardMessage }).message))
        ),
        onRealtimeEvent('message.updated', (data) =>
            update(client, (list) => withEdited(list, (data as { message: HeardMessage }).message))
        ),
        onRealtimeEvent('message.deleted', (data) => {
            const { id, channelId } = data as { id: string; channelId: string }
            deleted(channelId, [id])
        }),
        onRealtimeEvent('message.bulk_deleted', (data) => {
            const { channelId, ids } = data as { channelId: string; ids: string[] }
            deleted(channelId, ids)
        }),
        onRealtimeEvent('presence.updated', (data) => {
            const { userId, status } = data as PresenceUpdated
            update(client, (list) => withDmPresence(list, userId, status))
        }),
        onRealtimeEvent('relationship.added', readAgain),
        onRealtimeEvent('relationship.updated', readAgain),
        onRealtimeEvent('relationship.removed', readAgain),
        onRealtimeEvent('ready', () => {
            if (client.getQueryState(socialKeys.dms())?.fetchStatus === 'idle') readAgain()
        })
    ]
    return () => {
        for (const stop of stops) stop()
        listening.delete(client)
    }
}
