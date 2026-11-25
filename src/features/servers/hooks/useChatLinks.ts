import { useMemo } from 'react'
import type { ChatLinks } from '@/features/social'
import { useServers } from '../api/useServers'
import { linkedServers, readAppLink, readChannelMention, type LinkedServer } from '../lib/app-links'
import { channelPath } from '../lib/paths'
import { serverInitials } from '../lib/server-name'

/** No server is open in a DM: every link and channel token names its server. */
const NO_SERVER = ''

/**
 * The servers feature's answer to the social feature's ChatLinks port
 * (D-249 L7-b), which the AppShell connects: how a link in a DM's message
 * and a channel token `<#id>` read, from the servers one is in, always with
 * the server's name (C-10: "trong DM kèm tên server"), and a server of the
 * profile panel's "SERVER CHUNG" (D-251): its name and picture as my list
 * has them, the way to it as the rail goes (its nearest channel). The same
 * object while the servers' names, channels and pictures stay the same, so
 * the chat's rows do not draw again.
 */
export function useChatLinks(): ChatLinks {
    const servers = useServers().data ?? []
    const linked = linkedServers(servers)
    const pictures = JSON.stringify(servers.map((server) => [server.id, server.iconUrl ?? null]))
    return useMemo(() => {
        const parsed = JSON.parse(linked) as LinkedServer[]
        const iconOf = new Map(JSON.parse(pictures) as [string, string | null][])
        const nameOf = new Map(parsed.map((server) => [server.id, server.name]))
        return {
            readLink: (href: string) =>
                readAppLink(href, { origin: window.location.origin, servers: parsed, serverId: NO_SERVER }),
            channel: (id: string) => readChannelMention(id, { servers: parsed, serverId: NO_SERVER }),
            server: (id: string, name: string) => {
                // Not in my list yet (joined in another tab a moment ago): the profile's name.
                const shown = nameOf.get(id) ?? name
                return {
                    name: shown,
                    iconUrl: iconOf.get(id) ?? null,
                    initials: serverInitials(shown),
                    path: channelPath(id)
                }
            }
        }
    }, [linked, pictures])
}
