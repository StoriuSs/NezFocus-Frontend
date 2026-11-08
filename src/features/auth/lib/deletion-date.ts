import { wallClock } from '@/lib/time-zones'

const DAY_MS = 24 * 60 * 60 * 1000

/** How long an account waits between the request to delete it and its deletion (REQ-AUTH-09, D-141). */
export const DELETION_WAIT_MS = 14 * DAY_MS

/** The calendar day at `at` in the zone, as a number of days: comparable with another one. */
function dayNumber(at: Date, timeZone?: string): number {
    const { year, month, day } = wallClock(at, timeZone)
    return Date.UTC(year, month - 1, day) / DAY_MS
}

/**
 * The day an account waiting to be deleted goes, written dd/mm/yyyy in both
 * languages (01-auth.md › Quy ước › Số), in the account's zone when known,
 * else the browser's: on the sign-in page nobody is signed in to say which.
 */
export function deletionDate(deletesAt: Date, timeZone?: string): string {
    const { year, month, day } = wallClock(deletesAt, timeZone)
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

/**
 * Calendar days from `now` to that day: "11 days left" on the 18th for the
 * 29th, whatever the hour. At least 1, so the last day reads "1 day left"
 * (01-auth.md › edge cases).
 */
export function deletionDaysLeft(deletesAt: Date, now: Date, timeZone?: string): number {
    return Math.max(1, dayNumber(deletesAt, timeZone) - dayNumber(now, timeZone))
}
