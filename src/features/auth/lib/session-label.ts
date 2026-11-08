import type { TFunction } from 'i18next'
import { wallClock, type WallClock } from '@/lib/time-zones'

const pad = (n: number) => String(n).padStart(2, '0')
/** Days since the epoch of a calendar date: exact, whatever summer time does to the hours between. */
const dayNumber = ({ year, month, day }: Pick<WallClock, 'year' | 'month' | 'day'>) =>
    Date.UTC(year, month - 1, day) / 86_400_000
/** What Date#getDay gives: 0 is Sunday. */
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * When a session was last used, as its row says it (10-settings › Số và
 * giờ): "Hôm nay 21:30", "Hôm qua 22:15", "Thứ 6, 16/10/2026", and over a
 * year ago the date alone, "14/03/2025". In the account's time zone
 * (NFR-I18N-01); in the browser's until the settings have loaded.
 */
export function lastActiveLabel(when: Date, now: Date, t: TFunction<'auth'>, timeZone?: string): string {
    const then = wallClock(when, timeZone)
    const today = wallClock(now, timeZone)
    const time = `${pad(then.hour)}:${pad(then.minute)}`
    const date = `${pad(then.day)}/${pad(then.month)}/${then.year}`
    const daysAgo = dayNumber(today) - dayNumber(then)
    if (daysAgo <= 0) return t('settings.sessions.today', { time })
    if (daysAgo === 1) return t('settings.sessions.yesterday', { time })
    if (dayNumber(then) < dayNumber({ ...today, year: today.year - 1 })) return date
    return t('settings.sessions.dated', { weekday: t(`settings.sessions.weekday.${then.weekday as Weekday}`), date })
}

/** "Safari · macOS": what the API could read of the browser and the system (D-138). */
export function deviceName(session: { browser: string | null; os: string | null }, t: TFunction<'auth'>): string {
    return [session.browser ?? t('settings.sessions.unknownBrowser'), session.os].filter(Boolean).join(' · ')
}
