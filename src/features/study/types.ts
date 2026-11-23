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

/** A Solo's commands: a room's, and Học tiếp of one waiting (REQ-STUDY-05). */
export type SoloCommand = SessionCommand | 'continue'

/**
 * One's Solo as GET /me/solo-session gives it and `solo_session.updated`
 * keeps it (D-229): the one not yet ended, or null; and the cycle the start
 * button names ("Bắt đầu Tập trung 50 phút": the last Solo's, 25/5 the first time).
 */
export interface SoloState {
    session: FocusSession | null
    startCycle: StudyCycle
}

/** `streak.updated` (SRS 5.2), and the same numbers from GET /me/study-stats: one's day so far. */
export interface StudyToday {
    todaySeconds: number
    /** Where the count of the session one is in stands; null when in none (D-224, D-231). */
    countedUntil: string | null
    streak: number
    /** When the backend read these numbers: of two reads (an event, GET), the later is kept (D-232). */
    readAt: string
}

/**
 * This week as GET /me/study-stats gives it (REQ-STUDY-07, D-105): every
 * day Monday to Sunday with its seconds, those still ahead at 0; the
 * longest streak; the first day ever counted. Today's own numbers live in
 * `StudyToday`, which events keep.
 */
export interface StudyWeek {
    /** Today in one's time zone (YYYY-MM-DD) as the backend read it: the days after it are ahead. */
    today: string
    days: { date: string; seconds: number }[]
    longest: number
    /** The first day with a second counted; null: never studied (08 S-STUDY-01 `never-studied`). */
    firstDate: string | null
}

/**
 * A period of the Stats page as GET /me/study-stats gives it (REQ-STUDY-07,
 * D-105, D-230): its days split room / Solo, totals, the comparison, the
 * mean, the lifetime total, the streak, today, a week's 4-week grid and the
 * best other week. The running focus is added by the page (D-235).
 */
export type StudyPeriodStats = ApiModel<'StudyStatsResponseDto'>

/** A line of the history (C-47, D-230): one session of one's, its place as one may know it now. */
export type StudyHistoryLine = ApiModel<'StudySessionLineResponseDto'>

/** A page of the history: 20 lines, the one one is in first on the first (D-230). */
export type StudyHistoryPage = ApiModel<'StudySessionPageResponseDto'>

/**
 * A page of the history as the Stats page holds it: with today's counted
 * seconds as it was read (null: today not read yet), what the line one is
 * in grows from until the history is read again (D-235).
 */
export interface StudyHistoryRead extends StudyHistoryPage {
    countedToday: number | null
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
