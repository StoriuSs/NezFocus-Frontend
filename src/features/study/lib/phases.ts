import type { StudyCycle } from './study-cycle'
import type { AnySession, FocusSession, RoomSession, SessionPhase } from '../types'

/** A minute of a phase, as the ring measures its length (the server's own minute may be shorter in tests). */
const MINUTE_MS = 60_000

/** How long a phase of the session's cycle is, in minutes. */
export function phaseMinutes(session: AnySession, phase: SessionPhase = session.phase): number {
    if (phase === 'focus') return session.focusMinutes
    if (phase === 'short_break') return session.shortBreakMinutes
    return session.longBreakMinutes ?? session.shortBreakMinutes
}

/** The round the phase belongs to, from 1: a focus phase and the break after it (C-18 "Vòng 2"). */
export const roundOf = (session: AnySession): number => Math.floor(session.phaseIndex / 2) + 1

/**
 * The phase that comes next, as the backend works it out (focus-session.rules.ts
 * `phaseOf`): a break after each focus, long when the cycle has long breaks and
 * the round is a multiple of `longBreakEvery`; focus after each break.
 */
export function nextPhaseOf(session: AnySession): SessionPhase {
    if (session.phase !== 'focus') return 'focus'
    const { longBreakMinutes, longBreakEvery } = session
    return longBreakMinutes !== null && longBreakEvery !== null && roundOf(session) % longBreakEvery === 0
        ? 'long_break'
        : 'short_break'
}

/** What is left of the phase at `now` (the server's time), in milliseconds: frozen while paused. */
export function remainingMs(session: AnySession, now: number): number {
    if (session.status === 'paused') return Math.max(0, session.pausedRemainingMs ?? 0)
    if (session.status !== 'running' || !session.phaseEndsAt) return 0
    return Math.max(0, Date.parse(session.phaseEndsAt) - now)
}

/**
 * How much of the phase is gone, 0 to 1: the ring's arc (C-18: focus shows
 * what is left, a break fills up as it goes).
 */
export function phaseGone(session: AnySession, now: number): number {
    const length = phaseMinutes(session) * MINUTE_MS
    return Math.min(1, Math.max(0, 1 - remainingMs(session, now) / length))
}

/** "18:42": whole seconds left, rounded up so 00:00 is the phase's end (C-18 › Số). */
export function clockText(ms: number): string {
    const seconds = Math.ceil(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/** The big number's size is chosen by the phase's length when it began, and kept (C-18: ≥ 100 minutes, `timer-long`). */
export const isLongClock = (session: AnySession): boolean => phaseMinutes(session) >= 100

/**
 * Which of two states of a room's session is the later (D-225): of the
 * same session the higher version; of two sessions the one started later.
 * An event and a read may come in any order.
 */
export function isLater(
    told: Pick<AnySession, 'id' | 'version' | 'startedAt'>,
    held: Pick<AnySession, 'id' | 'version' | 'startedAt'>
): boolean {
    if (told.id === held.id) return told.version > held.version
    return Date.parse(told.startedAt) > Date.parse(held.startedAt)
}

/** The cycle a session runs with, as the cycle form takes it. */
export const sessionCycle = (session: AnySession): StudyCycle => ({
    focus: session.focusMinutes,
    shortBreak: session.shortBreakMinutes,
    longBreak: session.longBreakMinutes,
    longBreakEvery: session.longBreakEvery
})

/** A session as its room holds it (GET /servers): running or paused; ended (or a Solo waiting), none. */
export function roomSessionOf(session: FocusSession): RoomSession | null {
    if (session.status !== 'running' && session.status !== 'paused') return null
    return {
        id: session.id,
        hostId: session.hostId,
        focusMinutes: session.focusMinutes,
        shortBreakMinutes: session.shortBreakMinutes,
        longBreakMinutes: session.longBreakMinutes,
        longBreakEvery: session.longBreakEvery,
        status: session.status,
        phase: session.phase,
        phaseIndex: session.phaseIndex,
        phaseStartedAt: session.phaseStartedAt,
        phaseEndsAt: session.phaseEndsAt,
        pausedRemainingMs: session.pausedRemainingMs,
        stretchStartedAt: session.stretchStartedAt,
        startedAt: session.startedAt,
        version: session.version,
        serverTime: session.serverTime
    }
}
