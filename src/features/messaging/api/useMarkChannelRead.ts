import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ReadState } from '../types'
import { messageKeys } from './keys'
import { useAckChannel } from './useAckChannel'

/**
 * "Mark as read" from outside the chat (a DM row's menu, 09 S-DM-01): every
 * message of the channel read at once, the counts cleared before the backend
 * answers, as the new messages bar does (D-46). Nothing for a channel with
 * nothing unread, or not in the list.
 */
export function useMarkChannelRead(channelId: string): () => void {
    const client = useQueryClient()
    const ack = useAckChannel(channelId)
    return useCallback(() => {
        const held = client
            .getQueryData<ReadState[]>(messageKeys.readStates())
            ?.find((state) => state.channelId === channelId)
        if (held) ack(held.lastReadId, { all: true, newest: true })
    }, [client, channelId, ack])
}
