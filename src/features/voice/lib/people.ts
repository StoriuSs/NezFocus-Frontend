import type { RoomPerson } from '../types'

const active = (person: RoomPerson) => person.micOn || person.cameraOn || person.screenSharing

/**
 * The order people show in a room (C-06, C-18): oneself first, then those
 * with their mic or camera on, then by who joined first (the list comes in
 * that order). Worked out when the list is first shown; after that, as C-06
 * says, people keep their places: those gone leave, newcomers go to the end
 * (oneself still first), so a mic switched on moves no one. Friends come
 * before the rest in C-06; there are none yet (M6). Around a study room's
 * ring the Host comes right after oneself (C-18), when worked out afresh.
 *
 * `before`: the ids as last shown (none, or none still here: worked out afresh).
 * `host`: the study session's Host, if any.
 */
export function orderPeople(
    people: RoomPerson[],
    me: string | undefined,
    before: readonly string[],
    host?: string | null
): string[] {
    const here = new Set(people.map((person) => person.user.id))
    const kept = before.filter((id) => here.has(id))
    const ids =
        kept.length === 0
            ? [...people]
                  .sort(
                      (a, b) =>
                          Number(b.user.id === host) - Number(a.user.id === host) ||
                          Number(active(b)) - Number(active(a))
                  )
                  .map((person) => person.user.id)
            : [...kept, ...people.map((person) => person.user.id).filter((id) => !kept.includes(id))]
    return me && here.has(me) ? [me, ...ids.filter((id) => id !== me)] : ids
}

/** C-06: up to 10 people under a room in the list, then "+N people". */
export const LISTED_PEOPLE = 10

/**
 * The room page's grid (C-20 › Lưới): 1 column for one person, 2 up to 4, 3
 * up to 9, then 4; each tile at most this wide, 16:9 (480 × 270 for 1 to 4,
 * 320 for 5 to 9, 254 from 10), narrower when the page is.
 */
export function gridOf(count: number): { columns: number; maxWidth: number } {
    if (count <= 1) return { columns: 1, maxWidth: 480 }
    if (count <= 4) return { columns: 2, maxWidth: 480 }
    if (count <= 9) return { columns: 3, maxWidth: 320 }
    return { columns: 4, maxWidth: 254 }
}

/** The name a person shows by (D-108): their display name, else their username; none once deleted (D-182). */
export function personName(user: RoomPerson['user']): string | null {
    return user.displayName ?? user.username ?? null
}
