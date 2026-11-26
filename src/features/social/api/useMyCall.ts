import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MyCall } from '../types'
import { fetchMyCall } from './calls.api'
import { socialKeys } from './keys'
import { listenForCalls } from './liveCalls'

/** My calls as one query: its key and how it is read. */
export const myCallQuery = {
    queryKey: socialKeys.call(),
    queryFn: fetchMyCall,
    staleTime: Infinity
}

/**
 * The call I make or am in and the ones ringing to me (`GET /me/call`,
 * D-245), read as the app opens (`CallWatch`, not `ready`: D-242) and kept
 * live by the socket (`listenForCalls`). A share of it with `select`.
 */
export function useMyCall<T = MyCall>(select?: (my: MyCall) => T) {
    const client = useQueryClient()
    useEffect(() => {
        // For the app's life, not this hook's: no stop on unmount.
        listenForCalls(client)
    }, [client])
    return useQuery({ ...myCallQuery, select })
}
