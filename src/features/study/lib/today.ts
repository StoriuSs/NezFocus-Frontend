import { instantAt, wallClock } from '@/lib/time-zones'
import type { AnySession, StudyToday } from '../types'

/** The most a day counts (D-224: the 16-hour cap): past it, no more minutes show. */
export const DAY_CAP_SECONDS = 16 * 3600

/** Whether `held` was read after `told` (D-232): then it stays, whichever came last. */
export const isLaterRead = (held: Pick<StudyToday, 'readAt'>, told: Pick<StudyToday, 'readAt'>): boolean =>
    Date.parse(held.readAt) > Date.parse(told.readAt)

/** What a day needs to keep the streak going (REQ-STUDY-07: 15 minutes). */
export const STREAK_DAY_SECONDS = 15 * 60

/** When today began at `now` in the zone given (the account's; the browser's while unknown), in milliseconds. */
export function dayStartOf(now: number, timeZone?: string): number {
    const { year, month, day } = wallClock(new Date(now), timeZone)
    return instantAt({ year, month, day, hour: 0, minute: 0 }, timeZone).getTime()
}

/**
 * The whole seconds of the session's running focus stretch between `from`
 * and `to` (the server's times), never past the phase's end (the stretch
 * counts no further); 0 while paused, in a break, or with no session.
 */
export function runningBetween(session: AnySession | null, from: number, to: number): number {
    if (session?.status !== 'running' || session.phase !== 'focus' || !session.stretchStartedAt || !session.phaseEndsAt)
        return 0
    const span = Math.min(to, Date.parse(session.phaseEndsAt)) - Math.max(from, Date.parse(session.stretchStartedAt))
    return Math.max(0, Math.floor(span / 1000))
}

/**
 * One's seconds today at `now` (the server's time), counting the focus
 * running in the room one is in (D-224, D-231): what the last count wrote,
 * plus the running focus stretch from the latest of where that count stopped
 * (`countedUntil`), where the stretch began and where today began, up to now
 * or the phase's end, whichever comes first (the stretch counts no further).
 * A last count from before today began wrote yesterday's seconds: today
 * starts from 0 then (07 › Edge: back to 0 at midnight). Never past the
 * 16-hour cap. Nothing added while paused, in a break, or in no session
 * (`countedUntil` null).
 */
export function todaySecondsAt(today: StudyToday, session: AnySession | null, now: number, dayStart: number): number {
    const counted = today.countedUntil ? Date.parse(today.countedUntil) : null
    if (counted === null) return Math.min(DAY_CAP_SECONDS, today.todaySeconds)
    const base = counted < dayStart ? 0 : today.todaySeconds
    return Math.min(DAY_CAP_SECONDS, base + runningBetween(session, Math.max(counted, dayStart), now))
}

/**
 * The streak to show at `now` (STUDY-07, D-224): the last count's, one more
 * once today reaches 15 minutes before a count has written it (the backend
 * writes it at the next count). A last count from before today began was of
 * yesterday, its streak yesterday's: yesterday is then what it wrote plus the
 * focus that ran on to midnight; short of 15 minutes, the streak broke (0
 * until today reaches 15, then 1); reaching 15 only with that run, yesterday
 * is one more day than the count said (REQ-STUDY-07).
 */
export function streakShown(today: StudyToday, session: AnySession | null, now: number, dayStart: number): number {
    const counted = today.countedUntil ? Date.parse(today.countedUntil) : null
    let through = today.streak
    let countedToday = today.todaySeconds
    if (counted !== null && counted < dayStart) {
        countedToday = 0
        if (today.todaySeconds < STREAK_DAY_SECONDS) {
            const yesterday = today.todaySeconds + runningBetween(session, counted, dayStart)
            through = yesterday >= STREAK_DAY_SECONDS ? today.streak + 1 : 0
        }
    }
    const reached = todaySecondsAt(today, session, now, dayStart) >= STREAK_DAY_SECONDS
    return countedToday < STREAK_DAY_SECONDS && reached ? through + 1 : through
}
