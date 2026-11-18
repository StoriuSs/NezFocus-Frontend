import { useEffect, useMemo } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { markedRead, nextCursor, unreadCountOf, unreadRemovalsOf, withChannelHidden } from '../lib/inbox-cache'
import type { InboxPages, RemovalNotice } from '../types'
import { notificationKeys } from './keys'
import { listenForNotifications } from './liveNotifications'
import { fetchNotifications, markNotificationsRead } from './notifications.api'

/**
 * One's inbox (S-NOTI-01), newest first, 30 a page by cursor; read once and
 * kept live by the socket (`listenForNotifications`), never read again on
 * its own. The rail reads its first page at once, for the badge.
 */
export function useInbox() {
    const client = useQueryClient()
    useEffect(() => {
        // For the app's life, not this hook's: no stop on unmount.
        listenForNotifications(client)
    }, [client])
    return useInfiniteQuery({
        queryKey: notificationKeys.inbox(),
        queryFn: ({ pageParam }) => fetchNotifications(pageParam),
        initialPageParam: null as string | null,
        getNextPageParam: (last, _all, lastCursor) => nextCursor(last, lastCursor),
        staleTime: Infinity
    })
}

/** The rail's badge (C-05, 06 › Quy ước › Số): unread items of the channels one views; 0 until read. */
export function useUnreadNotificationCount(): number {
    return unreadCountOf(useInbox().data)
}

/**
 * The kicks and bans the inbox holds not read yet (11 S-MOD-02 › H1),
 * undefined until it is read: the servers feature says those it no longer
 * has in a Toast. Live as the badge is.
 */
export function useUnreadRemovals(): RemovalNotice[] | undefined {
    const pages = useInbox().data
    return useMemo(() => unreadRemovalsOf(pages), [pages])
}

/** Which items to mark: some, or every one up to the newest held ("Đọc hết", NOTIF-02). */
export type ReadWhich = { ids: string[] } | { beforeId: string }

/**
 * Marks items read (06 › Tương tác): the dots and the count at once; the
 * count after comes with `notification.read`, which the API sends on every
 * mark, in order with the other events: the answer's count is not taken, as
 * an item created meanwhile would be counted out of it. A failure reads the
 * inbox again, without a toast: the dot coming back says it, and the next
 * click tries again (as marking a channel read).
 */
export function useMarkNotificationsRead() {
    const client = useQueryClient()
    const key = notificationKeys.inbox()
    return useMutation({
        mutationFn: (which: ReadWhich) =>
            markNotificationsRead('ids' in which ? { ids: which.ids } : { all: true, beforeId: which.beforeId }),
        onMutate: async (which) => {
            // A read of the inbox on its way would answer with the items still unread.
            await client.cancelQueries({ queryKey: key })
            client.setQueryData<InboxPages>(key, (pages) => pages && markedRead(pages, which, new Date().toISOString()))
        },
        onError: () => void client.invalidateQueries({ queryKey: key }),
        meta: { errorToast: false }
    })
}

/**
 * A channel found no longer viewed (S-NOTI-EDGE `lost-access-tap`): its items
 * leave the inbox now; the API leaves them out from the next read.
 */
export function hideChannelItems(client: QueryClient, channelId: string): void {
    client.setQueryData<InboxPages>(notificationKeys.inbox(), (pages) => pages && withChannelHidden(pages, channelId))
}
