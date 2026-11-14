import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { openAround, startOver, stopsShort } from '../lib/message-cache'
import type { ChannelMessages, MessageCursor } from '../types'
import { messageKeys } from './keys'
import { fetchMessages } from './messages.api'

const holds = (history: ChannelMessages, id: string) =>
    history.pages.some((page) => page.items.some((item) => item.id === id))

const isAround = (cursor: MessageCursor, id: string) => !!cursor && 'around' in cursor && cursor.around === id

/**
 * Going to a message of the channel (D-48: a message link, the original of
 * a reply) and back to the newest messages.
 *
 * `show` answers `shown` once the history holds the message: it already did,
 * or it became the page around it. `gone` when the message is no longer
 * there (deleted, or not of this channel): the history is then at its newest
 * messages, for the chat to say "This message was deleted". A failure to
 * read throws, for the chat to say why.
 *
 * `toPresent`: a history that stops short (opened at an older message)
 * becomes the newest page, as when it was first opened; one already there
 * stays as it is.
 *
 * Both stop a page still being read first (older on scrolling up, newer on
 * scrolling down): it was read for the history as it was, and would put it
 * back once in.
 */
export function useMessageJump(channelId: string) {
    const client = useQueryClient()

    const toPresent = useCallback(async () => {
        const key = messageKeys.channel(channelId)
        const held = client.getQueryData<ChannelMessages>(key)
        if (held && !stopsShort(held)) return
        const latest = await fetchMessages(channelId, null)
        await client.cancelQueries({ queryKey: key })
        client.setQueryData<ChannelMessages>(key, (history) =>
            history ? startOver(history, latest) : { pages: [latest], pageParams: [null] }
        )
    }, [client, channelId])

    const show = useCallback(
        async (messageId: string): Promise<'shown' | 'gone'> => {
            const key = messageKeys.channel(channelId)
            const held = client.getQueryData<ChannelMessages>(key)
            if (held && holds(held, messageId)) return 'shown'
            // Just read around it (the channel opened at the link) and it is not there: gone.
            const readAround = held?.pageParams.some((cursor) => isAround(cursor, messageId))
            if (!readAround) {
                const around = await fetchMessages(channelId, { around: messageId })
                if (around.items.some((item) => item.id === messageId)) {
                    await client.cancelQueries({ queryKey: key })
                    client.setQueryData<ChannelMessages>(key, (history) => openAround(history, around, messageId))
                    return 'shown'
                }
            }
            await toPresent()
            return 'gone'
        },
        [client, channelId, toPresent]
    )

    return { show, toPresent }
}
