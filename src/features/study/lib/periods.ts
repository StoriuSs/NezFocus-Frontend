/** The Stats page (08 S-STUDY-03): this week with no period on its URL. */
export const STATS_PATH = '/study/stats'

/** How the Stats page reads the days (08 S-STUDY-03, D-105): a week, Monday to Sunday, or a calendar month. */
export type StatsView = 'week' | 'month'

/**
 * The period the Stats page shows: its view, the day it was named by (kept
 * when switching Tuần ↔ Tháng), and the days it runs, both in (YYYY-MM-DD,
 * one's zone).
 */
export interface StatsPeriod {
    view: StatsView
    /** The day being looked at: the week's from the URL or today; a month's first day, or today in this month. */
    date: string
    start: string
    end: string
}

const DAY_MS = 24 * 3600 * 1000

const instantOf = (date: string) => Date.parse(`${date}T00:00:00Z`)
const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** `date` moved by `days` (negative: back). */
export const addDays = (date: string, days: number): string => dateOf(instantOf(date) + days * DAY_MS)

/** The days from `from` to `to`, both in (1 for the same day). */
export const daysBetween = (from: string, to: string): number =>
    Math.round((instantOf(to) - instantOf(from)) / DAY_MS) + 1

/** Whether `date` is a real day as YYYY-MM-DD in 1900 → 2099 (what the API takes). */
export function isDateKey(date: string): boolean {
    return /^(19|20)\d{2}-\d{2}-\d{2}$/.test(date) && dateOf(instantOf(date)) === date
}

/** The period of `view` holding `date`. */
export function periodOf(view: StatsView, date: string): StatsPeriod {
    if (view === 'week') {
        const weekday = (new Date(instantOf(date)).getUTCDay() + 6) % 7
        const start = addDays(date, -weekday)
        return { view, date, start, end: addDays(start, 6) }
    }
    const start = `${date.slice(0, 7)}-01`
    const [year, month] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))]
    const end = dateOf(Date.UTC(year, month, 0))
    return { view, date, start, end }
}

/**
 * The period a Stats URL names (08 › Quy ước › URL): `?view=week&date=…`,
 * `?view=month&month=YYYY-MM`; anything else (none, or not a day) is the week
 * of `today`.
 */
export function periodFromSearch(search: URLSearchParams, today: string): StatsPeriod {
    const month = search.get('month')
    if (search.get('view') === 'month' && month && isDateKey(`${month}-01`)) {
        return periodOf('month', month === today.slice(0, 7) ? today : `${month}-01`)
    }
    const date = search.get('date')
    if (search.get('view') === 'week' && date && isDateKey(date)) return periodOf('week', date)
    return periodOf('week', today)
}

/** The URL's query for a period: what Back brings back. */
export function searchOf(period: StatsPeriod): string {
    return period.view === 'week' ? `?view=week&date=${period.date}` : `?view=month&month=${period.start.slice(0, 7)}`
}

/** The period before (`-1`) or after (`1`): a week by its Monday, a month by its first day (today in either, when they hold it). */
export function shiftPeriod(period: StatsPeriod, step: 1 | -1, today: string): StatsPeriod {
    if (period.view === 'week') {
        const week = periodOf('week', addDays(period.start, step * 7))
        return holdsToday(week, today) ? periodOf('week', today) : week
    }
    const [year, month] = [Number(period.start.slice(0, 4)), Number(period.start.slice(5, 7))]
    const first = dateOf(Date.UTC(year, month - 1 + step, 1))
    return periodOf('month', first.slice(0, 7) === today.slice(0, 7) ? today : first)
}

/**
 * Tuần ↔ Tháng, keeping the day looked at (08 S-STUDY-03 › Chọn kỳ): a
 * week's month is the month of its day; a month's week is this week in this
 * month, else the week of its first day (D-235).
 */
export const switchView = (period: StatsPeriod, view: StatsView): StatsPeriod =>
    view === period.view ? period : periodOf(view, period.date)

/** Whether the period holds today: "TUẦN NÀY", the running numbers, "›" off. */
export const holdsToday = (period: StatsPeriod, today: string): boolean => period.start <= today && today <= period.end

/** "›" is off on this period and any after it (08 S-STUDY-03 › Chọn kỳ). */
export const isLatest = (period: StatsPeriod, today: string): boolean => period.end >= today

/** "‹" is off on the period holding the first day counted, and any before it; with none counted, everywhere. */
export const isEarliest = (period: StatsPeriod, firstDate: string | null): boolean =>
    firstDate === null || period.start <= firstDate

/** The period's days gone by, today in (the mean's divisor); 0 for a period still ahead. */
export function daysGoneBy(period: StatsPeriod, today: string): number {
    if (today < period.start) return 0
    return daysBetween(period.start, today < period.end ? today : period.end)
}

/**
 * A month as the calendar draws it (C-46 `month`): its weeks Monday first,
 * the days outside it null (no cell).
 */
export function monthWeeks(period: StatsPeriod): (string | null)[][] {
    const first = periodOf('week', period.start).start
    const weeks: (string | null)[][] = []
    for (let monday = first; monday <= period.end; monday = addDays(monday, 7)) {
        weeks.push(
            Array.from({ length: 7 }, (_, index) => {
                const day = addDays(monday, index)
                return day >= period.start && day <= period.end ? day : null
            })
        )
    }
    return weeks
}
