import { folded } from '@/lib/utils'

/**
 * Time zones to pick from (C-25, REQ-AUTH-08): every IANA zone the browser
 * knows, as "GMT+7 · Hồ Chí Minh", ordered by offset, then city.
 *
 * The value saved is the zone's IANA name, as the browser spells it. The API
 * accepts any name its ICU knows and keeps it as sent; it refuses bare
 * offsets (`Etc/GMT+7`) and names without a region, as this list leaves them
 * out (the backend's timezone.rules.ts).
 */

export interface TimeZoneOption {
    /** The IANA name, what is saved: `Asia/Ho_Chi_Minh`. */
    id: string
    /** The city, in the language on screen where it differs: "Hồ Chí Minh". */
    city: string
    /** Minutes ahead of UTC right now (summer time included). */
    offsetMinutes: number
    /** "GMT+7", "GMT+5:30", "GMT−3" (a real minus sign, as the spec writes it). */
    gmt: string
    /** "GMT+7 · Hồ Chí Minh": the row and the button. */
    label: string
}

export type TimeZoneLanguage = 'vi' | 'en'

/** Old names ICU still answers with, and the city's name today. */
const RENAMED: Record<string, string> = {
    Saigon: 'Ho Chi Minh',
    Calcutta: 'Kolkata',
    Katmandu: 'Kathmandu',
    Rangoon: 'Yangon',
    Kiev: 'Kyiv'
}

/** Cities whose Vietnamese name is not the English one. */
const VIETNAMESE: Record<string, string> = {
    'Ho Chi Minh': 'Hồ Chí Minh'
}

/** The zone picked when the browser gives none the list has (01-auth.md › Edge case). */
const FALLBACK_ZONES = ['Asia/Ho_Chi_Minh', 'Asia/Saigon']

/** Can this name be saved: an IANA zone with a region, not a bare offset, that this browser knows. */
export function isSelectableTimeZone(id: string): boolean {
    if (!id.includes('/') || id.startsWith('Etc/')) return false
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: id })
        return true
    } catch {
        return false
    }
}

function allZoneNames(): string[] {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: 'timeZone') => string[] })
        .supportedValuesOf
    return supportedValuesOf ? supportedValuesOf('timeZone') : FALLBACK_ZONES
}

function cityOf(id: string, language: TimeZoneLanguage): string {
    const last = id.slice(id.lastIndexOf('/') + 1).replace(/_/g, ' ')
    const today = RENAMED[last] ?? last
    return language === 'vi' ? (VIETNAMESE[today] ?? today) : today
}

/** Minutes ahead of UTC at `at`, from the browser's own "GMT+5:30". */
export function offsetMinutes(id: string, at: Date): number {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: id, timeZoneName: 'shortOffset' })
        .formatToParts(at)
        .find((part) => part.type === 'timeZoneName')?.value
    const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name ?? '')
    if (!match) return 0
    const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0)
    return match[1] === '-' ? -minutes : minutes
}

/**
 * The clock in zone `id` at `at`: "21:47", 24-hour in both languages
 * (01-auth.md › S-ONB-01); in the browser's own zone when `id` is not given.
 */
export function timeIn(id: string | undefined, at: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: id,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).format(at)
}

/** The calendar and the clock somewhere at one moment. `weekday`: 0 is Sunday, as Date#getDay. */
export interface WallClock {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    weekday: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * What the calendar and the clock say in zone `id` at `at` (NFR-I18N-01:
 * times in the account's zone); in the browser's own zone when `id` is not
 * given (before the account's settings have loaded).
 */
export function wallClock(at: Date, id?: string): WallClock {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: id,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23',
        weekday: 'short'
    }).formatToParts(at)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((found) => found.type === type)?.value ?? ''
    return {
        year: Number(part('year')),
        month: Number(part('month')),
        day: Number(part('day')),
        hour: Number(part('hour')),
        minute: Number(part('minute')),
        weekday: WEEKDAYS.indexOf(part('weekday'))
    }
}

/**
 * The moment a date and a clock name in zone `id` (the browser's own when
 * not given): what "Thứ 6, 23/10 · 23:59" picked in a form is (C-43, in the
 * account's zone, NFR-I18N-01). The zone's offset is read at a first guess
 * and again at the moment found, so a summer-time change between the two
 * still lands on the clock asked for.
 */
export function instantAt(wall: Omit<WallClock, 'weekday'>, id?: string): Date {
    const offset = (at: Date) => (id ? offsetMinutes(id, at) : -at.getTimezoneOffset())
    const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)
    const first = new Date(asUtc - offset(new Date(asUtc)) * 60_000)
    return new Date(asUtc - offset(first) * 60_000)
}

function gmtOf(minutes: number): string {
    const sign = minutes < 0 ? '−' : '+'
    const whole = Math.abs(minutes)
    const rest = whole % 60
    return `GMT${sign}${Math.floor(whole / 60)}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`
}

export function timeZoneOption(id: string, language: TimeZoneLanguage, at = new Date()): TimeZoneOption {
    const minutes = offsetMinutes(id, at)
    const city = cityOf(id, language)
    const gmt = gmtOf(minutes)
    return { id, city, offsetMinutes: minutes, gmt, label: `${gmt} · ${city}` }
}

/** Every zone to pick from, by offset then city. */
export function timeZoneOptions(language: TimeZoneLanguage, at = new Date()): TimeZoneOption[] {
    const collator = new Intl.Collator(language)
    return allZoneNames()
        .filter(isSelectableTimeZone)
        .map((id) => timeZoneOption(id, language, at))
        .sort((a, b) => a.offsetMinutes - b.offsetMinutes || collator.compare(a.city, b.city))
}

/** The browser's zone, when it gives one that can be saved. */
export function browserTimeZone(): string | null {
    try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
        return zone && isSelectableTimeZone(zone) ? zone : null
    } catch {
        return null
    }
}

/**
 * When something ends, in the account's zone (NFR-I18N-01): "22:47", with
 * "19/10" when that is not today ("Hết lúc 21:47, 19/10", 04 Q8).
 */
export function endsAt(
    end: Date,
    now: Date,
    language: string,
    timeZone?: string
): { time: string; date: string | null } {
    const dayOf = (at: Date) => {
        const { year, month, day } = wallClock(at, timeZone)
        return `${year}-${month}-${day}`
    }
    const date = new Intl.DateTimeFormat(language, { timeZone, day: '2-digit', month: '2-digit' })
    // Day and month in the language's order, always joined by "/" (ICU writes "11-11" in Vietnamese).
    const dayMonth = date
        .formatToParts(end)
        .filter((part) => part.type !== 'literal')
        .map((part) => part.value)
        .join('/')
    return { time: timeIn(timeZone, end), date: dayOf(end) === dayOf(now) ? null : dayMonth }
}

/** "22:47", or "22:47, 19/10" when that is not today: how a timeout's end is said (02 `timed-out`, 11 › Mã lỗi). */
export function endsAtText(end: Date, now: Date, language: string, timeZone?: string): string {
    const { time, date } = endsAt(end, now, language, timeZone)
    return date ? `${time}, ${date}` : time
}

let zoneSource: () => string | undefined = () => undefined

/**
 * The users feature says where the account's zone is (its settings in the
 * query cache), for code outside React that shows a time: a refusal's
 * Toast ("Bạn đang bị tạm khóa tới 22:30", src/lib/api-error.ts), which
 * src/lib cannot read from a feature itself.
 */
export function setTimeZoneSource(source: () => string | undefined): void {
    zoneSource = source
}

/** The account's zone now; none before its settings are read (the browser's is then used). */
export function accountTimeZone(): string | undefined {
    return zoneSource()
}

/** What the picker starts on: the browser's zone, or Hồ Chí Minh when it gives none (01-auth.md). */
export function initialTimeZone(): string {
    return browserTimeZone() ?? FALLBACK_ZONES.find(isSelectableTimeZone) ?? 'Asia/Ho_Chi_Minh'
}

/** How a search compares (`folded`), a real minus as `-`. */
function searched(text: string): string {
    return folded(text).replace(/−/g, '-')
}

/** Does the option match what was typed: the city ("tokyo", "ho chi minh") or the offset ("+9", "gmt+9"). */
export function matchesTimeZone(option: TimeZoneOption, query: string): boolean {
    const wanted = searched(query.trim()).replace(/\s+/g, ' ')
    if (!wanted) return true
    return searched(option.city).includes(wanted) || searched(option.gmt).includes(wanted.replace(/\s/g, ''))
}
