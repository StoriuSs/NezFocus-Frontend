import { describe, expect, it } from 'vitest'
import { dayGroupOf, dueDate, groupsOf, momentOf, rowTime } from '../lib/inbox-time'

const ZONE = 'Asia/Ho_Chi_Minh'
/** 21:47 on Saturday 17/10/2026 in Hồ Chí Minh (06 › Luật nhất quán dữ liệu 6). */
const NOW = new Date('2026-10-17T21:47:00+07:00')
const at = (local: string) => new Date(`${local}+07:00`)

describe('dayGroupOf', () => {
    it('names the day in the account zone, not the machine one', () => {
        expect(dayGroupOf(at('2026-10-17T00:10:00'), NOW, ZONE)).toBe('today')
        expect(dayGroupOf(at('2026-10-16T23:59:00'), NOW, ZONE)).toBe('yesterday')
        expect(dayGroupOf(at('2026-10-15T23:59:00'), NOW, ZONE)).toBe('earlier')
        // 00:10 on the 17th in Hồ Chí Minh is still the 16th in UTC.
        expect(dayGroupOf(at('2026-10-17T00:10:00'), NOW, 'UTC')).toBe('yesterday')
    })

    it('moves an item to yesterday once midnight passes', () => {
        const item = at('2026-10-17T19:00:00')
        expect(dayGroupOf(item, at('2026-10-18T00:00:30'), ZONE)).toBe('yesterday')
    })
})

describe('rowTime', () => {
    it('is the clock today and yesterday, the day before that, the year when it is another', () => {
        expect(rowTime(at('2026-10-17T21:30:00'), NOW, ZONE)).toBe('21:30')
        expect(rowTime(at('2026-10-16T09:05:00'), NOW, ZONE)).toBe('09:05')
        expect(rowTime(at('2026-10-12T20:40:00'), NOW, ZONE)).toBe('12/10')
        expect(rowTime(at('2025-12-28T20:40:00'), NOW, ZONE)).toBe('28/12/2025')
    })
})

describe('dueDate', () => {
    it('is the date and the clock of a due date, the year when it is another (06 › Quy ước › Thời gian)', () => {
        expect(dueDate(at('2026-11-05T23:59:00'), NOW, ZONE)).toBe('05/11 · 23:59')
        expect(dueDate(at('2027-01-05T08:00:00'), NOW, ZONE)).toBe('05/01/2027 · 08:00')
        // 23:59 on the 5th in Hồ Chí Minh is the 5th at 16:59 in UTC.
        expect(dueDate(at('2026-11-05T23:59:00'), NOW, 'UTC')).toBe('05/11 · 16:59')
    })
})

describe('momentOf', () => {
    it('gives the weekday, the date and the clock for the tooltip', () => {
        expect(momentOf(at('2026-10-16T21:59:00'), ZONE)).toEqual({ weekday: 5, date: '16/10/2026', time: '21:59' })
    })
})

describe('groupsOf', () => {
    it('keeps the order and starts a group where the day changes; empty groups are left out', () => {
        const items = [
            { id: 'a', createdAt: at('2026-10-17T21:30:00').toISOString() },
            { id: 'b', createdAt: at('2026-10-17T20:10:00').toISOString() },
            { id: 'c', createdAt: at('2026-10-14T23:59:00').toISOString() }
        ]
        expect(groupsOf(items, NOW, ZONE)).toEqual([
            { group: 'today', items: [items[0], items[1]] },
            { group: 'earlier', items: [items[2]] }
        ])
    })
})
