import { create } from 'zustand'
import type { SessionNews } from './types'

interface StudyState {
    /**
     * Each room's last `focus_session.*` heard, the later ones only: who did
     * what, for the toasts of 07.
     */
    news: Record<string, SessionNews>
    /**
     * Who paused each paused session, as heard ("Bạn đã tạm dừng" / "An đã
     * tạm dừng"); a session read paused, its pause unheard (a reload, one
     * joining later), has none: "Đã tạm dừng" (D-231).
     */
    pausedBy: Record<string, string | null>
    /**
     * Each room's last session ended, with everyone's seconds (D-49): its
     * summary stays in the ring until a new session or one leaves the room.
     * Only heard, never read: a reload counts as leaving (D-231).
     */
    ended: Record<string, SessionNews>
    /**
     * One's seconds in each room's session, as `focus_session.left` told
     * them when one's place there closed (D-233), and when it was heard: the
     * toast of leaving adds "N phút đã được tính".
     */
    left: Record<string, SessionLeft & { heardAt: number }>
}

/** `focus_session.left`: one's place in a room's session closed, with one's seconds in it, every stay added. */
export interface SessionLeft {
    sessionId: string
    channelId: string
    seconds: number
}

export const useStudyStore = create<StudyState>(() => ({ news: {}, pausedBy: {}, ended: {}, left: {} }))

/** One's place in a room's session closed (D-233). */
export function hearLeft(left: SessionLeft): void {
    useStudyStore.setState((state) => ({ left: { ...state.left, [left.channelId]: { ...left, heardAt: Date.now() } } }))
}

/**
 * Hears one's seconds in session `sessionId` of room `channelId` (null:
 * whichever, the room's session unknown here any more) each time its
 * `focus_session.left` comes, heard at `since` or after (the leaving may
 * come back before the call that asked for it): at once if already heard,
 * then each newer one. Returns the way to stop.
 */
export function hearSessionLeft(
    channelId: string,
    sessionId: string | null,
    since: number,
    listener: (seconds: number) => void
): () => void {
    // Each one heard is a new entry: the store changing for something else tells nothing again.
    let last: StudyState['left'][string] | undefined
    const check = (state: StudyState) => {
        const left = state.left[channelId]
        if (!left || left === last || (sessionId !== null && left.sessionId !== sessionId) || left.heardAt < since)
            return
        last = left
        listener(left.seconds)
    }
    check(useStudyStore.getState())
    return useStudyStore.subscribe(check)
}

/** A room's event heard (already known to be later than the last). */
export function hearNews(news: SessionNews): void {
    const channelId = news.channelId
    if (!channelId) return
    useStudyStore.setState((state) => {
        const pausedBy = { ...state.pausedBy }
        if (news.status !== 'paused') delete pausedBy[news.id]
        else if (news.action === 'pause') pausedBy[news.id] = news.actorId
        return {
            news: { ...state.news, [channelId]: news },
            pausedBy,
            ended: news.status === 'ended' ? { ...state.ended, [channelId]: news } : state.ended
        }
    })
}
