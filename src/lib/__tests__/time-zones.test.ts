import { describe, it, expect, vi, afterEach } from 'vitest'
import {
    initialTimeZone,
    isSelectableTimeZone,
    matchesTimeZone,
    timeZoneOption,
    timeZoneOptions
} from '@/lib/time-zones'

// A winter day: no summer time in the north.
const WINTER = new Date('2026-01-15T12:00:00Z')

describe('time zones to pick from (C-25)', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('names a zone by its offset and its city, in the language on screen', () => {
        const saigon = isSelectableTimeZone('Asia/Ho_Chi_Minh') ? 'Asia/Ho_Chi_Minh' : 'Asia/Saigon'
        expect(timeZoneOption(saigon, 'vi', WINTER).label).toBe('GMT+7 · Hồ Chí Minh')
        expect(timeZoneOption(saigon, 'en', WINTER).label).toBe('GMT+7 · Ho Chi Minh')
        expect(timeZoneOption('Asia/Kolkata', 'en', WINTER).label).toBe('GMT+5:30 · Kolkata')
        expect(timeZoneOption('America/Argentina/Buenos_Aires', 'en', WINTER).label).toBe('GMT−3 · Buenos Aires')
        expect(timeZoneOption('Europe/London', 'en', WINTER).label).toBe('GMT+0 · London')
    })

    it('counts summer time in the offset of the day', () => {
        expect(timeZoneOption('Europe/London', 'en', new Date('2026-07-15T12:00:00Z')).gmt).toBe('GMT+1')
    })

    it('leaves out what the API refuses: bare offsets and names without a region', () => {
        expect(isSelectableTimeZone('Etc/GMT+7')).toBe(false)
        expect(isSelectableTimeZone('UTC')).toBe(false)
        expect(isSelectableTimeZone('Mars/Olympus')).toBe(false)
        const ids = timeZoneOptions('en', WINTER).map((option) => option.id)
        expect(ids.some((id) => id.startsWith('Etc/') || !id.includes('/'))).toBe(false)
    })

    it('orders by offset, then by city', () => {
        const options = timeZoneOptions('en', WINTER)
        for (let i = 1; i < options.length; i++) {
            expect(options[i - 1]!.offsetMinutes).toBeLessThanOrEqual(options[i]!.offsetMinutes)
        }
        const plusSeven = options.filter((option) => option.gmt === 'GMT+7').map((option) => option.city)
        expect(plusSeven).toEqual([...plusSeven].sort((a, b) => a.localeCompare(b, 'en')))
    })

    it('finds a zone by city without case or accents, or by its offset', () => {
        const tokyo = timeZoneOption('Asia/Tokyo', 'vi', WINTER)
        const saigon = timeZoneOption('Asia/Saigon', 'vi', WINTER)
        for (const query of ['tokyo', 'TOKYO', '+9', 'gmt+9', 'GMT +9'])
            expect(matchesTimeZone(tokyo, query), query).toBe(true)
        for (const query of ['hồ chí minh', 'ho chi minh', 'HO CHI'])
            expect(matchesTimeZone(saigon, query), query).toBe(true)
        expect(matchesTimeZone(tokyo, 'paris')).toBe(false)
        expect(matchesTimeZone(timeZoneOption('America/Sao_Paulo', 'en', WINTER), '-3')).toBe(true)
        expect(matchesTimeZone(tokyo, '  ')).toBe(true)
    })

    it("starts on the browser's zone, or Hồ Chí Minh when the browser gives none it can save", () => {
        vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
            timeZone: 'Asia/Tokyo'
        } as Intl.ResolvedDateTimeFormatOptions)
        expect(initialTimeZone()).toBe('Asia/Tokyo')

        vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
            timeZone: 'UTC'
        } as Intl.ResolvedDateTimeFormatOptions)
        expect(['Asia/Ho_Chi_Minh', 'Asia/Saigon']).toContain(initialTimeZone())
    })
})
