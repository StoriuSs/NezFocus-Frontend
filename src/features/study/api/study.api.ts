import api from '@/lib/api'
import type { ApiEnvelope, ApiModel } from '@/lib/api-types'
import type { StudyCycle } from '../lib/study-cycle'
import type { FocusSession, SoloCommand, SoloState, StudyToday, StudyWeek } from '../types'

const cycleBody = (cycle: StudyCycle) => ({
    focusMinutes: cycle.focus,
    shortBreakMinutes: cycle.shortBreak,
    longBreakMinutes: cycle.longBreak,
    longBreakEvery: cycle.longBreakEvery
})

/**
 * POST /channels/{id}/focus-session (REQ-STUDY-01, 02): a session for the
 * whole room, the one starting it its Host; with no cycle, the room's own.
 * Idempotent: a retry with the same key is the same session.
 */
export async function startRoomSession(
    channelId: string,
    cycle: StudyCycle | null,
    idempotencyKey: string
): Promise<FocusSession> {
    const response = await api.post<ApiEnvelope<FocusSession>>(
        `/channels/${channelId}/focus-session`,
        cycle ? cycleBody(cycle) : {},
        { headers: { 'Idempotency-Key': idempotencyKey } }
    )
    return response.data.data
}

/**
 * Pause, resume, skip or stop (REQ-STUDY-03), and a waiting Solo's Học tiếp
 * (`continue`, REQ-STUDY-05), with the version seen: an older one changes
 * nothing and gets the session as it is (D-225).
 */
export async function commandSession(sessionId: string, command: SoloCommand, version: number) {
    const response = await api.post<ApiEnvelope<FocusSession>>(`/focus-sessions/${sessionId}/${command}`, {
        version
    })
    return response.data.data
}

/** A new cycle while paused (D-21): the phase starts again with its new length, still paused (D-50). */
export async function changeSessionCycle(sessionId: string, version: number, cycle: StudyCycle) {
    const response = await api.post<ApiEnvelope<FocusSession>>(`/focus-sessions/${sessionId}/config`, {
        version,
        ...cycleBody(cycle)
    })
    return response.data.data
}

/** GET /me/solo-session (REQ-STUDY-05, D-229): one's Solo not yet ended, or null, and the next start's cycle. */
export async function fetchSolo(): Promise<SoloState> {
    const response = await api.get<ApiEnvelope<ApiModel<'SoloSessionResponseDto'>>>('/me/solo-session')
    const { session, startCycle } = response.data.data
    return {
        session,
        startCycle: {
            focus: startCycle.focusMinutes,
            shortBreak: startCycle.shortBreakMinutes,
            longBreak: startCycle.longBreakMinutes,
            longBreakEvery: startCycle.longBreakEvery
        }
    }
}

/**
 * POST /me/solo-session (REQ-STUDY-05): a Solo with the cycle chosen, or with
 * none the last Solo's. Idempotent: a retry with the same key is the same Solo.
 */
export async function startSolo(cycle: StudyCycle | null, idempotencyKey: string): Promise<FocusSession> {
    const response = await api.post<ApiEnvelope<FocusSession>>('/me/solo-session', cycle ? cycleBody(cycle) : {}, {
        headers: { 'Idempotency-Key': idempotencyKey }
    })
    return response.data.data
}

type StudyStats = ApiModel<'StudyStatsResponseDto'>

const todayOf = ({ todaySeconds, countedUntil, streak, readAt }: StudyStats): StudyToday => ({
    todaySeconds,
    countedUntil,
    streak: streak.current,
    readAt
})

/** GET /me/study-stats, this week: what one's day holds so far (REQ-STUDY-07, D-231). */
export async function fetchStudyToday(): Promise<StudyToday> {
    const response = await api.get<ApiEnvelope<StudyStats>>('/me/study-stats')
    return todayOf(response.data.data)
}

/** GET /me/study-stats, this week (08 S-STUDY-01's chart, D-105), and the day so far it read with it. */
export async function fetchStudyWeek(): Promise<{ week: StudyWeek; today: StudyToday }> {
    const response = await api.get<ApiEnvelope<StudyStats>>('/me/study-stats')
    const stats = response.data.data
    return {
        week: {
            today: stats.today,
            days: stats.days.map((day) => ({ date: day.date, seconds: day.focusedSeconds })),
            longest: stats.streak.longest,
            firstDate: stats.firstDate
        },
        today: todayOf(stats)
    }
}

/** Who would control a session if its Host left now (D-233): for "Rời phòng?"; null when nobody present may. */
export type NextHost = ApiModel<'NextHostPersonResponseDto'> | null

/** GET /focus-sessions/{id}/next-host (REQ-STUDY-03, D-233): asked by the Host only. */
export async function fetchNextHost(sessionId: string): Promise<NextHost> {
    const response = await api.get<ApiEnvelope<ApiModel<'NextHostResponseDto'>>>(
        `/focus-sessions/${sessionId}/next-host`
    )
    return response.data.data.nextHost
}
