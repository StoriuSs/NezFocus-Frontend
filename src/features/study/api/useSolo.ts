import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/study'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { notifyMutationError } from '@/lib/query-client'
import { sessionRefusal } from '../lib/session-errors'
import type { StudyCycle } from '../lib/study-cycle'
import { askToStopSolo, forgetSoloEnded } from '../study.store'
import type { FocusSession, SoloCommand, SoloState } from '../types'
import { studyKeys } from './keys'
import { tellSolo } from './liveSessions'
import { commandSession, startSolo } from './study.api'
import { SOLO_PATH } from './useSoloSession'

/**
 * Starts a Solo (S-STUDY-01 "Bắt đầu Tập trung 50 phút", the cycle dialog):
 * the answer held at once, then the Solo page. One running already in
 * another tab (FOCUS_SESSION_ACTIVE, 08 edge `already-running`): its page,
 * "Bạn đang có phiên học một mình ở tab khác". In a room's session: refused
 * there too (the start is off with its reason; the query client's toast).
 */
export function useStartSolo() {
    const client = useQueryClient()
    const navigate = useNavigate()
    const { t } = useTranslation('study')
    return useIdempotentMutation<FocusSession, Error, StudyCycle | null>({
        mutationFn: (cycle, key) => startSolo(cycle, key),
        onSuccess: (session) => {
            forgetSoloEnded()
            tellSolo(client, session)
            void navigate(SOLO_PATH)
        },
        onError: async (error) => {
            if (sessionRefusal(error).type !== 'FOCUS_SESSION_ACTIVE') return notifyMutationError(error)
            await client.invalidateQueries({ queryKey: studyKeys.solo() })
            if (!client.getQueryData<SoloState>(studyKeys.solo())?.session) return notifyMutationError(error)
            toast(t('solo.otherTab'))
            void navigate(SOLO_PATH)
        },
        meta: { errorToast: false }
    })
}

/**
 * Pause, resume, skip, stop or Học tiếp of one's Solo, as it was seen (its
 * version); the answer held at once. Dừng is marked this tab's first: its end
 * is "Bạn đã dừng học một mình", whichever word of it comes first. Học tiếp
 * come too late says so, from the page or the dock.
 */
export function useSoloCommand(session: FocusSession | null) {
    const client = useQueryClient()
    const { t } = useTranslation('study')
    return useMutation({
        mutationFn: (command: SoloCommand) => {
            if (!session) return Promise.reject(new Error('No Solo'))
            if (command === 'stop') askToStopSolo(session.id)
            return commandSession(session.id, command, session.version)
        },
        onSuccess: (answer, command) => {
            tellSolo(client, answer)
            // Dừng with a version gone by changed nothing: its end, later, is not this one's.
            if (command === 'stop' && answer.status !== 'ended') askToStopSolo(null)
            // Học tiếp as the wait ran out: it ended as expired meanwhile (08 › Edge).
            if (command === 'continue' && answer.status === 'ended') toast(t('solo.waitOver'))
        },
        onError: (_error, command) => {
            if (command === 'stop') askToStopSolo(null)
        }
    })
}
