import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { incomingCountOf } from '../lib/relationship-cache'
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
