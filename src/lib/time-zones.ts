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

/** The clock in zone `id` at `at`: "21:47", 24-hour in both languages (01-auth.md › S-ONB-01). */
export function timeIn(id: string, at: Date): string {
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

/** What the picker starts on: the browser's zone, or Hồ Chí Minh when it gives none (01-auth.md). */
export function initialTimeZone(): string {
    return browserTimeZone() ?? FALLBACK_ZONES.find(isSelectableTimeZone) ?? 'Asia/Ho_Chi_Minh'
}

/** Lower case, no accents, `đ` as `d`, a real minus as `-`: how a search compares. */
function folded(text: string): string {
    return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').replace(/−/g, '-').toLowerCase()
}

/** Does the option match what was typed: the city ("tokyo", "ho chi minh") or the offset ("+9", "gmt+9"). */
export function matchesTimeZone(option: TimeZoneOption, query: string): boolean {
    const wanted = folded(query.trim()).replace(/\s+/g, ' ')
    if (!wanted) return true
    return folded(option.city).includes(wanted) || folded(option.gmt).includes(wanted.replace(/\s/g, ''))
}
