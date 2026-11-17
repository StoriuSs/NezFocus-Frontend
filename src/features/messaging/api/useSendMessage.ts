import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { MessageAuthor, OutgoingMessage, RepliedMessage } from '../types'
import { discardMessage, retryMessage, sendAlong, sendFrom, sendWaiting, untilHistory } from './outgoingMessages'

type OutgoingMentions = Pick<OutgoingMessage, 'mentionUsers' | 'mentionRoles' | 'mentionEveryone'>

/**
 * Sending in one channel (REQ-MSG-01): what `outgoingMessages.ts` does, for
 * the chat. The messages keep going once the channel is left; opened again
 * online, what waited for the network goes. The row itself says what
 * happened, so no error toast. A reply carries the message it answers,
 * quoted at once as the saved one will be (REQ-MSG-05).
 */
export function useSendMessage(channelId: string, author: MessageAuthor | undefined) {
    const client = useQueryClient()
    useEffect(() => {
        sendAlong(client)
        sendWaiting(client, channelId)
    }, [client, channelId])

    return useMemo(
        () => ({
            /** Whether the message was taken (see `sendFrom`). */
            send: (text: string, replyTo?: RepliedMessage | null, mentions?: OutgoingMentions): boolean =>
                sendFrom(client, channelId, author, text, replyTo, mentions),
            /** Once the history is there to take a message (see `untilHistory`). */
            historyReady: () => untilHistory(client, channelId),
            retry: (nonce: string) => retryMessage(client, channelId, nonce),
            discard: (nonce: string) => discardMessage(client, channelId, nonce)
        }),
        [client, channelId, author]
    )
}
