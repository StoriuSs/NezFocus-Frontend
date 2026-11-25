import type { Presence, Relationship } from '../types'

/*
 * How the list of relationships in the cache changes (pure): an answer or
 * an event puts an entry in its place, `none` takes the person out.
 */

/** `list` with `entry` in place of the one with the same person, or added; `none` removes them. */
export function withRelationship(list: Relationship[], entry: Relationship): Relationship[] {
    const others = list.filter((held) => held.user.id !== entry.user.id)
    return entry.type === 'none' ? others : [...others, entry]
}

/** `list` without `userId`. */
export function withoutPerson(list: Relationship[], userId: string): Relationship[] {
    return list.some((held) => held.user.id === userId) ? list.filter((held) => held.user.id !== userId) : list
}

/** A friend's presence changed; nobody else's is held (presence for friends only, D-242). */
export function withPresence(list: Relationship[], userId: string, status: Presence): Relationship[] {
    const index = list.findIndex((held) => held.user.id === userId && held.type === 'friend')
    const held = list[index]
    if (!held || held.presence === status) return list
    const next = [...list]
    next[index] = { ...held, presence: status }
    return next
}

/** How many requests to me wait (the Badge of the "Friends" row and the Pending tab, 09 › luật 4). */
export const incomingCountOf = (list: Relationship[] | undefined): number =>
    list?.filter((entry) => entry.type === 'incoming').length ?? 0

/** Whom I blocked, by id (a server's chat folds their messages, D-250). */
export const blockedIdsOf = (list: Relationship[] | undefined): string[] =>
    list?.filter((entry) => entry.type === 'blocked').map((entry) => entry.user.id) ?? []
