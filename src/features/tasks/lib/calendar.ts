/** A date on the calendar, without a clock or a zone: what the picker's grid holds (C-43). */
export interface Day {
    year: number
    month: number
    day: number
}

const DAY = 86_400_000

const toUtc = ({ year, month, day }: Day) => Date.UTC(year, month - 1, day)
const fromUtc = (ms: number): Day => {
    const at = new Date(ms)
    return { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate() }
}

export const sameDay = (a: Day, b: Day) => a.year === b.year && a.month === b.month && a.day === b.day
/** Negative when `a` is before `b`. */
export const compareDays = (a: Day, b: Day) => toUtc(a) - toUtc(b)
export const addDays = (day: Day, count: number): Day => fromUtc(toUtc(day) + count * DAY)
/** 0 is Sunday, as Date#getDay. */
export const weekdayOf = (day: Day) => new Date(toUtc(day)).getUTCDay()

/** The same day in another month, the last of that month when it has fewer days (Page Up / Down). */
export function addMonths(day: Day, count: number): Day {
    const first = new Date(Date.UTC(day.year, day.month - 1 + count, 1))
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
    return { year: first.getUTCFullYear(), month: first.getUTCMonth() + 1, day: Math.min(day.day, last) }
}

/**
 * The weeks a month's grid shows, Monday first (C-43 › T2 … CN): from the
 * Monday on or before the 1st to the Sunday on or after its last day.
 */
export function monthWeeks(year: number, month: number): Day[][] {
    const first: Day = { year, month, day: 1 }
    const start = addDays(first, -((weekdayOf(first) + 6) % 7))
    const weeks: Day[][] = []
    for (let cursor = start; ; ) {
        const week = Array.from({ length: 7 }, (_, index) => addDays(cursor, index))
        weeks.push(week)
        cursor = addDays(cursor, 7)
        if (cursor.month !== month) break
    }
    return weeks
}

/** "Thứ 6 tới": the first Friday after today (today a Friday: the next one), C-43. */
export function nextFriday(today: Day): Day {
    const ahead = (5 - weekdayOf(today) + 7) % 7 || 7
    return addDays(today, ahead)
}

/** "23:59" or "2359", 24-hour, into hours and minutes; anything else is not a time (C-43 › Ô Giờ). */
export function readTime(text: string): { hour: number; minute: number } | null {
    const match = /^(\d{1,2}):?(\d{2})$/.exec(text.trim())
    if (!match) return null
    const hour = Number(match[1])
    const minute = Number(match[2])
    return hour < 24 && minute < 60 ? { hour, minute } : null
}

export const timeText = ({ hour, minute }: { hour: number; minute: number }) =>
    `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

/** ↑ ↓ in the time field: 15 minutes on or back, round the clock. */
export function stepTime(time: { hour: number; minute: number }, steps: number): { hour: number; minute: number } {
    const total = (((time.hour * 60 + time.minute + steps * 15) % 1440) + 1440) % 1440
    return { hour: Math.floor(total / 60), minute: total % 60 }
}
