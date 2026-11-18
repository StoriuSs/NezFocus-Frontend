import type { QueryClient } from '@tanstack/react-query'
import { onRealtimeEvent } from '@/features/realtime'
import { userKeys, type UserProfile } from '@/features/users'
import { withCreated, withDeleted, withRead } from '../lib/inbox-cache'
import type { InboxPages, NotificationCreated, NotificationsDeleted, NotificationsRead } from '../types'
import { notificationKeys } from './keys'

const listening = new WeakSet<QueryClient>()

/**
 * Signals after which the channels one views may have changed while no item
 * did (D-178): the inbox is read again, the API leaving out the items of
 * channels one no longer views and bringing back those one views again
 * (REQ-NOTIF-03). Another member coming, changing or going changes nothing.
 */
const STANDING = [
    'server.updated',
    'channel.updated',
    'channel.deleted',
    'role.updated',
    'role.deleted',
    'member.joined',
    'member.updated',
    'member.left'
]
/** A burst of signals is one read, a little later... */
const GATHER_MS = 300
/** ...and the server's members do not all ask at once (D-178). */
const SPREAD_MS = 500

/** The inbox held changed by `change`; one not read yet stays unread. */
function update(client: QueryClient, change: (pages: InboxPages) => InboxPages): void {
    client.setQueryData<InboxPages>(notificationKeys.inbox(), (pages) => pages && change(pages))
}

/**
 * Keeps the inbox in the cache live (06 S-NOTI-01, SRS 5.2), whether it is
 * open or not, for the rail's badge: `notification.created` puts the item in
 * its place, `notification.read` (another tab, the channel read in it, D-199,
 * a server joined again reading its kicks and bans, D-202) marks items read, `notification.deleted` takes them out (a task deleted:
 * every item of it, D-200), each with the count after. Each `ready` (the
 * socket live again) reads the inbox again: events may have been missed
 * meanwhile. Once per query client, for the app's life.
 *
 * Returns the way to stop (the first call only; tests use it).
 */
export function listenForNotifications(client: QueryClient): () => void {
    if (listening.has(client)) return () => undefined
    listening.add(client)
    let timer: ReturnType<typeof setTimeout> | undefined
    const readAgain = () => void client.invalidateQueries({ queryKey: notificationKeys.all })
    const stops = [
        onRealtimeEvent('notification.created', (data) =>
            update(client, (pages) => withCreated(pages, (data as NotificationCreated).notification))
        ),
        onRealtimeEvent('notification.read', (data) =>
            update(client, (pages) => withRead(pages, data as NotificationsRead, new Date().toISOString()))
        ),
        onRealtimeEvent('notification.deleted', (data) =>
            update(client, (pages) => withDeleted(pages, data as NotificationsDeleted))
        ),
        onRealtimeEvent('ready', readAgain),
        ...STANDING.map((event) =>
            onRealtimeEvent(event, (data) => {
                const { userId } = data as { userId?: string }
                const me = client.getQueryData<UserProfile>(userKeys.profile())?.id
                if (event.startsWith('member.') && userId !== me) return
                if (timer) return
                timer = setTimeout(
                    () => {
                        timer = undefined
                        readAgain()
                    },
                    GATHER_MS + Math.random() * SPREAD_MS
                )
            })
        )
    ]
    return () => {
        clearTimeout(timer)
        for (const stop of stops) stop()
        listening.delete(client)
    }
}
