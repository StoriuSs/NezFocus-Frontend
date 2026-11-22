import api from '@/lib/api'
import type { ApiEnvelope, ApiModel } from '@/lib/api-types'
import type { StudyCycle } from '../lib/study-cycle'
import type { FocusSession, SessionCommand, StudyToday } from '../types'

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
 * Pause, resume, skip or stop (REQ-STUDY-03), with the version seen: an
 * older one changes nothing and gets the session as it is (D-225).
 */
export async function commandSession(sessionId: string, command: SessionCommand, version: number) {
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

/** GET /me/study-stats, this week: what one's day holds so far (REQ-STUDY-07, D-231). */
export async function fetchStudyToday(): Promise<StudyToday> {
    const response = await api.get<ApiEnvelope<ApiModel<'StudyStatsResponseDto'>>>('/me/study-stats')
    const { todaySeconds, countedUntil, streak } = response.data.data
    return { todaySeconds, countedUntil, streak: streak.current }
}
