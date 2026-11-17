import { describe, it, expect, vi, afterEach } from 'vitest'
import {
    accountTimeZone,
    endsAt,
    initialTimeZone,
    instantAt,
    isSelectableTimeZone,
    matchesTimeZone,
    setTimeZoneSource,
    timeIn,
    timeZoneOption,
    timeZoneOptions,
    wallClock
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

    it('tells the time in a zone, 24-hour, with the minutes padded', () => {
        const evening = new Date('2026-10-18T14:47:00Z')
        expect(timeIn('Asia/Tokyo', evening)).toBe('23:47')
        expect(timeIn('Asia/Kolkata', evening)).toBe('20:17')
        expect(timeIn('America/New_York', new Date('2026-01-15T05:05:00Z'))).toBe('00:05')
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

describe('endsAt (04 Q8)', () => {
    const NOW = new Date('2026-11-10T09:00:00Z')

    it('gives the time alone today, and the day too otherwise, in the account’s zone', () => {
        const zone = 'Asia/Ho_Chi_Minh'
        expect(endsAt(new Date('2026-11-10T10:00:00Z'), NOW, 'vi', zone)).toEqual({ time: '17:00', date: null })
        expect(endsAt(new Date('2026-11-11T10:00:00Z'), NOW, 'vi', zone)).toEqual({ time: '17:00', date: '11/11' })
        // 23:30 in Hồ Chí Minh is already tomorrow.
        expect(endsAt(new Date('2026-11-10T17:30:00Z'), NOW, 'vi', zone).date).toBe('11/11')
    })

    it('reads the clock and the day in the account’s zone, not the browser’s', () => {
        // 03:30 UTC on the 11th is still the evening of the 10th in New York.
        expect(endsAt(new Date('2026-11-11T03:30:00Z'), NOW, 'vi', 'America/New_York')).toEqual({
            time: '22:30',
            date: null
        })
    })

    it('keeps a 24-hour clock in English, with the day and month in its order', () => {
        const zone = 'Asia/Ho_Chi_Minh'
        expect(endsAt(new Date('2026-11-12T14:05:00Z'), NOW, 'en', zone)).toEqual({ time: '21:05', date: '11/12' })
        expect(endsAt(new Date('2026-11-12T14:05:00Z'), NOW, 'vi', zone).date).toBe('12/11')
    })
})

describe('The account’s time zone, for code outside React (src/lib)', () => {
    afterEach(() => setTimeZoneSource(() => undefined))

    it('is none until a feature says where it is, then whatever that says now', () => {
        expect(accountTimeZone()).toBeUndefined()
        let zone = 'Asia/Ho_Chi_Minh'
        setTimeZoneSource(() => zone)
        expect(accountTimeZone()).toBe('Asia/Ho_Chi_Minh')
        zone = 'Europe/Paris'
        expect(accountTimeZone()).toBe('Europe/Paris')
    })
})

describe('instantAt', () => {
    it('reads a date and a clock in the account zone as the moment it is (C-43)', () => {
        const wall = { year: 2026, month: 10, day: 23, hour: 23, minute: 59 }
        expect(instantAt(wall, 'Asia/Ho_Chi_Minh').toISOString()).toBe('2026-10-23T16:59:00.000Z')
        expect(instantAt(wall, 'America/New_York').toISOString()).toBe('2026-10-24T03:59:00.000Z')
        expect(instantAt({ ...wall, month: 12 }, 'America/New_York').toISOString()).toBe('2026-12-24T04:59:00.000Z')
    })

    it('goes back to the same date and clock through wallClock', () => {
        for (const zone of ['Asia/Kolkata', 'Europe/London', 'Pacific/Auckland']) {
            const wall = { year: 2027, month: 3, day: 28, hour: 9, minute: 30 }
            const at = instantAt(wall, zone)
            expect(wallClock(at, zone)).toMatchObject(wall)
        }
    })
})
