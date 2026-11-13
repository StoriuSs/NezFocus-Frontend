import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorMessage, getApiErrorType } from '@/lib/api-error'
import { removeSaved } from '../lib/message-cache'
import type { ChannelMessages } from '../types'
import { messageKeys } from './keys'
import { deleteMessage } from './messages.api'

/**
 * Deleting a message (REQ-MSG-05): it leaves the list with the answer, and
 * its reply lines say it was deleted; `message.deleted` brings the same
 * change again. NOT_FOUND means someone deleted it first: what was asked is
 * done, so it leaves the list without a word. Any other failure says why in
 * a Toast.
 */
export function useDeleteMessage(channelId: string) {
    const client = useQueryClient()
    const remove = (messageId: string) =>
        client.setQueryData<ChannelMessages>(
            messageKeys.channel(channelId),
            (history) => history && removeSaved(history, messageId)
        )

    return useMutation({
        mutationFn: (messageId: string) => deleteMessage(messageId),
        onSuccess: (_answer, messageId) => remove(messageId),
        onError: (error, messageId) => {
            if (getApiErrorType(error) === 'NOT_FOUND_ERROR') remove(messageId)
            else toast.error(getApiErrorMessage(error))
        },
        meta: { errorToast: false }
    })
}
