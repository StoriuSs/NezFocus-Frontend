import type { TFunction } from 'i18next'

const pad = (n: number) => String(n).padStart(2, '0')
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const DAY_MS = 86_400_000
/** What Date#getDay gives: 0 is Sunday. */
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * When a session was last used, as its row says it (10-settings › Số và
 * giờ): "Hôm nay 21:30", "Hôm qua 22:15", "Thứ 6, 16/10/2026", and over a
 * year ago the date alone, "14/03/2025". The browser's clock and time zone:
 * the account's time zone comes to the client with its settings (L13).
 */
export function lastActiveLabel(when: Date, now: Date, t: TFunction<'auth'>): string {
    const time = `${pad(when.getHours())}:${pad(when.getMinutes())}`
    const date = `${pad(when.getDate())}/${pad(when.getMonth() + 1)}/${when.getFullYear()}`
    // Rounded: a day across a daylight-saving change is 23 or 25 hours.
    const daysAgo = Math.round((startOfDay(now) - startOfDay(when)) / DAY_MS)
    if (daysAgo <= 0) return t('settings.sessions.today', { time })
    if (daysAgo === 1) return t('settings.sessions.yesterday', { time })
    const yearAgo = new Date(now)
    yearAgo.setFullYear(now.getFullYear() - 1)
    if (when < yearAgo) return date
    return t('settings.sessions.dated', { weekday: t(`settings.sessions.weekday.${when.getDay() as Weekday}`), date })
}

/** "Safari · macOS": what the API could read of the browser and the system (D-138). */
export function deviceName(session: { browser: string | null; os: string | null }, t: TFunction<'auth'>): string {
    return [session.browser ?? t('settings.sessions.unknownBrowser'), session.os].filter(Boolean).join(' · ')
}
