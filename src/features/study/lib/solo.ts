import type { FocusSession } from '../types'

/** A Solo's wait for Học tiếp, as the backend's WAIT_MINUTES (REQ-STUDY-05). */
const WAIT_MS = 10 * 60_000

/**
 * A Solo's seconds at `now` (D-234): those the backend counted
 * (`countedSeconds`), and the focus stretch running since
 * `stretchStartedAt`, up to the phase's end ("18 phút bạn đã học vẫn được
 * tính"). Paused, waiting or between stretches: the counted ones alone.
 */
export function soloSecondsAt(session: FocusSession, now: number): number {
    const counted = session.countedSeconds ?? 0
    if (session.status !== 'running' || !session.stretchStartedAt) return counted
    const end = session.phaseEndsAt ? Math.min(now, Date.parse(session.phaseEndsAt)) : now
    return counted + Math.max(0, Math.floor((end - Date.parse(session.stretchStartedAt)) / 1000))
}

/** What is left of a waiting Solo's 10 minutes at `now`, in milliseconds ("08:12", REQ-STUDY-05). */
export function waitLeftMs(session: FocusSession, now: number): number {
    if (session.status !== 'waiting' || !session.waitingUntil) return 0
    return Math.max(0, Date.parse(session.waitingUntil) - now)
}

/**
 * A waiting Solo read again (back online) as gone once its wait was over:
 * ended as expired at its break's end, 10 minutes before its wait's end as
 * the backend works it out (`breakEndOf`: a break paused ends later than it
 * began plus its length), as the backend ends it (REQ-STUDY-05;
 * D-234: its summary for the tab that knew it waiting). Null while its wait
 * may still run, or when it was not waiting: then it was stopped elsewhere,
 * its seconds unknown.
 */
export function expiredOf(held: FocusSession, now: number): FocusSession | null {
    if (held.status !== 'waiting' || !held.waitingUntil || now < Date.parse(held.waitingUntil)) return null
    const breakEnd = Date.parse(held.waitingUntil) - WAIT_MS
    return {
        ...held,
        status: 'ended',
        endedReason: 'expired',
        endedAt: new Date(breakEnd).toISOString(),
        waitingUntil: null
    }
}
