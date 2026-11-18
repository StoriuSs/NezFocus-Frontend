import { useQuery, type QueryClient } from '@tanstack/react-query'
import { forgetChannels } from '@/features/messaging'
import { forgetPlaces } from '@/lib/gone-places'
import { fetchServers } from './servers.api'
import { serverKeys } from './keys'
import type { Server } from '../types'

/**
 * The servers of the rail and the channel list, kept live by socket events
 * (`listenForServers`, D-178): each change reads its server again, and the
 * whole list is read again when the socket is live again. Not on coming back
 * to the tab, as M1 did (D-143): nothing is missed while the socket is up.
 */
export function useServers() {
    return useQuery({ queryKey: serverKeys.list(), queryFn: fetchServers })
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
 * about it, its channels' histories too (their trays stop with them).
 * `setQueryData` is marked manual, so useServerGoneWatch does not let go of
 * it a second time.
 */
export function forgetServer(queryClient: QueryClient, serverId: string) {
    const gone = queryClient.getQueryData<Server[]>(serverKeys.list())?.find((server) => server.id === serverId)
    queryClient.setQueryData<Server[]>(serverKeys.list(), (servers) =>
        servers?.filter((server) => server.id !== serverId)
    )
    forgetServerData(queryClient, gone ?? { id: serverId, channels: [] })
}

/** What was read about a server no longer listed: its lists, and its channels' histories. */
export function forgetServerData(queryClient: QueryClient, server: Pick<Server, 'id' | 'channels'>) {
    const serverId = server.id
    forgetPlaces([serverId])
    forgetChannels(
        queryClient,
        server.channels.map((channel) => channel.id)
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
