import { useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * A key for each time a link is followed to this page: the same link again
 * is a new visit (a message link jumps again), but a change of the search
 * alone is not, since a task's detail opens and closes over any page with
 * `?task=` (05 Q6) and the chat must not jump back to the linked message.
 */
export function useVisitKey(): string {
    const { key, pathname, search } = useLocation()
    const [seen, setSeen] = useState({ visit: key, key, pathname, search })
    if (seen.key === key) return seen.visit
    const sameVisit = seen.pathname === pathname && seen.search !== search
    const next = { visit: sameVisit ? seen.visit : key, key, pathname, search }
    setSeen(next)
    return next.visit
}
