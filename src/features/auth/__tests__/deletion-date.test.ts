import { describe, expect, it } from 'vitest'
import { DELETION_WAIT_MS, deletionDate, deletionDaysLeft } from '@/features/auth/lib/deletion-date'

// 01-auth.md › world D: asked on 15/10/2026, deleted on 29/10/2026; signed in at 21:47 on 18/10 → "11 days left".
describe('the day an account waiting to be deleted goes', () => {
    const deletesAt = new Date('2026-10-29T12:00:00Z')

    it('is 14 days after the request', () => {
        expect(DELETION_WAIT_MS).toBe(14 * 24 * 60 * 60 * 1000)
    })

    it('is written dd/mm/yyyy, in the zone asked for', () => {
        expect(deletionDate(deletesAt, 'Asia/Ho_Chi_Minh')).toBe('29/10/2026')
        // 23:30 on the 28th in UTC is already the 29th in Ho Chi Minh City.
        expect(deletionDate(new Date('2026-10-28T23:30:00Z'), 'Asia/Ho_Chi_Minh')).toBe('29/10/2026')
        expect(deletionDate(new Date('2026-10-28T23:30:00Z'), 'UTC')).toBe('28/10/2026')
    })

    it('counts calendar days, whatever the hour', () => {
        expect(deletionDaysLeft(deletesAt, new Date('2026-10-18T14:47:00Z'), 'Asia/Ho_Chi_Minh')).toBe(11)
        expect(deletionDaysLeft(deletesAt, new Date('2026-10-18T16:59:00Z'), 'Asia/Ho_Chi_Minh')).toBe(11)
    })

    it('says 1 day left on the last day, never 0', () => {
        expect(deletionDaysLeft(deletesAt, new Date('2026-10-28T12:00:00Z'), 'UTC')).toBe(1)
        expect(deletionDaysLeft(deletesAt, new Date('2026-10-29T08:00:00Z'), 'UTC')).toBe(1)
    })
})
