import { useMemo } from 'react'
import type { InboxPlaces } from '@/features/notifications'
import { useServers } from '../api/useServers'
import { readChannelMention } from '../lib/app-links'
import { messagePath } from '../lib/paths'

/**
 * What the inbox (S-NOTI-01) takes from the servers list (D-197): an item's
 * channel and server by name (null when one is not in the server or no longer
 * views the channel, undefined while the list loads), a channel mentioned in
 * a message, and the path to a message (D-48).
 */
export function useInboxPlaces(): InboxPlaces {
    const servers = useServers().data
    return useMemo<InboxPlaces>(
        () => ({
            placeOf: (serverId, channelId) => {
                if (!servers) return undefined
                const server = servers.find((candidate) => candidate.id === serverId)
                const channel = server?.channels.find((candidate) => candidate.id === channelId)
                return server && channel ? { serverName: server.name, channelName: channel.name } : null
            },
            mentionChannel: (channelId, serverId) =>
                readChannelMention(channelId, { servers: servers ?? [], serverId }),
            messagePath
        }),
        [servers]
    )
}
