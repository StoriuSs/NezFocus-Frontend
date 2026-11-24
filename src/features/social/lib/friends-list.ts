import { folded } from '@/lib/utils'
import type { FriendsTab, PendingSide, Presence, Relationship, SocialPerson } from '../types'

/*
 * What each tab of the Friends page lists, in what order (S-DM-02 ›
 * Tương tác, REQ-SOCIAL-02), and the search over it. Pure: the page passes
 * the list from the cache.
 */

/** A titled group of rows ("TRỰC TUYẾN — 6"); a group with no row is not shown. */
export interface FriendGroup {
    key: 'online' | 'offline' | PendingSide | 'blocked'
    rows: Relationship[]
}

/** The name shown: the display name, else the username; null for an account deleted (D-243). */
export const nameOf = (person: SocialPerson): string | null => person.displayName ?? person.username

/** Online first, then away, then do not disturb (SOCIAL-02); offline (and hidden) apart. */
const PRESENCE_RANK: Record<Presence, number> = { online: 0, idle: 1, dnd: 2, offline: 3 }

const isOnline = (entry: Relationship) => (entry.presence ?? 'offline') !== 'offline'

const collator = new Intl.Collator('vi', { sensitivity: 'base' })

/** By name as Vietnamese sorts it, case aside; ties by username; deleted accounts last. */
function byName(a: Relationship, b: Relationship): number {
    const nameA = nameOf(a.user)
    const nameB = nameOf(b.user)
    if (nameA === null || nameB === null) return nameA === nameB ? 0 : nameA === null ? 1 : -1
    return collator.compare(nameA, nameB) || (a.user.username ?? '').localeCompare(b.user.username ?? '')
}

const byPresenceThenName = (a: Relationship, b: Relationship) =>
    PRESENCE_RANK[a.presence ?? 'offline'] - PRESENCE_RANK[b.presence ?? 'offline'] || byName(a, b)

/** Newest first: a request just sent or received on top. */
const newestFirst = (a: Relationship, b: Relationship) => (b.since ?? '').localeCompare(a.since ?? '')

/** Whether someone matches what was typed: name or username, accents and case aside (S-DM-02 › Tìm). */
export function matches(entry: Relationship, query: string): boolean {
    const wanted = folded(query.trim())
    if (!wanted) return true
    return [nameOf(entry.user), entry.user.username].some((text) => text !== null && folded(text).includes(wanted))
}

/**
 * The groups of `tab`, searched: Online — friends not offline, by presence
 * then name; All — those, then the offline ones by name; Pending — the
 * chosen side, newest first; Blocked — by name.
 */
export function groupsOf(
    list: Relationship[],
    tab: FriendsTab,
    query: string,
    side: PendingSide = 'incoming'
): FriendGroup[] {
    const shown = list.filter((entry) => matches(entry, query))
    const friends = shown.filter((entry) => entry.type === 'friend')
    const online: FriendGroup = { key: 'online', rows: friends.filter(isOnline).sort(byPresenceThenName) }
    switch (tab) {
        case 'online':
            return [online]
        case 'all':
            return [online, { key: 'offline', rows: friends.filter((entry) => !isOnline(entry)).sort(byName) }]
        case 'pending':
            return [{ key: side, rows: shown.filter((entry) => entry.type === side).sort(newestFirst) }]
        case 'blocked':
            return [{ key: 'blocked', rows: shown.filter((entry) => entry.type === 'blocked').sort(byName) }]
    }
}

/** How many of each kind the list holds: whether the page is empty, the counts of the Pending switch. */
export function countsOf(list: Relationship[]): Record<RelationshipKind, number> {
    const counts: Record<RelationshipKind, number> = { friend: 0, incoming: 0, outgoing: 0, blocked: 0 }
    for (const entry of list) if (entry.type !== 'none') counts[entry.type] += 1
    return counts
}

type RelationshipKind = Exclude<Relationship['type'], 'none'>

/**
 * The tab the page opens on when the URL names none (S-DM-02 › Tab mặc
 * định): Pending when a request waits for me, Online otherwise.
 */
export const defaultTabOf = (list: Relationship[] | undefined): FriendsTab =>
    list?.some((entry) => entry.type === 'incoming') ? 'pending' : 'online'

/**
 * The groups as they were when the pointer came onto the list, with each
 * row's data as it is now (S-DM-02 › Thứ tự, as S-DM-01): a friend whose
 * presence changes keeps their place until the pointer leaves, so a row
 * never jumps under a click. Someone no longer of their group (a request
 * answered, someone unblocked) leaves at once.
 */
export function heldGroups(held: FriendGroup[], list: Relationship[]): FriendGroup[] {
    const now = new Map(list.map((entry) => [entry.user.id, entry]))
    return held.map((group) => ({
        key: group.key,
        rows: group.rows.flatMap((row) => {
            const current = now.get(row.user.id)
            return current && current.type === row.type ? [current] : []
        })
    }))
}
