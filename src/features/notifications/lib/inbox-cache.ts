import type { InboxPages, Notification, NotificationList, NotificationsDeleted, NotificationsRead } from '../types'

/*
 * Changes to the inbox in the cache (S-NOTI-01), from socket events and from
 * what one does, as pure functions. Ids are UUIDv7: compared as text they
 * sort as time does, newest first in the list. The unread count is the first
 * page's: the count of every item, not only those held.
 */

/** Every item held, newest first. */
export const itemsOf = (pages: InboxPages | undefined): Notification[] =>
    pages?.pages.flatMap((page) => page.items) ?? []

/**
 * Where the page after `last` starts: after its oldest item; when events took
 * all its items out (a ban deleting messages), where `last` itself started,
 * so the list does not end early. None when there are no more.
 */
export const nextCursor = (last: NotificationList, lastCursor: unknown): string | null =>
    last.hasMore ? (last.items.at(-1)?.id ?? (typeof lastCursor === 'string' ? lastCursor : null)) : null

/** The rail's badge: unread items of the channels one views (C-05); 0 before the inbox is read. */
export const unreadCountOf = (pages: InboxPages | undefined): number => pages?.pages[0]?.unreadCount ?? 0

/** Each page's items changed by `change`, and the count set to `count(old)`. */
function changed(
    pages: InboxPages,
    change: (items: Notification[]) => Notification[],
    count: (old: number) => number
): InboxPages {
    return {
        ...pages,
        pages: pages.pages.map((page, index) => ({
            ...page,
            items: change(page.items),
            ...(index === 0 ? { unreadCount: Math.max(0, count(page.unreadCount)) } : {})
        }))
    }
}

/**
 * `notification.created`: the item in its place, counted when unread; once
 * only, the list read again may hold it already. Older than the whole first
 * page while more pages follow, it is left for those pages, only counted.
 */
export function withCreated(pages: InboxPages, item: Notification): InboxPages {
    if (itemsOf(pages).some((one) => one.id === item.id)) return pages
    const [first, ...rest] = pages.pages
    if (!first) return pages
    const at = first.items.findIndex((one) => one.id < item.id)
    const goesHere = at !== -1 || !first.hasMore
    const items = goesHere
        ? [
              ...first.items.slice(0, at === -1 ? first.items.length : at),
              item,
              ...first.items.slice(at === -1 ? first.items.length : at)
          ]
        : first.items
    return {
        ...pages,
        pages: [{ ...first, items, unreadCount: first.unreadCount + (item.readAt ? 0 : 1) }, ...rest]
    }
}

/** Whether an item is among those `which` names. */
const named = (which: { ids?: string[] | null; beforeId?: string | null }) => (item: Notification) =>
    !!which.ids?.includes(item.id) || (!!which.beforeId && item.id <= which.beforeId)

/** The items `which` names read at `at`, those read already keeping their time. */
const read = (which: { ids?: string[] | null; beforeId?: string | null }, at: string) => {
    const isNamed = named(which)
    return (items: Notification[]) =>
        items.map((item) => (isNamed(item) && !item.readAt ? { ...item, readAt: at } : item))
}

/** `notification.read` (another tab, the channel read, D-199): the items read, and the count the API gives. */
export function withRead(pages: InboxPages, event: NotificationsRead, at: string): InboxPages {
    return changed(pages, read(event, at), () => event.unreadCount)
}

/** `notification.deleted`: the items gone, those of a task deleted too (D-200); the count when it changed. */
export function withDeleted(pages: InboxPages, event: NotificationsDeleted): InboxPages {
    const gone = new Set(event.ids)
    const isGone = (item: Notification) => gone.has(item.id) || (!!event.taskId && item.taskId === event.taskId)
    return changed(
        pages,
        (items) => items.filter((item) => !isGone(item)),
        (old) => event.unreadCount ?? old
    )
}

/**
 * One's own marking, shown at once (06 › Tương tác): the items named read
 * and the count less those of them held unread; the answer's count follows.
 */
export function markedRead(pages: InboxPages, which: { ids: string[] } | { beforeId: string }, at: string): InboxPages {
    const isNamed = named(which)
    const newlyRead = itemsOf(pages).filter((item) => isNamed(item) && !item.readAt).length
    return changed(pages, read(which, at), (old) => old - newlyRead)
}

/**
 * A channel one no longer views, found when its item is clicked before the
 * inbox heard (S-NOTI-EDGE `lost-access-tap`): its items go, and their
 * unread ones from the count, as the API will leave them out.
 */
export function withChannelHidden(pages: InboxPages, channelId: string): InboxPages {
    const hidden = itemsOf(pages).filter((item) => item.channelId === channelId)
    const unread = hidden.filter((item) => !item.readAt).length
    return changed(
        pages,
        (items) => items.filter((item) => item.channelId !== channelId),
        (old) => old - unread
    )
}
