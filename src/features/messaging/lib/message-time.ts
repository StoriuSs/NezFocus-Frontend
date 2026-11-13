import type { TFunction } from 'i18next'
import '@/i18n/messaging'
import { timeIn, wallClock } from '@/lib/time-zones'

/*
 * Times in the chat (C-10 › Giờ ở đầu tin, vạch ngày), in the account's time
 * zone (NFR-I18N-01): "20:02" today, "Hôm qua 20:00", "16/10/2026 20:00"
 * before; on hover "Thứ 6, 16/10/2026 lúc 20:00"; date lines "Hôm nay",
 * "Hôm qua", "Thứ 6, 16/10/2026". 24-hour, day/month/year in both languages.
 */

type MessagingT = TFunction<'messaging'>

/** The calendar day at `at` in the zone, as days since 1970: two days compare by subtracting. */
function dayNumber(at: Date, timeZone?: string): number {
    const { year, month, day } = wallClock(at, timeZone)
    return Date.UTC(year, month - 1, day) / 86_400_000
}

/** "y-m-d" of the day at `at` in the zone: the key of its date line. */
export function dayKey(at: Date, timeZone?: string): string {
    const { year, month, day } = wallClock(at, timeZone)
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function dateOf(at: Date, timeZone?: string): string {
    const { year, month, day } = wallClock(at, timeZone)
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

const weekdayOf = (at: Date, t: MessagingT, timeZone?: string) => {
    const weekday = wallClock(at, timeZone).weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6
    return t(`time.weekday_${weekday}`)
}

/** The time at the head of a message, and on hover beside a grouped one ("20:02" alone there). */
export function messageTime(at: Date, now: Date, timeZone: string | undefined, t: MessagingT): string {
    const time = timeIn(timeZone, at)
    const daysAgo = dayNumber(now, timeZone) - dayNumber(at, timeZone)
    if (daysAgo === 0) return time
    if (daysAgo === 1) return t('time.yesterdayAt', { time })
    return `${dateOf(at, timeZone)} ${time}`
}

/** The whole moment, for the tooltip on a time. */
export function messageTimeInFull(at: Date, timeZone: string | undefined, t: MessagingT): string {
    return t('time.full', {
        weekday: weekdayOf(at, t, timeZone),
        date: dateOf(at, timeZone),
        time: timeIn(timeZone, at)
    })
}

/** The words on a date line. */
export function dayLabel(at: Date, now: Date, timeZone: string | undefined, t: MessagingT): string {
    const daysAgo = dayNumber(now, timeZone) - dayNumber(at, timeZone)
    if (daysAgo === 0) return t('time.today')
    if (daysAgo === 1) return t('time.yesterday')
    return `${weekdayOf(at, t, timeZone)}, ${dateOf(at, timeZone)}`
}
