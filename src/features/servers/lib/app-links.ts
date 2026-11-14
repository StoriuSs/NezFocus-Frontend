import { matchPath } from 'react-router-dom'
import type { AppLink, MentionChannel } from '@/features/messaging'
import type { Server, ServerChannel } from '../types'
import { channelPath, isId, SERVERS_PATHS } from './paths'

/** What a link needs of a server: its name, and the channels they see. */
export type LinkedServer = Pick<Server, 'id' | 'name'> & {
    channels: Pick<ServerChannel, 'id' | 'name' | 'type'>[]
}

/**
 * What links read of the servers one is in, as text: the same text while
 * their names and channels stay the same, so the page can keep `readLink`
 * (and the chat's rows) unchanged when anything else about a server changes.
 */
export const linkedServers = (servers: LinkedServer[]): string =>
    JSON.stringify(
        servers.map(({ id, name, channels }) => ({
            id,
            name,
            channels: channels.map((channel) => ({ id: channel.id, name: channel.name, type: channel.type }))
        }))
    )

/**
 * A link in a message, as the chat shows it (REQ-MSG-05, D-48, D-117):
 * - a message of a text channel they see: a chip "#channel › Message", with
 *   the server's name when it is another server than the one open;
 * - a message they cannot see (a channel not theirs, a server they are not
 *   in): "Can't view", with no name, so nothing private shows;
 * - any other page of the app: opened in the app (chips for channels and
 *   invites come with M7);
 * - null: another site, opened in a new tab.
 */
export function readAppLink(
    href: string,
    { origin, servers, serverId }: { origin: string; servers: LinkedServer[]; serverId: string }
): AppLink | null {
    let url: URL
    try {
        url = new URL(href)
    } catch {
        return null
    }
    // `//host/…` is another site to the router, whatever the origin says: not a page of the app.
    if (url.origin !== origin || url.pathname.startsWith('//')) return null

    const match = matchPath(SERVERS_PATHS.message, url.pathname)
    if (!match) return { kind: 'page', to: `${url.pathname}${url.search}${url.hash}` }

    const server = servers.find((candidate) => candidate.id === match.params.serverId)
    const channel = server?.channels.find((candidate) => candidate.id === match.params.channelId)
    if (!server || channel?.type !== 'text' || !isId(match.params.messageId)) return { kind: 'hidden' }
    return {
        kind: 'message',
        to: url.pathname,
        ...(server.id === serverId ? {} : { server: server.name }),
        channel: channel.name
    }
}

/**
 * A <#id> token in a message (REQ-MSG-03, C-10): a channel of a server one is
 * in and sees, as a chip "#name" leading to it, the server named when it is
 * another one than the one open; any other id says nothing of what it is.
 */
export function readChannelMention(
    channelId: string,
    { servers, serverId }: { servers: LinkedServer[]; serverId: string }
): MentionChannel {
    for (const server of servers) {
        const channel = server.channels.find((candidate) => candidate.id === channelId)
        if (!channel) continue
        return {
            kind: 'channel',
            to: channelPath(server.id, channel.id),
            name: channel.name,
            ...(server.id === serverId ? {} : { server: server.name })
        }
    }
    return { kind: 'hidden' }
}
