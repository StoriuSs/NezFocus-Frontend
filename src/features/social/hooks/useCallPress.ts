import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/social'
import { getApiErrorType } from '@/lib/api-error'
import { notifyMutationError } from '@/lib/query-client'
import { useOpenDm } from '../api/useDmActions'
import { socialKeys } from '../api/keys'
import { useStartCall } from '../api/useStartCall'
import { useCallStore } from '../call.store'
import { answerCall, placeCall, type CallPress } from '../lib/call-session'
import { dmWith } from '../lib/dm-list'
import { dmPath, isDmPage } from '../lib/paths'
import type { Call, Dm } from '../types'

/**
 * Pressing Call or Answer, wherever it is (the DM's Header, ⋯ of a friend's
 * row, "Gọi lại", the incoming card): the call's page is the DM's
 * (09 S-CALL-01: no URL of its own), so it opens; refused, a Toast says why:
 * the mic blocked (D-36; its Popover comes with L9c), the one line of
 * CANNOT_MESSAGE_USER (D-23), in a call already, or the usual failure.
 */
export function useCallPress() {
    const { t } = useTranslation('social')
    const navigate = useNavigate()
    const { pathname } = useLocation()
    // Where the press was made, read once it is answered: on the DM already, no second entry in the history.
    const here = useRef(pathname)
    useEffect(() => {
        here.current = pathname
    }, [pathname])
    const client = useQueryClient()
    /** To a DM's page, unless on it already ("Thu nhỏ" goes back to the page before it, 09 S-CALL-01). */
    const toDm = useCallback(
        (dmId: string) => {
            if (!isDmPage(here.current, dmId)) void navigate(dmPath(dmId))
        },
        [navigate]
    )
    const { mutateAsync: openDm } = useOpenDm()
    const { mutateAsync: start } = useStartCall()

    const said = useCallback(
        (press: CallPress, error: unknown, answering: boolean) => {
            if (press === 'mic-blocked')
                toast.error(t(answering ? 'call.toasts.micBlockedAnswer' : 'call.toasts.micBlocked'))
            else if (press === 'cannot') toast.error(t('call.toasts.cannotCall'))
            else if (press === 'in-progress') toast(t('call.inCall'))
            else if (press === 'error') notifyMutationError(error)
        },
        [t]
    )

    /** Calls the other one of a DM, its page opening. */
    const call = useCallback(
        async (dmId: string, video: boolean) => {
            const { press, error } = await placeCall(video, () => start({ dmId, video }))
            if (press === 'ok') toDm(dmId)
            else said(press, error, false)
        },
        [toDm, said, start]
    )

    /** Calls a person (⋯ of a friend's row): their DM, opened first when my list does not hold it. */
    const callPerson = useCallback(
        async (userId: string, video: boolean) => {
            const held = dmWith(client.getQueryData<readonly Dm[]>(socialKeys.dms()), userId)
            if (held) return call(held.id, video)
            try {
                const dm = await openDm(userId)
                await call(dm.id, video)
            } catch (error) {
                if (getApiErrorType(error) === 'CANNOT_MESSAGE_USER') toast.error(t('call.toasts.cannotCall'))
                else notifyMutationError(error)
            }
        },
        [client, call, openDm, t]
    )

    /** Answers a call ringing to me, the caller's DM opening (09 S-CALL-02 › Đi tới). */
    const answer = useCallback(
        async (ringing: Call, video: boolean) => {
            const { press, error } = await answerCall(ringing, video)
            // Cancelled as it was answered: its word closed the card, nowhere to go.
            if (press === 'ok' && useCallStore.getState().current?.call.id === ringing.id) toDm(ringing.dmId)
            else if (press !== 'ok') said(press, error, true)
        },
        [toDm, said]
    )

    return { call, callPerson, answer }
}
