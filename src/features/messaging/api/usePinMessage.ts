import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/messaging'
import { getApiErrorMessage, getApiErrorType } from '@/lib/api-error'
import { removeSaved, setPinned } from '../lib/message-cache'
import { dropPin } from '../lib/pin-cache'
import type { ChannelMessages, PinnedMessage } from '../types'
import { messageKeys } from './keys'
import { pinMessage, unpinMessage } from './pins.api'

/**
 * Pinning and unpinning (REQ-MSG-07), for MANAGE_MESSAGES: not shown
 * before the answer. A pin marks the message and reads the pins again (the
 * system message "pinned a message" comes as `message.created`); an unpin
 * takes the card away at once, with a Toast "Unpinned" (S-CHAT-02). A
 * refusal says why, a 51st pin in the words of spec 11; NOT_FOUND drops the
 * message, deleted meanwhile.
 */
export function usePinMessage(channelId: string) {
    const { t } = useTranslation('messaging')
    const client = useQueryClient()
    const changeHistory = (update: (history: ChannelMessages) => ChannelMessages) =>
        client.setQueryData<ChannelMessages>(messageKeys.channel(channelId), (history) => history && update(history))
    const changePins = (update: (pins: PinnedMessage[]) => PinnedMessage[]) =>
        client.setQueryData<PinnedMessage[]>(messageKeys.pins(channelId), (pins) => pins && update(pins))
    const onError = (error: Error, messageId: string) => {
        if (getApiErrorType(error) === 'NOT_FOUND_ERROR') {
            changeHistory((history) => removeSaved(history, messageId))
            changePins((pins) => dropPin(pins, messageId))
            return
        }
        toast.error(getApiErrorType(error) === 'MAX_PINS_REACHED' ? t('pins.full') : getApiErrorMessage(error))
    }

    const pin = useMutation({
        mutationFn: (messageId: string) => pinMessage(channelId, messageId),
        onSuccess: (_, messageId) => {
            changeHistory((history) => setPinned(history, messageId, true))
            void client.invalidateQueries({ queryKey: messageKeys.pins(channelId) })
        },
        onError,
        meta: { errorToast: false }
    })
    const unpin = useMutation({
        mutationFn: (messageId: string) => unpinMessage(channelId, messageId),
        onSuccess: (_, messageId) => {
            changeHistory((history) => setPinned(history, messageId, false))
            changePins((pins) => dropPin(pins, messageId))
            toast(t('pins.unpinned'))
        },
        onError,
        meta: { errorToast: false }
    })
    return { pin: pin.mutate, unpin: unpin.mutate }
}
