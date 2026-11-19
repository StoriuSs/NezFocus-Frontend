import { useVoiceStore } from '../voice.store'

/**
 * Whether a moderator has this tab's mic muted (D-207): their last word
 * (`voice.muted`) while the room's list has not caught up yet, else the
 * list's own `modMuted` for one's row (`listed`).
 */
export function useModMuted(listed: boolean): boolean {
    const said = useVoiceStore((state) => state.modMuted)
    return said ?? listed
}
