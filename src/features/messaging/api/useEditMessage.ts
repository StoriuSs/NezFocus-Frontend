import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorMessage, getApiErrorType } from '@/lib/api-error'
import { removeSaved, replaceSaved } from '../lib/message-cache'
import type { ChannelMessages } from '../types'
import { messageKeys } from './keys'
import { editMessage } from './messages.api'

/**
 * Editing one's own message (REQ-MSG-05): the answer goes into the cache at
 * once; `message.updated` brings the same change again, which changes
 * nothing. NOT_FOUND means it was deleted meanwhile: it leaves the list, and
 * the chat closes the editor with "This message was deleted" (S-CHAT-01 ›
 * Thay đổi trong lúc đang xem). Any other failure says why in a Toast; the
 * text being edited stays.
 */
export function useEditMessage(channelId: string) {
    const client = useQueryClient()
    const change = (update: (history: ChannelMessages) => ChannelMessages) =>
        client.setQueryData<ChannelMessages>(messageKeys.channel(channelId), (history) => history && update(history))

    return useMutation({
        mutationFn: ({ messageId, content }: { messageId: string; content: string }) => editMessage(messageId, content),
        onSuccess: (message) => change((history) => replaceSaved(history, message)),
        onError: (error, { messageId }) => {
            if (getApiErrorType(error) === 'NOT_FOUND_ERROR') change((history) => removeSaved(history, messageId))
            else toast.error(getApiErrorMessage(error))
        },
        meta: { errorToast: false }
    })
}
