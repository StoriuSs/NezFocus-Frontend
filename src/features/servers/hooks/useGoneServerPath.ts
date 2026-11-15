import { useState } from 'react'
import { serverAfter } from '../lib/membership'
import { channelPath } from '../lib/paths'
import type { Server } from '../types'

/**
 * Where a page of a server goes once the server leaves the list while the
 * page shows it (deleted, kicked, banned, left in another tab; D-178): the
 * next server on the rail as it was, below it, else the one above, at its
 * first text channel; with none left, the Study page (03 S-SRV-04 Q7, 11
 * S-MOD-02 Q4). Null while the server is listed, and for one the page never
 * had in its list (an old address), which the page answers its own way.
 *
 * The last list that held the server is kept as state, set while drawing
 * (React's way of keeping what an earlier render saw).
 */
export function useGoneServerPath(serverId: string | undefined, servers: Server[] | undefined): string | null {
    const [held, setHeld] = useState<Server[] | null>(null)
    const listed = servers?.some((server) => server.id === serverId) ?? false
    if (listed && servers !== held) setHeld(servers ?? null)
    if (listed || !serverId || !held?.some((server) => server.id === serverId)) return null
    const next = serverAfter(
        held.filter((server) => server.id === serverId || servers?.some((now) => now.id === server.id)),
        serverId
    )
    return next ? channelPath(next) : '/study'
}
