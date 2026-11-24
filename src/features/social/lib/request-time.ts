import { timeIn, wallClock } from '@/lib/time-zones'

const two = (n: number) => String(n).padStart(2, '0')

/** The calendar day at `at` in the zone, as days since 1970: two days compare by subtracting. */
function dayNumber(at: Date, timeZone?: string): number {
    const { year, month, day } = wallClock(at, timeZone)
    return Date.UTC(year, month - 1, day) / 86_400_000
}

/**
 * The time column of a request (C-30 › FriendRow/pending, D-110 R11), in
 * the account's zone: "19:48" today, `yesterday` the day before, "15/10"
 * earlier this year, "15/10/2025" before that.
 */
export function requestTime(at: Date, now: Date, yesterday: string, timeZone?: string): string {
    const daysAgo = dayNumber(now, timeZone) - dayNumber(at, timeZone)
    if (daysAgo <= 0) return timeIn(timeZone, at)
    if (daysAgo === 1) return yesterday
    const { year, month, day } = wallClock(at, timeZone)
    const date = `${two(day)}/${two(month)}`
    return year === wallClock(now, timeZone).year ? date : `${date}/${year}`
}
