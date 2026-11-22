import { useStudyStore } from '../study.store'
import type { SessionNews } from '../types'

/**
 * The room's last session ended, if it ended while one was in the room this
 * time (D-49): a summary of one before one joined is not one's own, and a
 * reload counts as leaving (D-231). `none`: the room has no session now.
 */
export function useEndedHere(channelId: string, none: boolean, joinedAt: string | null): SessionNews | null {
    const ended = useStudyStore((state) => state.ended[channelId])
    if (!none || !ended?.endedAt || !joinedAt) return null
    return Date.parse(ended.endedAt) >= Date.parse(joinedAt) ? ended : null
}
