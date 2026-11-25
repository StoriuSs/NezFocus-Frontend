import { useMemo } from 'react'
import { UserX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/social'
import { getApiErrorType } from '@/lib/api-error'
import { notifyMutationError } from '@/lib/query-client'
import {
    useAcceptFriendRequest,
    useRemoveRelationship,
    useRequestFriend,
    useUnblockPerson
} from '../api/useRelationshipActions'
import type { ConfirmKind } from '../components/ConfirmRelationshipDialog'
import { addFriendProblem } from '../lib/add-friend'
import type { SocialPerson } from '../types'

/**
 * What one can do about someone from their DM (C-50 and the `not-friend`
 * strip, D-251) or their profile popover (S-CHAT-05, D-253): the page's, which says how each went (a Toast) and asks
 * before unfriending or blocking. `busy` while one is on its way.
 */
export interface PersonMoves {
    request: () => void
    accept: () => void
    decline: () => void
    cancel: () => void
    unblock: () => void
    unfriend: () => void
    block: () => void
    copyUsername: () => void
    busy: boolean
}

/**
 * What the profile panel, the strip and the popover do about the other one
 * (D-251, D-253), with
 * the Friends page's words: a request from their profile (no note, D-237),
 * refused with the Add friend dialog's words in a Toast; accept, decline,
 * cancel with a Toast; unblock with none (the composer coming back says it,
 * as with the blocked strip's Unblock); unfriend and block ask first (`ask`);
 * copy the username.
 */
export function usePersonMoves(person: SocialPerson, name: string, ask: (kind: ConfirmKind) => void): PersonMoves {
    const { t } = useTranslation('social')
    const { mutateAsync: request, isPending: requesting } = useRequestFriend()
    const { mutateAsync: accept, isPending: accepting } = useAcceptFriendRequest()
    const { mutateAsync: remove, isPending: removing } = useRemoveRelationship()
    const { mutate: unblock, isPending: unblocking } = useUnblockPerson()
    const { id, username } = person
    const busy = requesting || accepting || removing || unblocking
    // The same object while nothing changes: the chat's DM parts hold `unblock`.
    return useMemo(
        () => ({
            // The promises, not mutate()'s callbacks: those are dropped once the screen that asked
            // is gone (a popover closed before the answer), and the Toast would never show.
            request: () =>
                void request(id).then(
                    (entry) =>
                        toast(entry.type === 'friend' ? t('toasts.friends', { name }) : t('toasts.sent', { name })),
                    (error: unknown) => {
                        const problem = addFriendProblem(error)
                        if (problem.kind === 'cannot' || problem.kind === 'dailyLimit' || problem.kind === 'offline')
                            toast.error(t(`add.problems.${problem.kind}`))
                        else notifyMutationError(error)
                    }
                ),
            accept: () =>
                void accept(id).then(
                    () => toast(t('toasts.friends', { name })),
                    (error: unknown) => {
                        // Any other failure is the hook's Toast.
                        if (getApiErrorType(error) === 'NOT_FOUND_ERROR')
                            toast(t('toasts.gone'), { icon: <UserX className='size-4' aria-hidden='true' /> })
                    }
                ),
            decline: () =>
                void remove(id).then(
                    () => toast(t('toasts.declined', { name })),
                    () => undefined
                ),
            cancel: () =>
                void remove(id).then(
                    () => toast(t('toasts.cancelled', { name })),
                    () => undefined
                ),
            unblock: () => unblock(id),
            unfriend: () => ask('unfriend'),
            block: () => ask('block'),
            copyUsername: () => {
                if (!username) return
                void navigator.clipboard.writeText(username).then(
                    () => toast(t('profile.copied')),
                    () => toast.error(t('profile.copyFailed'))
                )
            },
            busy
        }),
        [t, name, id, username, ask, request, accept, remove, unblock, busy]
    )
}
