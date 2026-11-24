import type { StudyPeriodStats } from '../types'
import { daysGoneBy, type StatsPeriod } from './periods'

/** One day of a period as the Stats page draws it (C-45 `page`, C-46): its seconds now, today's growing. */
export interface PeriodDay {
    date: string
    seconds: number
    today: boolean
    /** Still ahead: no column, no number, an empty square. */
    ahead: boolean
}

/** The Stats page's numbers of a period as they stand now (08 S-STUDY-03 › Tương tác, D-235). */
export interface PeriodNumbers {
    days: PeriodDay[]
    total: number
    room: number
    solo: number
    /** Total less the period before's first days (`previous_seconds`); null: no comparison shown. */
    difference: number | null
    /** All of the period before was 0: "Tuần trước chưa học". */
    nothingBefore: boolean
    average: number
    allTime: number
    /** The 4-week grid's days, the week shown last; null for a month. */
    grid: PeriodDay[] | null
    /** The week shown is one's best (D-230): its total now greater than any other week's. */
    best: boolean
}

/**
 * The numbers of a period at a moment (D-235): what the backend counted,
 * today's as it stands now (`todaySeconds`, the focus running in: it grows
 * each minute). What today gained since the read goes to the period it
 * falls in, to the side of the session one is in (`kind`; a room's when in
 * none: a count since the read, soon read again), and to the lifetime total.
 * A read from another day (just past midnight, the new day's read coming)
 * adds nothing. `before`: the focus run to midnight no count has written
 * yet (D-236), yesterday's: to its day, its period, its side and the
 * lifetime the same way.
 */
export function periodNumbers(
    stats: StudyPeriodStats,
    period: StatsPeriod,
    today: string,
    todaySeconds: number,
    kind: 'room' | 'solo' | null,
    before: { date: string; seconds: number } | null = null
): PeriodNumbers {
    const read = stats.today === today
    const gained = read ? Math.max(0, todaySeconds - stats.todaySeconds) : 0
    const late = read && before ? before : null
    const inPeriod = (date: string) => period.start <= date && date <= period.end
    const dayOf = ({ date, focusedSeconds }: { date: string; focusedSeconds: number }): PeriodDay => ({
        date,
        seconds:
            date === today ? focusedSeconds + gained : focusedSeconds + (late && date === late.date ? late.seconds : 0),
        today: date === today,
        ahead: date > today
    })
    const added = (inPeriod(today) ? gained : 0) + (late && inPeriod(late.date) ? late.seconds : 0)
    const total = stats.totalSeconds + added
    const gone = daysGoneBy(period, today)
    return {
        days: stats.days.map(dayOf),
        total,
        room: stats.roomSeconds + (kind === 'solo' ? 0 : added),
        solo: stats.soloSeconds + (kind === 'solo' ? added : 0),
        difference: stats.previousSeconds === null ? null : total - stats.previousSeconds,
        nothingBefore: stats.previousPeriodSeconds === 0,
        average: gone === 0 ? 0 : Math.floor(total / gone),
        allTime: stats.allTimeSeconds + gained + (late?.seconds ?? 0),
        grid: stats.grid ? stats.grid.map(dayOf) : null,
        best: stats.bestOtherWeekSeconds !== null && total > stats.bestOtherWeekSeconds
    }
}
