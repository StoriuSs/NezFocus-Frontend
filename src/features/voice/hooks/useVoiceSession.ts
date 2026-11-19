import { createElement, useEffect, useState } from 'react'
import { LogOut, Mic, MicOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { onRealtimeEvent } from '@/features/realtime'
import { useProfile } from '@/features/users'
import { accountTimeZone, endsAtText } from '@/lib/time-zones'
import { joinRoom, micTakenAway, tellOwnState } from '../lib/session'
import { rejoinDone, roomToRejoin } from '../lib/rejoin'
import type { PutOutReason, VoiceDirectory } from '../types'
import { useVoiceStore } from '../voice.store'

/**
 * How long after being put out of a room its new room may still show in a
 * list (07 câu L3-b), and how long a timeout's end may take to reach the
 * servers held before the Toast goes without it.
 */
export const MOVED_WINDOW_MS = 15_000

/** The words for each reason that has some (07 ROOM-EDGE, D-212); a kick or ban has M2's dialog, a server left nothing. */
const PUT_OUT_WORDS: Partial<
    Record<PutOutReason, 'shell.voice.disconnected' | 'shell.voice.noLongerAllowed' | 'shell.voice.roomGone'>
> = {
    moderator: 'shell.voice.disconnected',
    permission: 'shell.voice.noLongerAllowed',
    channel_deleted: 'shell.voice.roomGone'
}

/** A Toast's icon (16, as the app's other Toasts). */
const ICON = { className: 'size-4', 'aria-hidden': true }

/** This tab is in that room, joining it, or was just put out of it (the server's word may come after LiveKit's). */
function inRoom(channelId: string): boolean {
    const { call, removed } = useVoiceStore.getState()
    return call?.channelId === channelId || removed?.channelId === channelId
}

/**
 * What voice does in every tab, whatever the page, given the rooms the app
 * holds (`directory`, from the servers' data):
 * - A reload of a tab that was in a room joins it again, mic and camera off, and says so
 *   (07 ROOM-EDGE `reload-rejoin`, VC-02, D-51); a room gone or closed to one
 *   meanwhile is not joined.
 * - Put out because the account joined another room elsewhere: once that
 *   room's list shows one in it, a Toast says where (07 câu L3-b).
 * - One's own row in the room's list differs from this tab's mic or camera, or the
 *   socket is live again: the tab says its state again (D-206).
 * - A moderator muted or unmuted one (`voice.muted`, D-207), or the server put
 *   one out (`voice.disconnected`, D-212): the tab in that room says so (07
 *   `mod-muted`, câu L4b-a, ROOM-EDGE); muted, the mic goes off, also when
 *   only one's own row says it (the event missed). A timeout says until
 *   when once the servers held know it, else after a while the plain words.
 */
export function useVoiceSession(directory: VoiceDirectory | undefined): void {
    const { t, i18n } = useTranslation()
    const me = useProfile().data?.id
    useEffect(() => {
        const rejoin = roomToRejoin()
        if (!rejoin || !directory) return
        rejoinDone()
        const room = directory.room(rejoin.channelId)
        const timedOut = room?.timeoutUntil != null && new Date(room.timeoutUntil) > new Date()
        if (!room?.canConnect || timedOut) return
        void joinRoom(room, { devicesOff: true }).then((joined) => {
            if (joined) toast(t('shell.voice.rejoined', { room: room.name }), { id: 'voice-rejoined' })
        })
    }, [directory, t])

    const removed = useVoiceStore((state) => state.removed)
    const movedTo = removed && me ? directory?.roomOf(me) : undefined
    useEffect(() => {
        if (!removed) return
        // Put out for a reason the API gave, or the room shown is the one this tab joined since: not elsewhere.
        const elsewhere = !removed.reason && useVoiceStore.getState().call?.channelId !== movedTo?.channelId
        if (elsewhere && movedTo && movedTo.channelId !== removed.channelId) {
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
    const camera = useVoiceStore((state) => state.camera)
    const connectedTo = call?.phase === 'connected' ? call.channelId : undefined
    const ownRow =
        connectedTo && me ? directory?.room(connectedTo)?.people.find((one) => one.user.id === me) : undefined
    const differs = ownRow !== undefined && (ownRow.micOn !== (mic === 'on') || ownRow.cameraOn !== (camera === 'on'))
    useEffect(() => {
        if (differs) tellOwnState()
    }, [differs, ownRow])

    useEffect(() => onRealtimeEvent('ready', tellOwnState), [])

    const ownMuted = ownRow?.modMuted === true
    useEffect(() => {
        if (ownMuted && connectedTo) void micTakenAway(connectedTo)
    }, [ownMuted, connectedTo])
    // The list caught up with the moderator's word: the list holds again.
    const said = useVoiceStore((state) => state.modMuted)
    useEffect(() => {
        if (said !== null && ownRow !== undefined && ownRow.modMuted === said)
            useVoiceStore.setState({ modMuted: null })
    }, [said, ownRow])

    // A timeout's put-out waiting for the servers held to know until when.
    const [timedOut, setTimedOut] = useState<{ channelId: string; at: number } | null>(null)
    useEffect(() => {
        const off = [
            onRealtimeEvent('voice.muted', (data) => {
                const { channelId, muted } = data as { channelId: string; muted: boolean }
                if (!inRoom(channelId)) return
                if (useVoiceStore.getState().call?.channelId === channelId) useVoiceStore.setState({ modMuted: muted })
                if (muted) void micTakenAway(channelId)
                toast(t(muted ? 'shell.voice.mutedByModerator' : 'shell.voice.unmutedByModerator'), {
                    id: 'voice-muted',
                    icon: createElement(muted ? MicOff : Mic, ICON)
                })
            }),
            onRealtimeEvent('voice.disconnected', (data) => {
                const { channelId, reason } = data as { channelId: string; reason: PutOutReason }
                if (!inRoom(channelId)) return
                useVoiceStore.setState({ removed: { channelId, at: Date.now(), reason } })
                if (reason === 'timeout') return setTimedOut({ channelId, at: Date.now() })
                const words = PUT_OUT_WORDS[reason]
                if (!words) return
                // A room deleted or closed to one: its page may say it is gone too (02 channel-removed), one Toast.
                const id = reason === 'moderator' ? 'voice-removed' : 'channel-removed'
                toast(t(words), {
                    id,
                    ...(reason === 'moderator' ? { icon: createElement(LogOut, ICON) } : {})
                })
            })
        ]
        return () => off.forEach((stop) => stop())
    }, [t])

    const until = timedOut ? directory?.room(timedOut.channelId)?.timeoutUntil : undefined
    useEffect(() => {
        if (!timedOut) return
        const now = new Date()
        if (until && new Date(until) > now) {
            setTimedOut(null)
            toast(
                t('shell.voice.timedOut', {
                    time: endsAtText(new Date(until), now, i18n.language, accountTimeZone())
                }),
                { id: 'voice-removed' }
            )
            return
        }
        const timer = setTimeout(
            () => {
                setTimedOut(null)
                toast(t('shell.voice.disconnected'), { id: 'voice-removed' })
            },
            Math.max(timedOut.at + MOVED_WINDOW_MS - Date.now(), 0)
        )
        return () => clearTimeout(timer)
    }, [timedOut, until, t, i18n.language])
}
