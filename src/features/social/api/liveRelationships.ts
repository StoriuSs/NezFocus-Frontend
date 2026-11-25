import type { QueryClient } from '@tanstack/react-query'
import { onRealtimeEvent } from '@/features/realtime'
import { withActivity, withoutPerson, withPresence, withRelationship } from '../lib/relationship-cache'
import type {
    ActivityUpdated,
    PersonProfile,
    PresenceUpdated,
    Relationship,
    RelationshipChanged,
    RelationshipRemoved
} from '../types'
import { socialKeys } from './keys'

const listening = new WeakSet<QueryClient>()

/** The list held changed by `change`; one not read yet stays unread. */
function update(client: QueryClient, change: (list: Relationship[]) => Relationship[]): void {
    client.setQueryData<Relationship[]>(socialKeys.relationships(), (list) => list && change(list))
}

/**
 * Keeps the relationships in the cache live (SRS 5.2, D-242), whether the
 * Friends page is open or not, for the Badge of its row:
 * `relationship.added` / `relationship.updated` put the entry in its place
 * (as the other tab, or the other person, changed it), `relationship.removed`
 * takes the person out, `presence.updated` moves a friend's dot,
 * `activity.updated` changes a friend's activity line, and the activity of
 * the profile held of them (S-CHAT-05, C-50; D-252). Each `ready`
 * (the socket live again) reads the list again: events may have been missed.
 * Once per query client, for the app's life.
 *
 * Returns the way to stop (the first call only; tests use it).
 */
export function listenForRelationships(client: QueryClient): () => void {
    if (listening.has(client)) return () => undefined
    listening.add(client)
    const changed = (data: unknown) =>
        update(client, (list) => withRelationship(list, (data as RelationshipChanged).relationship))
    const stops = [
        onRealtimeEvent('relationship.added', changed),
        onRealtimeEvent('relationship.updated', changed),
        onRealtimeEvent('relationship.removed', (data) =>
            update(client, (list) => withoutPerson(list, (data as RelationshipRemoved).userId))
        ),
        onRealtimeEvent('presence.updated', (data) => {
            const { userId, status } = data as PresenceUpdated
            update(client, (list) => withPresence(list, userId, status))
        }),
        onRealtimeEvent('activity.updated', (data) => {
            const { userId, activity } = data as ActivityUpdated
            update(client, (list) => withActivity(list, userId, activity))
            client.setQueryData<PersonProfile>(
                socialKeys.profile(userId),
                (profile) => profile && { ...profile, activity }
            )
        }),
        onRealtimeEvent('ready', () => void client.invalidateQueries({ queryKey: socialKeys.relationships() }))
    ]
    return () => {
        for (const stop of stops) stop()
        listening.delete(client)
    }
}
