import { useQuery, type QueryClient } from '@tanstack/react-query'
import { fetchServers } from './servers.api'
import { serverKeys } from './keys'
import type { Server } from '../types'

/**
 * The servers of the rail and the channel list. Until M2 brings live updates
 * (D-143), the list is read again whenever the tab comes back into view, and
 * after each change one makes oneself. `'always'`: `true` would only read a
 * list older than the app's 5-minute stale time (L9b e2e, D-143).
 */
export function useServers() {
    return useQuery({ queryKey: serverKeys.list(), queryFn: fetchServers, refetchOnWindowFocus: 'always' })
}

/** Put a server one just made at the end of the rail (C-05), or update it in place. */
export function rememberServer(queryClient: QueryClient, server: Server) {
    queryClient.setQueryData<Server[]>(serverKeys.list(), (servers) => {
        if (!servers) return [server]
        return servers.some((known) => known.id === server.id)
            ? servers.map((known) => (known.id === server.id ? server : known))
            : [...servers, server]
    })
}

/**
 * Take a server one left or deleted off the rail, and drop what was read
 * about it. `setQueryData` is marked manual, so useServerGoneWatch does not
 * say "You are no longer in" about it.
 */
export function forgetServer(queryClient: QueryClient, serverId: string) {
    queryClient.setQueryData<Server[]>(serverKeys.list(), (servers) =>
        servers?.filter((server) => server.id !== serverId)
    )
    for (const key of [
        serverKeys.members(serverId),
        serverKeys.roles(serverId),
        serverKeys.invites(serverId),
        serverKeys.bans(serverId)
    ]) {
        queryClient.removeQueries({ queryKey: key })
    }
}
