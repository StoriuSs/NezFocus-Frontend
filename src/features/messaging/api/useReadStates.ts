import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dmChannelIds, dmUnread, keepList, mentionTotal, serverState } from '../lib/read-state-cache'
import type { ReadState } from '../types'
import { messageKeys } from './keys'
import { listenForReadStates } from './liveReadStates'
import { fetchReadStates } from './readStates.api'

const NOTHING_UNREAD = { unread: false, mentions: 0 }
const NO_DM_UNREAD = { dms: 0, messages: 0 }
const NONE: string[] = []

/**
 * How far the reader has read every text channel they may view (REQ-MSG-09),
 * read once and kept live by the socket (`listenForReadStates`). A list read
 * again keeps a channel marked here meanwhile (D-173). Each part of the app
 * takes its share (`select`): the rail a server, the channel list and the
 * chat a channel, the tab title the mentions.
 */
function useReadStates<T>(select: (states: ReadState[]) => T) {
    const client = useQueryClient()
    useEffect(() => {
        // For the app's life, not this component's: no stop on unmount.
        listenForReadStates(client)
    }, [client])

    return useQuery({
        queryKey: messageKeys.readStates(),
        queryFn: async () => {
            const fresh = await fetchReadStates()
            return keepList(client.getQueryData<ReadState[]>(messageKeys.readStates()), fresh)
        },
        staleTime: Infinity,
        select
    })
}

/** One channel's state; undefined while the list is read, or for a channel not in it. */
export function useChannelReadState(channelId: string): ReadState | undefined {
    const select = useCallback(
        (states: ReadState[]) => states.find((state) => state.channelId === channelId),
        [channelId]
    )
    return useReadStates(select).data
}

/**
 * A server on the rail: unread when any of `channelIds` (its channels as the
 * server list shows them) is, and the mentions of all of them (C-05).
 */
export function useServerReadState(
    serverId: string,
    channelIds: readonly string[]
): { unread: boolean; mentions: number } {
    // The ids as text: a new array of the same channels selects the same.
    const ids = channelIds.join(',')
    const select = useCallback(
        (states: ReadState[]) => serverState(states, serverId, ids ? ids.split(',') : []),
        [serverId, ids]
    )
    return useReadStates(select).data ?? NOTHING_UNREAD
}

/** The server's channels with mentions of the reader still unread: a folded category still shows them (C-06). */
export function useMentionedChannels(serverId: string): string[] {
    const select = useCallback(
        (states: ReadState[]) =>
            states
                .filter((state) => state.serverId === serverId && state.mentionCount > 0)
                .map((state) => state.channelId),
        [serverId]
    )
    return useReadStates(select).data ?? NONE
}

/** The tab title's number (REQ-MSG-09, X-01), over `channelIds`: the channels the server list shows. */
export function useMentionTotal(channelIds?: readonly string[]): number {
    const ids = channelIds?.join(',')
    const select = useCallback(
        (states: ReadState[]) => mentionTotal(states, ids === undefined ? undefined : ids ? ids.split(',') : []),
        [ids]
    )
    return useReadStates(select).data ?? 0
}

/**
 * The DMs with unread messages (the rail's 💬 Badge) and how many messages
 * they hold (added to the tab title's number), D-244, 09 › luật 6.
 */
export function useDmUnread(): { dms: number; messages: number } {
    return useReadStates(dmUnread).data ?? NO_DM_UNREAD
}

/**
 * The DM channels the read states hold, as text: the social feature reads
 * its DM list again when one it does not have comes (a DM shown again by a
 * message, or a first message from someone new; D-244).
 */
export function useDmChannelIds(): string {
    return useReadStates(dmChannelIds).data ?? ''
}
