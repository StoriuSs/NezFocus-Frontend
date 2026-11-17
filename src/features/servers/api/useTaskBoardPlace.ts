import { useCallback, useMemo } from 'react'
import type { PlaceOf, TaskBoardPlace } from '@/features/tasks'
import { isTimedOut } from '../lib/moderation'
import { channelPath } from '../lib/paths'
import { can } from '../lib/permissions'
import type { Server, ServerChannel } from '../types'
import { serverKeys } from './keys'
import { fetchMembers } from './roles.api'
import { useServers } from './useServers'

/** How long the people found are read from the cache before asking again: a few keystrokes. */
const FRESH = 30_000
/** People read for one search; the picker scrolls (C-25 `multi`, 320 high). */
const PEOPLE = 100

/**
 * The servers feature's answer to the Task Board's port (S-TASK-01): the
 * channel and server names, what one may do with tasks there (REQ-TASK-02,
 * read from the channel's permission bits; a timeout leaves viewing only,
 * D-188, unless MANAGE_TASKS stays: the owner and ADMINISTRATOR), and the
 * members who view the channel, by name (D-192), read with this feature's
 * routes and keys (a member or a role changing reads them again).
 */
export function taskBoardPlace(
    { id: serverId, name: serverName, timeoutUntil }: Pick<Server, 'id' | 'name' | 'timeoutUntil'>,
    { id: channelId, name: channelName, permissions }: Pick<ServerChannel, 'id' | 'name' | 'permissions'>,
    openSettings: () => void
): TaskBoardPlace {
    const manage = can(permissions, 'MANAGE_TASKS')
    return {
        channelId,
        channelName,
        serverName,
        create: can(permissions, 'CREATE_TASKS'),
        manage,
        manageChannel: can(permissions, 'MANAGE_CHANNELS'),
        timedOut: !manage && isTimedOut({ timeoutUntil }, new Date()),
        candidates: (query) => ({
            queryKey: serverKeys.channelViewers(serverId, channelId, query),
            queryFn: async () => {
                const page = await fetchMembers(serverId, {
                    ...(query ? { q: query } : {}),
                    channelId,
                    sort: 'name',
                    order: 'asc',
                    limit: PEOPLE
                })
                // An account waiting to be deleted has no username, nor a task to take (D-182).
                return page.items
                    .filter((member) => member.username !== null)
                    .map((member) => ({
                        id: member.userId,
                        username: member.username,
                        displayName: member.displayName,
                        avatarUrl: member.avatarUrl,
                        presence: member.status
                    }))
            },
            staleTime: FRESH
        }),
        openSettings,
        // The task's channel, wherever the link is copied: the detail opens over it (05 Q6).
        linkTo: (taskId) => `${window.location.origin}${channelPath(serverId, channelId)}?task=${taskId}`
    }
}

/** The channel page's: the same object while none of these change. */
export function useTaskBoardPlace(
    server: Pick<Server, 'id' | 'name' | 'timeoutUntil'>,
    channel: Pick<ServerChannel, 'id' | 'name' | 'permissions'>,
    openSettings: () => void
): TaskBoardPlace {
    const { id: serverId, name: serverName, timeoutUntil } = server
    const { id: channelId, name: channelName, permissions } = channel
    return useMemo(
        () =>
            taskBoardPlace(
                { id: serverId, name: serverName, timeoutUntil },
                { id: channelId, name: channelName, permissions },
                openSettings
            ),
        [serverId, serverName, channelId, channelName, permissions, timeoutUntil, openSettings]
    )
}

/** The detail and the To-do page have no board to send to its settings. */
const noSettings = () => undefined

/**
 * The place of a task of any of one's servers (S-TASK-02, S-TASK-04, D-197):
 * its names and what one may do there, from the servers list; null when one
 * is not in its server or its channel is gone, undefined while the list loads.
 */
export function useTaskPlaceOf(): PlaceOf {
    const servers = useServers().data
    return useCallback<PlaceOf>(
        (serverId, channelId) => {
            if (!servers) return undefined
            const server = servers.find((candidate) => candidate.id === serverId)
            const channel = server?.channels.find((candidate) => candidate.id === channelId)
            return server && channel ? taskBoardPlace(server, channel, noSettings) : null
        },
        [servers]
    )
}
