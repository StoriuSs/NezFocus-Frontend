import type { ServerOwnership } from '@/features/auth'
import { ownedServers } from '../lib/membership'
import { useMembershipDialogs } from '../membership-dialogs.store'
import { fetchServers } from './servers.api'
import { serverKeys } from './keys'
import type { Server } from '../types'

/**
 * The servers feature's answer to auth's ServerOwnership port, connected by
 * the AppShell. The list is read again first: a member who joined since it
 * was read decides it. Read it cannot (offline), the one in the cache does,
 * or none, and the API's own check refuses what it must.
 */
export const serverOwnership: ServerOwnership = {
    async owned(queryClient) {
        let servers: Server[] | undefined
        try {
            servers = await queryClient.fetchQuery({
                queryKey: serverKeys.list(),
                queryFn: fetchServers,
                staleTime: 0,
                // Offline, a query waits for the connection; this one fails
                // at once, so the list in the cache answers instead.
                networkMode: 'always'
            })
        } catch {
            servers = queryClient.getQueryData<Server[]>(serverKeys.list())
        }
        return ownedServers(servers ?? [])
    },
    showBlocked(servers, queryClient) {
        // The API may name a server the cache has not caught up with (made in
        // another tab, handed to them meanwhile): its row's handover reads it there.
        void queryClient.invalidateQueries({ queryKey: serverKeys.list() })
        useMembershipDialogs.getState().show({ kind: 'deletionBlocked', servers })
    }
}
