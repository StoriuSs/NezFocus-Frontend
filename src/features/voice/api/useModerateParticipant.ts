import { useMutation } from '@tanstack/react-query'
import type { RoomAction } from '../types'
import { disconnectParticipant, muteParticipant, unmuteParticipant } from './voice.api'

const CALLS = { mute: muteParticipant, unmute: unmuteParticipant, disconnect: disconnectParticipant }

/**
 * Mute, unmute or disconnect someone in `channelId`. No cache to change: the
 * room's list comes back by `voice_state.updated` (D-205). A refusal (rank,
 * the bit taken, the person gone) is the query client's Toast, as the spec
 * gives no words of its own.
 */
export function useModerateParticipant(channelId: string) {
    return useMutation({
        mutationFn: ({ action, userId }: { action: RoomAction; userId: string }) => CALLS[action](channelId, userId)
    })
}
