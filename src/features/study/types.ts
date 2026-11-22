import type { StudyCycle } from './lib/study-cycle'
import type { ApiModel } from '@/lib/api-types'

/**
 * A study session as the API gives it (SRS 5.1, D-220): in GET /servers on
 * its room, in the answer to each command, and in `focus_session.*`. Its
 * clock is the server's (`serverTime`, D-18); `version` grows with each
 * change (D-225).
 */
export type FocusSession = ApiModel<'FocusSessionResponseDto'>

export type SessionPhase = FocusSession['phase']

/** What was done to a session (`action` of `focus_session.*`); `phase_end`, `host` and `end` happen by themselves. */
export type SessionAction =
    | 'start'
    | 'pause'
    | 'resume'
    | 'skip'
    | 'stop'
    | 'continue'
    | 'config'
    | 'phase_end'
    | 'host'
    | 'end'

/** One person's seconds in a session that ended (D-49). */
export interface SessionSummary {
    userId: string
    seconds: number
}

/**
 * `focus_session.started / updated / ended` (SRS 5.2): the whole session,
 * what was done and by whom (null when it happened by itself), and once it
 * ended every participant's seconds.
 */
export interface SessionNews extends FocusSession {
    action: SessionAction
    actorId: string | null
    summaries?: SessionSummary[]
}

/** The commands of a running or paused session (REQ-STUDY-03), each sent with the version seen. */
export type SessionCommand = 'pause' | 'resume' | 'skip' | 'stop'

/** `streak.updated` (SRS 5.2), and the same numbers from GET /me/study-stats: one's day so far. */
export interface StudyToday {
    todaySeconds: number
    /** Where the count of the session one is in stands; null when in none (D-224, D-231). */
    countedUntil: string | null
    streak: number
}

/** A study room as its page hands it to the session's parts (the voice feature's `VoiceRoom`, its study fields). */
export interface StudyRoomView {
    channelId: string
    isStudyRoom: boolean
    /** Its session not yet ended, or null (D-220). */
    session: RoomSession | null
    /** The cycle a session starts with: "Bắt đầu Tập trung 25 phút". */
    cycle: StudyCycle
    /** Who may start: anyone in it, or only those with MANAGE_STUDY_ROOMS (REQ-STUDY-01). */
    canStart: boolean
    /** MANAGE_STUDY_ROOMS in the room: the Host's controls without being Host (07 › luật 6). */
    canManage: boolean
}

/** A room's session as GET /servers holds it on its room: running or paused, nothing of how it ends (D-220). */
export type RoomSession = ApiModel<'RoomSessionResponseDto'>

/** Either: what the ring, the controls and the rules read is in both. */
export type AnySession = FocusSession | RoomSession
