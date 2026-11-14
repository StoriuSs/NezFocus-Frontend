import { useMemo } from 'react'
import type { MentionSource } from '@/features/messaging'
import { readChannelMention, type LinkedServer } from '../lib/app-links'
import { channelGroups } from '../lib/channel-list'
import { fetchMembers, fetchMentionableRoles } from './roles.api'
import { serverKeys } from './keys'
import type { Server } from '../types'

/** How long suggestions are read from the cache before asking again: a few keystrokes, a few mentions. */
const FRESH = 30_000
/** People read for one search; the chat keeps those whose name starts a word of it. */
const PEOPLE = 50

/**
 * The servers feature's answer to the chat's MentionSource port (REQ-MSG-03,
 * owner 14/11/2026): its members and mentionable roles read with this
 * feature's routes and keys (a member or a role changing reads them again),
 * the server's text channels in the list's order, how a channel token
 * shows, and one's own roles. The same object while none of these change,
 * so the chat's rows do not draw again; `linked` is `linkedServers` of the
 * server list.
 */
export function useMentionSource(
    server: Pick<Server, 'id' | 'roleIds' | 'categories' | 'channels'>,
    linked: string
): MentionSource {
    const { id: serverId } = server
    const roleIds = JSON.stringify(server.roleIds)
    const channels = JSON.stringify(
        channelGroups(server)
            .flatMap((group) => group.channels)
            .filter((channel) => channel.type === 'text')
            .map(({ id, name }) => ({ id, name }))
    )
    return useMemo<MentionSource>(() => {
        const servers = JSON.parse(linked) as LinkedServer[]
        return {
            members: (query) => ({
                queryKey: serverKeys.mentionMembers(serverId, query),
                queryFn: async () => {
                    const page = await fetchMembers(serverId, {
                        ...(query ? { q: query } : {}),
                        sort: 'name',
                        order: 'asc',
                        limit: PEOPLE
                    })
                    return page.items.map((member) => ({
                        id: member.userId,
                        username: member.username,
                        displayName: member.displayName,
                        avatarUrl: member.avatarUrl
                    }))
                },
                staleTime: FRESH
            }),
            roles: {
                queryKey: serverKeys.mentionableRoles(serverId),
                queryFn: () => fetchMentionableRoles(serverId),
                staleTime: FRESH
            },
            channels: JSON.parse(channels) as MentionSource['channels'],
            channel: (id) => readChannelMention(id, { servers, serverId }),
            roleIds: JSON.parse(roleIds) as string[]
        }
    }, [serverId, linked, channels, roleIds])
}
