import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { forgetReadState, readStatesAgain } from '@/features/messaging'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { getApiErrorType } from '@/lib/api-error'
import { notifyMutationError } from '@/lib/query-client'
import { dmWith, withDm, withoutDm } from '../lib/dm-list'
import { forgetMessagesPlace } from '../lib/messages-place'
import { dmPath } from '../lib/paths'
import type { Dm } from '../types'
import { socialKeys } from './keys'
import { closeDm, openDm } from './dms.api'

/**
 * Opens my DM with someone (POST /me/dms, D-242): the one there is, open
 * again on my side, or a new one; it goes into the list held.
 */
export function useOpenDm() {
    const client = useQueryClient()
    return useIdempotentMutation({
        mutationFn: (userId: string, idempotencyKey) => openDm(userId, idempotencyKey),
        onSuccess: (dm) => client.setQueryData<readonly Dm[]>(socialKeys.dms(), (list) => list && withDm(list, dm)),
        meta: { errorToast: false }
    })
}

/**
 * "Message" (S-DM-02, the Add friend card, the inbox; 09 S-DM-03 › Mở từ):
 * to the DM with that person, at once when my list holds it, else once it
 * is opened. None yet and I may not message them: the one line of
 * CANNOT_MESSAGE_USER (D-23) as a Toast; any other failure the usual one.
 * Returns the way to go, and whether a DM is being opened.
 */
export function useMessagePerson(): { message: (userId: string) => void; opening: boolean } {
    const { t } = useTranslation()
    const client = useQueryClient()
    const navigate = useNavigate()
    const open = useOpenDm()
    const { mutateAsync } = open
    const message = useCallback(
        (userId: string) => {
            const held = dmWith(client.getQueryData<readonly Dm[]>(socialKeys.dms()), userId)
            if (held) return void navigate(dmPath(held.id))
            // The promise, not mutate()'s callbacks: those are dropped once the screen that asked
            // is gone (the inbox closes as its row is clicked), and the DM would never open.
            mutateAsync(userId).then(
                (dm) => void navigate(dmPath(dm.id)),
                (error: unknown) =>
                    getApiErrorType(error) === 'CANNOT_MESSAGE_USER'
                        ? toast.error(t('shell.messages.cannotMessage'))
                        : notifyMutationError(error)
            )
        },
        [client, navigate, mutateAsync, t]
    )
    return { message, opening: open.isPending }
}

/**
 * Closes a DM on my side (S-DM-01 › Đóng tin nhắn, D-244): the row goes at
 * once, no question, no Toast; its read state goes with it, so its next
 * message brings it back with its unread count. 💬 no longer comes back to
 * it. A failure puts it back (the list and the read states read again) with
 * the usual Toast.
 */
export function useCloseDm() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: closeDm,
        onMutate: (dmId: string) => {
            client.setQueryData<readonly Dm[]>(socialKeys.dms(), (list) => list && withoutDm(list, dmId))
            forgetReadState(client, dmId)
            forgetMessagesPlace(dmPath(dmId))
        },
        onError: () => {
            void client.invalidateQueries({ queryKey: socialKeys.dms() })
            readStatesAgain(client)
        }
    })
}
