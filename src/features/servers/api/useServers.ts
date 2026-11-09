import { useQuery, type QueryClient } from '@tanstack/react-query'
import { fetchServers } from './servers.api'
import { serverKeys } from './keys'
import type { Server } from '../types'

/**
 * The servers of the rail and the channel list. Until M2 brings live updates
 * (D-143), the list is read again whenever the tab comes back into view, and
 * after each change one makes oneself.
 */
export function useServers() {
    return useQuery({ queryKey: serverKeys.list(), queryFn: fetchServers, refetchOnWindowFocus: true })
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
