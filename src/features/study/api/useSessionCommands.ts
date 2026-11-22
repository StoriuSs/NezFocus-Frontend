import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/study'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { notifyMutationError } from '@/lib/query-client'
import { sessionRefusal } from '../lib/session-errors'
import type { StudyCycle } from '../lib/study-cycle'
import { startToastId } from '../lib/toast-ids'
import type { AnySession, FocusSession, SessionCommand } from '../types'
import { tellSession } from './liveSessions'
import { changeSessionCycle, commandSession, startRoomSession } from './study.api'

/**
 * Starts the room's session (S-ROOM-03, the ring's "Bắt đầu Tập trung"):
 * the answer goes on the room at once, without waiting for its event.
 *
 * Refused because the room has a session already, someone else's come first
 * (FOCUS_SESSION_ACTIVE with one on the room, S-ROOM-03 `conflict`): says
 * who, under the id their start's own toast uses, so one shows. Anything
 * else, one's own session elsewhere among it, is the query client's toast.
 * Here, not in a caller: the dialog may have closed meanwhile.
 */
export function useStartSession(
    channelId: string,
    /** The room's session now, and who hosts it, read when refused. */
    roomNow: () => { hostName: string | null } | null
) {
    const { t } = useTranslation('study')
    return useIdempotentMutation<FocusSession, Error, StudyCycle | null>({
        mutationFn: (cycle, key) => startRoomSession(channelId, cycle, key),
        onSuccess: (session) => void tellSession(session),
        onError: (error) => {
            const room = roomNow()
            if (sessionRefusal(error).type !== 'FOCUS_SESSION_ACTIVE' || !room) return notifyMutationError(error)
            toast(t('start.conflict', { name: room.hostName ?? t('news.someone') }), { id: startToastId(channelId) })
        },
        meta: { errorToast: false }
    })
}

/** Pause, resume, skip or stop the session, as it was seen (its version); the answer goes on the room. */
export function useSessionCommand(session: AnySession | null) {
    return useMutation({
        mutationFn: (command: SessionCommand) =>
            session ? commandSession(session.id, command, session.version) : Promise.reject(new Error('No session')),
        onSuccess: (answer) => void tellSession(answer)
    })
}

/** A new cycle while paused (S-ROOM-04 `paused-edit-config`); the answer goes on the room. */
export function useChangeCycle(session: AnySession) {
    return useMutation({
        mutationFn: (cycle: StudyCycle) => changeSessionCycle(session.id, session.version, cycle),
        onSuccess: (answer) => void tellSession(answer),
        meta: { errorToast: false }
    })
}
