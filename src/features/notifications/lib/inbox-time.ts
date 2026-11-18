import { timeIn, wallClock } from '@/lib/time-zones'

/*
 * Times in the inbox (06 › Quy ước › Thời gian), in the account's zone
 * (NFR-I18N-01): items in groups "HÔM NAY" / "HÔM QUA" / "TRƯỚC ĐÓ"; the
 * time column "21:30" today and yesterday, "16/10" before, "28/12/2025" in
 * another year; on hover "Thứ 6, 16/10/2026 · 21:59".
 */

export type DayGroup = 'today' | 'yesterday' | 'earlier'

const two = (n: number) => String(n).padStart(2, '0')

/** The calendar day at `at` in the zone, as days since 1970: two days compare by subtracting. */
function dayNumber(at: Date, timeZone?: string): number {
    const { year, month, day } = wallClock(at, timeZone)
    return Date.UTC(year, month - 1, day) / 86_400_000
}

/** The group of an item made at `at`, `now` being now. */
export function dayGroupOf(at: Date, now: Date, timeZone?: string): DayGroup {
    const daysAgo = dayNumber(now, timeZone) - dayNumber(at, timeZone)
    return daysAgo <= 0 ? 'today' : daysAgo === 1 ? 'yesterday' : 'earlier'
}

/** The time column of a row. */
export function rowTime(at: Date, now: Date, timeZone?: string): string {
    if (dayGroupOf(at, now, timeZone) !== 'earlier') return timeIn(timeZone, at)
    const { year, month, day } = wallClock(at, timeZone)
    const date = `${two(day)}/${two(month)}`
    return year === wallClock(now, timeZone).year ? date : `${date}/${year}`
}

/**
 * A task's due date in an item's words, "05/11 · 23:59", the year when it is
 * another: an item's words stay as made, so never "Hôm nay" (06 › Quy ước ›
 * Thời gian).
 */
export function dueDate(at: Date, now: Date, timeZone?: string): string {
    const { year, month, day } = wallClock(at, timeZone)
    const date = `${two(day)}/${two(month)}`
    return `${year === wallClock(now, timeZone).year ? date : `${date}/${year}`} · ${timeIn(timeZone, at)}`
}

/**
 * When a timeout ends, in its item's words (06 › moderation · tạm khóa): "22:30"
 * the day the item was made, "19/10 · 08:00" another day.
 */
export function timeoutEnd(until: Date, made: Date, now: Date, timeZone?: string): string {
    return dayNumber(until, timeZone) === dayNumber(made, timeZone)
        ? timeIn(timeZone, until)
        : dueDate(until, now, timeZone)
}

/** The whole moment, for the tooltip: the weekday (0 is Sunday), the date and the clock. */
export function momentOf(at: Date, timeZone?: string): { weekday: number; date: string; time: string } {
    const { year, month, day, weekday } = wallClock(at, timeZone)
    return { weekday, date: `${two(day)}/${two(month)}/${year}`, time: timeIn(timeZone, at) }
}

/** The items, newest first, in their day groups; a group with no item is left out. */
export function groupsOf<T extends { createdAt: string }>(
    items: readonly T[],
    now: Date,
    timeZone?: string
): { group: DayGroup; items: T[] }[] {
    const groups: { group: DayGroup; items: T[] }[] = []
    for (const item of items) {
        const group = dayGroupOf(new Date(item.createdAt), now, timeZone)
        const last = groups.at(-1)
        if (last?.group === group) last.items.push(item)
        else groups.push({ group, items: [item] })
    }
    return groups
}
