import { useMemo } from 'react'
import type { ChatLinks } from '@/features/social'
import { useServers } from '../api/useServers'
import { linkedServers, readAppLink, readChannelMention, type LinkedServer } from '../lib/app-links'

/** No server is open in a DM: every link and channel token names its server. */
const NO_SERVER = ''

/**
 * The servers feature's answer to the social feature's ChatLinks port
 * (D-249 L7-b), which the AppShell connects: how a link in a DM's message
 * and a channel token `<#id>` read, from the servers one is in, always with
 * the server's name (C-10: "trong DM kèm tên server"). The same object while
 * the servers' names and channels stay the same, so the chat's rows do not
 * draw again.
 */
export function useChatLinks(): ChatLinks {
    const linked = linkedServers(useServers().data ?? [])
    return useMemo(() => {
        const servers = JSON.parse(linked) as LinkedServer[]
        return {
            readLink: (href: string) =>
                readAppLink(href, { origin: window.location.origin, servers, serverId: NO_SERVER }),
            channel: (id: string) => readChannelMention(id, { servers, serverId: NO_SERVER })
        }
    }, [linked])
}
