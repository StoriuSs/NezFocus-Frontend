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
}

export const useStudyStore = create<StudyState>(() => ({ news: {}, pausedBy: {}, ended: {} }))

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
