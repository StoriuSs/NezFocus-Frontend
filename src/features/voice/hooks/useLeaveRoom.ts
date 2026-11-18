import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/voice'
import { joinRoom, leaveRoom } from '../lib/session'
import { useVoiceStore } from '../voice.store'
import type { VoiceRoom } from '../types'

/** How long the Toast after leaving stays (C-21 Rời phòng: 8 seconds). */
const LEFT_TOAST_MS = 8000

/**
 * Leave, from the room's controls or the dock (C-21): no question asked, then
 * a Toast "Left {room} · Join again" (07 P4: a voice room counts no minutes).
 * Joining again from it may happen on any page: failed, a Toast says why, as
 * the preview page would.
 */
export function useLeaveRoom(room: Pick<VoiceRoom, 'serverId' | 'channelId' | 'name'>): () => void {
    const { t } = useTranslation('voice')
    const { serverId, channelId, name } = room
    return useCallback(() => {
        void leaveRoom()
        toast(t('room.left', { room: name }), {
            id: 'voice-left',
            duration: LEFT_TOAST_MS,
            action: {
                label: t('room.joinAgain'),
                onClick: () =>
                    void joinRoom({ serverId, channelId, name }).then((joined) => {
                        if (joined) return
                        const refused = useVoiceStore.getState().problem?.kind === 'refused'
                        toast(t(refused ? 'preview.noConnect' : 'preview.joinError'), { id: 'voice-join-failed' })
                    })
            }
        })
    }, [t, serverId, channelId, name])
}
