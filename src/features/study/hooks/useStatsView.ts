import { accountTimeZone } from '@/lib/time-zones'
import { useStudyPeriod } from '../api/useStudyPeriod'
import { useStudyToday } from '../api/useStudyToday'
import { periodNumbers } from '../lib/period-stats'
import type { StatsPeriod } from '../lib/periods'
import { dayStartOf, streakShown, todaySecondsAt } from '../lib/today'
import { dateKeyAt } from '../lib/week'
import type { AnySession } from '../types'
import { useNewDay } from './useNewDay'
import { useSessionClock } from './useSessionClock'

/**
 * The Stats page's numbers as they stand now (08 S-STUDY-03, D-235): the
 * period's from the backend, today's growing each minute of focus in the
 * session one is in (`joined`: this tab's room's, else `solo`), the streak
 * shown, and whether the page is the empty one (never studied, nothing
 * today, in no session). Today moves on at midnight with no session too.
 */
export function useStatsView(
    period: StatsPeriod,
    joined: AnySession | null,
    solo: AnySession | null,
    { live = true }: { live?: boolean } = {}
) {
    const session = joined ?? solo
    // `live`: each second while the focus runs (the body); off, each new day (the picker: its day, its stops).
    const now = Math.max(useSessionClock(live ? session : null), useNewDay())
    const zone = accountTimeZone()
    const today = dateKeyAt(now, zone)
    const day = useStudyToday()
    const stats = useStudyPeriod(period, today)

    if (!day.data || !stats.data) return { now, zone, today, day, stats, view: null }
    const dayStart = dayStartOf(now, zone)
    const todaySeconds = todaySecondsAt(day.data, session, now, dayStart)
    const streak = streakShown(day.data, session, now, dayStart)
    return {
        now,
        zone,
        today,
        day,
        stats,
        view: {
            session,
            todaySeconds,
            streak,
            longest: Math.max(stats.data.streak.longest, streak),
            firstDate: stats.data.firstDate,
            empty: stats.data.firstDate === null && todaySeconds === 0 && session === null,
            numbers: periodNumbers(stats.data, period, today, todaySeconds, joined ? 'room' : solo ? 'solo' : null)
        }
    }
}
