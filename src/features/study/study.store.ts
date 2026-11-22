import { create } from 'zustand'
import type { FocusSession, SessionNews } from './types'

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
    /**
     * One's last Solo ended while this tab was open (D-234), its seconds in
     * `countedSeconds`: its summary on the Solo page, the toasts of its end.
     * Only heard (or found expired on reading again), never read: a reload
     * opens the Solo page empty (`idle`).
     */
    soloEnded: SoloEnded | null
}

/** One's Solo ended, and whether this tab asked for it: its Dừng, or a start or join that ends it (D-103). */
export interface SoloEnded {
    session: FocusSession
    /** Stopped by this tab ("Bạn đã dừng học một mình"); else elsewhere, expired, or a room's session took it. */
    stoppedHere: boolean
    /** Ended by a room's session this tab asked to join or start ("Đã dừng học một mình · N phút"). */
    yieldedHere: boolean
}

/** `focus_session.left`: one's place in a room's session closed, with one's seconds in it, every stay added. */
export interface SessionLeft {
    sessionId: string
    channelId: string
    seconds: number
}

export const useStudyStore = create<StudyState>(() => ({
    news: {},
    pausedBy: {},
    ended: {},
    left: {},
    soloEnded: null
}))

/** What this tab asked of its Solo: the Solo it stopped, the one a room's session it joins or starts ends. */
const asked: { stop: string | null; yield: string | null } = { stop: null, yield: null }

/**
 * This tab sends Dừng to Solo `id`: its end is "Bạn đã dừng học một mình",
 * whichever word of it comes first; null: the Dừng sent was refused.
 */
export function askToStopSolo(id: string | null): void {
    asked.stop = id
}

/** This tab joins or starts a room's session over Solo `id` (D-103): its end is the tab's own. */
export function askToYieldSolo(id: string): void {
    asked.yield = id
}

/** One's Solo ended (D-234): the first word of it kept, the answer to a command or the event. */
export function hearSoloEnded(session: FocusSession): void {
    if (useStudyStore.getState().soloEnded?.session.id === session.id) return
    // What this tab asked counts only for the end it asked for: a Dừng refused or a join failed leaves it moot.
    const stoppedHere = asked.stop === session.id && session.endedReason === 'stopped'
    const yieldedHere = asked.yield === session.id && session.endedReason === 'joined_room'
    if (asked.stop === session.id) asked.stop = null
    if (asked.yield === session.id) asked.yield = null
    useStudyStore.setState({ soloEnded: { session, stoppedHere, yieldedHere } })
}

/** The Solo page shown its summary and left, or a new Solo started: no summary any more. */
export function forgetSoloEnded(): void {
    useStudyStore.setState({ soloEnded: null })
}

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
