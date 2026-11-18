import { useState } from 'react'
import { orderPeople } from '../lib/people'
import type { RoomPerson } from '../types'

/**
 * A room's people in the order they show (C-06, C-18, `orderPeople`), kept
 * from one render to the next: newcomers to the end, no one moving for a mic.
 */
export function useOrderedPeople(people: RoomPerson[], me: string | undefined): RoomPerson[] {
    const [shown, setShown] = useState<string[]>([])
    const ids = orderPeople(people, me, shown)
    // Adjusted while rendering (react.dev, "storing information from previous renders").
    if (ids.length !== shown.length || ids.some((id, index) => id !== shown[index])) setShown(ids)
    const byId = new Map(people.map((person) => [person.user.id, person]))
    return ids.flatMap((id) => byId.get(id) ?? [])
}
