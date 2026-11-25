import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDmChannelIds } from '@/features/messaging'
import type { Dm } from '../types'
import { socialKeys } from './keys'
import { listenForDms } from './liveDms'
import { fetchDms } from './dms.api'

/** The DM list as one query: its key and how it is read. */
export const dmsQuery = {
    queryKey: socialKeys.dms(),
    queryFn: fetchDms,
    staleTime: Infinity
}

/**
 * My DMs (S-DM-01, D-244), read as the app opens (the AppShell, as the
 * relationships: no loading of their own when the column opens) and kept
 * live by the socket (`listenForDms`). The read states (messaging) say when
 * a DM comes back to the list, by a message after I closed it or the first
 * message of someone new: when they hold a DM this list has not, it is read
 * again, once for each such DM while they hold it.
 */
export function useDms() {
    const client = useQueryClient()
    useEffect(() => {
        // For the app's life, not this hook's: no stop on unmount.
        listenForDms(client)
    }, [client])
    const dms = useQuery(dmsQuery)
    const held = useDmChannelIds()
    const asked = useRef(new Set<string>())
    const { data, fetchStatus } = dms
    useEffect(() => {
        const inStates = held ? held.split(',') : []
        // One gone from the states (closed) is asked about again when it comes back.
        for (const id of asked.current) if (!inStates.includes(id)) asked.current.delete(id)
        if (!data || fetchStatus !== 'idle') return
        const listed = new Set(data.map((dm) => dm.id))
        const missing = inStates.filter((id) => !listed.has(id) && !asked.current.has(id))
        if (missing.length === 0) return
        for (const id of missing) asked.current.add(id)
        void client.invalidateQueries({ queryKey: socialKeys.dms() })
    }, [held, data, fetchStatus, client])
    return dms
}

/** A share of the DM list (the column's rows, one DM for its page), as a query: its data undefined until read. */
export function useDmList<T>(select: (dms: Dm[]) => T) {
    const client = useQueryClient()
    useEffect(() => {
        listenForDms(client)
    }, [client])
    return useQuery({ ...dmsQuery, select })
}
