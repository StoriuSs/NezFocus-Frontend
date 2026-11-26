import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { blockedIdsOf, friendIdsOf, incomingCountOf } from '../lib/relationship-cache'
import { socialKeys } from './keys'
import { listenForRelationships } from './liveRelationships'
import { fetchRelationships } from './social.api'

/** The relationships as one query: its key and how it is read, for whoever shares it (the block list row). */
export const relationshipsQuery = {
    queryKey: socialKeys.relationships(),
    queryFn: fetchRelationships,
    staleTime: Infinity
}

/**
 * Friends, requests both ways and the people I blocked (S-DM-02, D-242),
 * read once as the app opens and kept live by the socket
 * (`listenForRelationships`), never read again on its own: 200 friends show
 * from the cache (SOCIAL-02).
 */
export function useRelationships() {
    const client = useQueryClient()
    useEffect(() => {
        // For the app's life, not this hook's: no stop on unmount.
        listenForRelationships(client)
    }, [client])
    return useQuery(relationshipsQuery)
}

/**
 * Requests to me waiting (the "Friends" row, 09 › luật 4); 0 until read.
 * Only the count: a friend's dot moving does not draw its reader again.
 */
export function useIncomingRequestCount(): number {
    const client = useQueryClient()
    useEffect(() => {
        listenForRelationships(client)
    }, [client])
    return useQuery({ ...relationshipsQuery, select: incomingCountOf }).data ?? 0
}

const NOBODY: ReadonlySet<string> = new Set()

/**
 * Whom I blocked, as a set the same from one render to the next while they
 * stay the same (the query's answer is shared structurally): a server's chat
 * and a room's fold their messages (02 S-CHAT-01 `blocked`, D-250). Nobody
 * until read.
 */
export function useBlockedIds(): ReadonlySet<string> {
    const client = useQueryClient()
    useEffect(() => {
        listenForRelationships(client)
    }, [client])
    const ids = useQuery({ ...relationshipsQuery, select: blockedIdsOf }).data
    return useMemo(() => (ids?.length ? new Set(ids) : NOBODY), [ids])
}

/**
 * My friends, as a set the same from one render to the next while they stay
 * the same: a room's people put them first (C-06, C-18), the Study page's
 * rows name them (C-44, D-254). Null while the list is not read yet, so an
 * order worked out meanwhile is not kept; nobody when it could not be read.
 */
export function useFriendIds(): ReadonlySet<string> | null {
    const client = useQueryClient()
    useEffect(() => {
        listenForRelationships(client)
    }, [client])
    const query = useQuery({ ...relationshipsQuery, select: friendIdsOf })
    const ids = query.data
    const failed = query.isError
    return useMemo(() => (ids ? (ids.length ? new Set(ids) : NOBODY) : failed ? NOBODY : null), [ids, failed])
}
