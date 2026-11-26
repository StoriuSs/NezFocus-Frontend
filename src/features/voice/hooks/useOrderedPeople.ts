import { useState } from 'react'
import { orderPeople } from '../lib/people'
import type { RoomPerson } from '../types'

/**
 * A room's people in the order they show (C-06, C-18, `orderPeople`), kept
 * from one render to the next: newcomers to the end, no one moving for a mic;
 * a study session's Host after oneself, then one's friends, when first
 * worked out. While one's friends are not known yet (`friends` null) the
 * order is worked out afresh each time and not kept, so friends read a
 * moment later still come first (D-254).
 */
export function useOrderedPeople(
    people: RoomPerson[],
    me: string | undefined,
    host: string | null | undefined,
    friends: ReadonlySet<string> | null
): RoomPerson[] {
    const [shown, setShown] = useState<string[]>([])
    const ids = orderPeople(people, me, friends ? shown : [], host, friends ?? undefined)
    // Adjusted while rendering (react.dev, "storing information from previous renders").
    if (friends && (ids.length !== shown.length || ids.some((id, index) => id !== shown[index]))) setShown(ids)
    const byId = new Map(people.map((person) => [person.user.id, person]))
    return ids.flatMap((id) => byId.get(id) ?? [])
}
