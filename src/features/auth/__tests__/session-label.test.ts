import { beforeAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { deviceName, lastActiveLabel } from '@/features/auth/lib/session-label'

// Built from local parts: the labels read the browser's clock, in its time zone.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min)
const NOW = at(2026, 11, 7, 21, 47) // Saturday

describe('when a session was last active (10-settings › Số và giờ)', () => {
    const t = i18n.getFixedT('vi', 'auth')

    it('says today and yesterday with the time, in 24 hours', () => {
        expect(lastActiveLabel(at(2026, 11, 7, 0, 5), NOW, t)).toBe('Hôm nay 00:05')
        expect(lastActiveLabel(at(2026, 11, 6, 22, 15), NOW, t)).toBe('Hôm qua 22:15')
        // Just after midnight, a few minutes ago is still "yesterday".
        expect(lastActiveLabel(at(2026, 11, 7, 23, 58), at(2026, 11, 8, 0, 2), t)).toBe('Hôm qua 23:58')
    })

    it('gives an older day its weekday and full date, and one over a year old the date alone', () => {
        expect(lastActiveLabel(at(2026, 10, 16, 9, 30), NOW, t)).toBe('Thứ 6, 16/10/2026')
        expect(lastActiveLabel(at(2026, 11, 1, 8, 0), NOW, t)).toBe('CN, 01/11/2026')
        expect(lastActiveLabel(at(2025, 11, 8, 8, 0), NOW, t)).toBe('Thứ 7, 08/11/2025')
        expect(lastActiveLabel(at(2025, 3, 14, 8, 0), NOW, t)).toBe('14/03/2025')
    })

    it('reads a clock a little ahead of this one as now', () => {
        expect(lastActiveLabel(at(2026, 11, 7, 21, 48), NOW, t)).toBe('Hôm nay 21:48')
    })

    it("reads the day and the time in the account's time zone (NFR-I18N-01)", () => {
        const when = new Date('2026-11-06T16:00:00Z')
        const now = new Date('2026-11-07T14:47:00Z')
        expect(lastActiveLabel(when, now, t, 'Asia/Ho_Chi_Minh')).toBe('Hôm qua 23:00')
        expect(lastActiveLabel(when, now, t, 'Asia/Tokyo')).toBe('Hôm nay 01:00')
        expect(lastActiveLabel(new Date('2026-10-16T02:30:00Z'), now, t, 'America/Lima')).toBe('Thứ 5, 15/10/2026')
    })

    it('words them in English too', () => {
        const en = i18n.getFixedT('en', 'auth')
        expect(lastActiveLabel(at(2026, 11, 6, 22, 15), NOW, en)).toBe('Yesterday 22:15')
        expect(lastActiveLabel(at(2026, 10, 16, 9, 30), NOW, en)).toBe('Fri, 16/10/2026')
    })
})

describe('the name of a session', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('vi')
    })
    const t = i18n.getFixedT('vi', 'auth')

    it('is the browser and the system, or says the browser is unknown (10-settings › Tương tác)', () => {
        expect(deviceName({ browser: 'Safari', os: 'macOS' }, t)).toBe('Safari · macOS')
        expect(deviceName({ browser: 'Chrome', os: null }, t)).toBe('Chrome')
        expect(deviceName({ browser: null, os: 'Windows' }, t)).toBe('Trình duyệt không xác định · Windows')
        expect(deviceName({ browser: null, os: null }, t)).toBe('Trình duyệt không xác định')
    })
})
