import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/voice'
import { asksBeforeLeaving, hearSessionLeft, useHostLeave } from '@/features/study'
import { useProfile } from '@/features/users'
import { joinRoom, leaveRoom } from '../lib/session'
import { useVoiceStore } from '../voice.store'
import type { VoiceRoom } from '../types'

/** How long the Toast after leaving stays (C-21 Rời phòng: 8 seconds). */
const LEFT_TOAST_MS = 8000
/** The least it stays once it says the minutes, so they can be read. */
const COUNTED_TOAST_MS = 3000

type LeftRoom = Pick<VoiceRoom, 'serverId' | 'channelId' | 'name' | 'session'>

/**
 * Which leaving's Toast is open (a count, so an older one closing says
 * nothing of a newer), 0 once it closed: sonner keeps an id it once closed as
 * closed for a later `toast()` with the same id, so it cannot be asked.
 */
let leftToast = 0

/**
 * Leave, from the room's controls or the dock (C-21): at once, unless one is
 * the Host of its session not yet ended, who is asked first ("Rời phòng?",
 * D-44). Then a Toast "Left {room} · Join again" for 8 seconds; in a room
 * with a session, once the server tells one's seconds in it
 * (`focus_session.left`, D-233), the same Toast says "N minutes counted"
 * (none under a minute; a voice room counts none, 07 P4). Joining again from
 * it may happen on any page: failed, a Toast says why, as the preview page
 * would.
 */
export function useLeaveRoom(room: LeftRoom): () => void {
    const { t } = useTranslation('voice')
    const me = useProfile().data?.id
    const ask = useHostLeave((state) => state.ask)
    const { serverId, channelId, name, session } = room
    const sessionId = session?.id ?? null
    const leave = useCallback(() => {
        const since = Date.now()
        void leaveRoom()
        const mine = ++leftToast
        let stop: () => void = () => undefined
        const closed = () => {
            if (leftToast === mine) leftToast = 0
            stop()
        }
        const say = (text: string, duration: number) =>
            toast(text, {
                id: 'voice-left',
                duration,
                onAutoClose: closed,
                onDismiss: closed,
                action: {
                    label: t('room.joinAgain'),
                    onClick: () => {
                        closed()
                        void joinRoom({ serverId, channelId, name }).then((joined) => {
                            if (joined) return
                            const refused = useVoiceStore.getState().problem?.kind === 'refused'
                            toast(t(refused ? 'preview.noConnect' : 'preview.joinError'), { id: 'voice-join-failed' })
                        })
                    }
                }
            })
        say(t('room.left', { room: name }), LEFT_TOAST_MS)
        if (sessionId === null) return
        // Each total told while the Toast is open, the largest kept: a slower, older one may come after.
        let best = 0
        stop = hearSessionLeft(channelId, sessionId, since, (seconds) => {
            // Not brought back once gone ("Vào lại" pressed, closed), or in a room again meanwhile.
            if (leftToast !== mine || useVoiceStore.getState().call) return stop()
            if (seconds <= best) return
            best = seconds
            const minutes = Math.floor(seconds / 60)
            if (minutes < 1) return
            const rest = Math.max(LEFT_TOAST_MS - (Date.now() - since), COUNTED_TOAST_MS)
            say(t('room.leftCounted', { room: name, count: minutes }), rest)
        })
    }, [t, serverId, channelId, name, sessionId])
    return useCallback(() => {
        if (session && asksBeforeLeaving(session, me)) ask({ sessionId: session.id, kind: 'leave', confirm: leave })
        else leave()
    }, [session, me, ask, leave])
}
