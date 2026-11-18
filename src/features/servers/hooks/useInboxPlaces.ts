import { useMemo } from 'react'
import type { InboxPlaces } from '@/features/notifications'
import { useServers } from '../api/useServers'
import { readChannelMention } from '../lib/app-links'
import { channelPath, messagePath, serverSettingsPath } from '../lib/paths'

/**
 * What the inbox (S-NOTI-01) takes from the servers list (D-197): an item's
 * channel and server by name (null when one is not in the server or no longer
 * views the channel, undefined while the list loads), a channel mentioned in
 * a message, the path to a message (D-48); whether one is in a server, and
 * the paths to its first text channel and to its settings (a server item).
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
            messagePath,
            inServer: (serverId) => servers && servers.some((server) => server.id === serverId),
            // Without a channel, the server's page opens its first text channel.
            serverPath: (serverId) => channelPath(serverId),
            settingsPath: (serverId) => serverSettingsPath(serverId)
        }),
        [servers]
    )
}
