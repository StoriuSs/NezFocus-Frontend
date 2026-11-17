import { describe, expect, it } from 'vitest'
import {
    itemsOf,
    nextCursor,
    markedRead,
    unreadCountOf,
    withChannelHidden,
    withCreated,
    withDeleted,
    withRead
} from '../lib/inbox-cache'
import type { InboxPages, Notification, NotificationList } from '../types'

const AT = '2026-11-17T14:47:00.000Z'

/** Ids sort as time does (UUIDv7): a later digit is a newer item. */
const item = (n: number, more: Partial<Notification> = {}): Notification => ({
    id: `0193a000-0000-7000-8000-00000000000${n}`,
    type: 'mention',
    serverId: 'nd',
    channelId: 'hoi-dap',
    messageId: `m${n}`,
    roleId: null,
    reason: 'user',
    actor: { id: 'minh', username: 'minh', displayName: 'Minh', avatarUrl: null },
    message: null,
    readAt: null,
    createdAt: AT,
    ...more
})
const page = (items: Notification[], unreadCount: number, hasMore = false): NotificationList => ({
    items,
    unreadCount,
    hasMore
})
const inbox = (...pages: NotificationList[]): InboxPages => ({
    pages,
    pageParams: pages.map((_, index) => (index === 0 ? null : pages[index - 1]!.items.at(-1)!.id))
})
const ids = (pages: InboxPages) => itemsOf(pages).map((one) => one.id.at(-1))

describe('withCreated', () => {
    it('puts a new item on top and counts it when unread', () => {
        const next = withCreated(inbox(page([item(3), item(2)], 2)), item(5))
        expect(ids(next)).toEqual(['5', '3', '2'])
        expect(unreadCountOf(next)).toBe(3)
    })

    it('does not count one already read', () => {
        const next = withCreated(inbox(page([item(3)], 1)), item(5, { readAt: AT }))
        expect(unreadCountOf(next)).toBe(1)
    })

    it('takes an item in once: the list read again may hold it already', () => {
        const held = inbox(page([item(5), item(3)], 2))
        expect(withCreated(held, item(5))).toBe(held)
    })

    it('puts an item older than the newest in its place', () => {
        expect(ids(withCreated(inbox(page([item(5), item(2)], 2)), item(3)))).toEqual(['5', '3', '2'])
    })

    it('leaves an item older than the whole first page to the pages after it', () => {
        const next = withCreated(inbox(page([item(5), item(4)], 3, true), page([item(2)], 3)), item(3))
        expect(ids(next)).toEqual(['5', '4', '2'])
        expect(unreadCountOf(next)).toBe(4)
    })

    it('puts it last when the list has no more', () => {
        expect(ids(withCreated(inbox(page([item(5)], 1)), item(3)))).toEqual(['5', '3'])
    })
})

describe('withRead', () => {
    it('marks the items named read and takes the count', () => {
        const next = withRead(
            inbox(page([item(3), item(2), item(1)], 3)),
            {
                ids: [item(2).id, item(1).id],
                beforeId: null,
                unreadCount: 1
            },
            AT
        )
        expect(itemsOf(next).map((one) => one.readAt)).toEqual([null, AT, AT])
        expect(unreadCountOf(next)).toBe(1)
    })

    it('marks every item up to beforeId on every page, not the newer ones', () => {
        const next = withRead(
            inbox(page([item(4), item(3)], 4, true), page([item(2)], 4)),
            {
                ids: null,
                beforeId: item(3).id,
                unreadCount: 1
            },
            AT
        )
        expect(itemsOf(next).map((one) => one.readAt)).toEqual([null, AT, AT])
    })

    it('keeps the time an item was read first', () => {
        const before = '2026-11-17T10:00:00.000Z'
        const next = withRead(
            inbox(page([item(3, { readAt: before })], 0)),
            {
                ids: [item(3).id],
                beforeId: null,
                unreadCount: 0
            },
            AT
        )
        expect(itemsOf(next)[0]!.readAt).toBe(before)
    })
})

describe('withDeleted', () => {
    it('takes the items out and the new count', () => {
        const next = withDeleted(inbox(page([item(3), item(2)], 2)), { ids: [item(3).id], unreadCount: 1 })
        expect(ids(next)).toEqual(['2'])
        expect(unreadCountOf(next)).toBe(1)
    })

    it('keeps the count when it did not change', () => {
        const next = withDeleted(inbox(page([item(3, { readAt: AT }), item(2)], 1)), {
            ids: [item(3).id],
            unreadCount: null
        })
        expect(unreadCountOf(next)).toBe(1)
    })
})

describe('markedRead', () => {
    it('marks one item read at once and counts one less', () => {
        const next = markedRead(inbox(page([item(3), item(2)], 2)), { ids: [item(2).id] }, AT)
        expect(itemsOf(next).map((one) => one.readAt)).toEqual([null, AT])
        expect(unreadCountOf(next)).toBe(1)
    })

    it('counts only the items that were unread', () => {
        const next = markedRead(inbox(page([item(3, { readAt: AT })], 1)), { ids: [item(3).id] }, AT)
        expect(unreadCountOf(next)).toBe(1)
    })

    it('marks every item up to beforeId; unread ones not yet read in stay counted', () => {
        const next = markedRead(
            inbox(page([item(4), item(3)], 5, true), page([item(2)], 5)),
            {
                beforeId: item(3).id
            },
            AT
        )
        expect(itemsOf(next).map((one) => one.readAt)).toEqual([null, AT, AT])
        expect(unreadCountOf(next)).toBe(3)
    })
})

describe('withChannelHidden', () => {
    it('takes out the items of a channel one no longer views, and their unread ones from the count', () => {
        const next = withChannelHidden(
            inbox(page([item(3), item(2, { channelId: 'tai-lieu' }), item(1, { readAt: AT })], 2)),
            'hoi-dap'
        )
        expect(ids(next)).toEqual(['2'])
        expect(unreadCountOf(next)).toBe(1)
    })
})

describe('nextCursor', () => {
    it('reads on after the oldest item held, none when there are no more', () => {
        expect(nextCursor(page([item(5), item(4)], 0, true), null)).toBe(item(4).id)
        expect(nextCursor(page([item(5)], 0, false), null)).toBeNull()
    })

    it('keeps the cursor of a page whose items all went (a ban deleting messages), not ending the list', () => {
        expect(nextCursor(page([], 0, true), item(4).id)).toBe(item(4).id)
    })
})

describe('unreadCountOf', () => {
    it('is 0 before the inbox is read', () => {
        expect(unreadCountOf(undefined)).toBe(0)
    })
})
