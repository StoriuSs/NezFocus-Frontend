import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { onRealtimeEvent } from '@/features/realtime'
import { useProfile } from '@/features/users'
import { joinRoom, tellOwnState } from '../lib/session'
import { rejoinDone, roomToRejoin } from '../lib/rejoin'
import type { VoiceDirectory } from '../types'
import { useVoiceStore } from '../voice.store'

/** How long after being put out of a room its new room may still show in a list (07 câu L3-b). */
export const MOVED_WINDOW_MS = 15_000

/**
 * What voice does in every tab, whatever the page, given the rooms the app
 * holds (`directory`, from the servers' data):
 * - A reload of a tab that was in a room joins it again, mic off, and says so
 *   (07 ROOM-EDGE `reload-rejoin`, VC-02, D-51); a room gone or closed to one
 *   meanwhile is not joined.
 * - Put out because the account joined another room elsewhere: once that
 *   room's list shows one in it, a Toast says where (07 câu L3-b).
 * - One's own row in the room's list differs from this tab's mic, or the
 *   socket is live again: the tab says its state again (D-206).
 */
export function useVoiceSession(directory: VoiceDirectory | undefined): void {
    const { t } = useTranslation()
    const me = useProfile().data?.id
    useEffect(() => {
        const rejoin = roomToRejoin()
        if (!rejoin || !directory) return
        rejoinDone()
        const room = directory.room(rejoin.channelId)
        const timedOut = room?.timeoutUntil != null && new Date(room.timeoutUntil) > new Date()
        if (!room?.canConnect || timedOut) return
        void joinRoom(room, { micOff: true }).then((joined) => {
            if (joined) toast(t('shell.voice.rejoined', { room: room.name }), { id: 'voice-rejoined' })
        })
    }, [directory, t])

    const removed = useVoiceStore((state) => state.removed)
    const movedTo = removed && me ? directory?.roomOf(me) : undefined
    useEffect(() => {
        if (!removed) return
        if (movedTo && movedTo.channelId !== removed.channelId) {
            useVoiceStore.setState({ removed: null })
            toast(t('shell.voice.movedElsewhere', { room: movedTo.name }), { id: 'voice-moved' })
            return
        }
        const timer = setTimeout(
            () => useVoiceStore.setState({ removed: null }),
            Math.max(removed.at + MOVED_WINDOW_MS - Date.now(), 0)
        )
        return () => clearTimeout(timer)
    }, [removed, movedTo, t])

    const call = useVoiceStore((state) => state.call)
    const mic = useVoiceStore((state) => state.mic)
    const connectedTo = call?.phase === 'connected' ? call.channelId : undefined
    const ownRow =
        connectedTo && me ? directory?.room(connectedTo)?.people.find((one) => one.user.id === me) : undefined
    const differs = ownRow !== undefined && (ownRow.micOn !== (mic === 'on') || ownRow.cameraOn)
    useEffect(() => {
        if (differs) tellOwnState()
    }, [differs, ownRow])

    useEffect(() => onRealtimeEvent('ready', tellOwnState), [])
}
