import { useEffect } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { CachedPage, ChannelMessages, MessageCursor } from '../types'
import { messageKeys } from './keys'
import { listenForMessages } from './liveMessages'
import { fetchMessages } from './messages.api'

/**
 * A channel's history (S-CHAT-01): the newest 50 first, older pages as the
 * list scrolls up (C-10 › Cuộn). Never read again on its own: the socket
 * keeps it live (`listenForMessages`), and catches it up when it reconnects.
 */
export function useChannelMessages(channelId: string) {
    const client = useQueryClient()
    useEffect(() => {
        // For the app's life, not this list's: no stop on unmount.
        listenForMessages(client)
    }, [client])

    return useInfiniteQuery<CachedPage, Error, ChannelMessages, ReturnType<typeof messageKeys.channel>, MessageCursor>({
        queryKey: messageKeys.channel(channelId),
        queryFn: ({ pageParam }) => fetchMessages(channelId, pageParam),
        initialPageParam: null,
        getPreviousPageParam: (first) => {
            const oldest = first.items[0]
            return first.hasMoreBefore && oldest ? { before: oldest.id } : undefined
        },
        // Newer messages come from the socket, not from paging.
        getNextPageParam: () => undefined,
        staleTime: Infinity,
        // Kept while the app runs: a channel left with messages on their way, or failed,
        // still has them when one comes back (signing out clears the cache).
        gcTime: Infinity
    })
}
