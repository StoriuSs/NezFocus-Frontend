import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import '@/i18n/messaging'
import { dayLabel, messageTime, messageTimeInFull } from '../lib/message-time'
import { characters, lengthNotice, MAX_MESSAGE_LENGTH } from '../lib/message-length'

const ZONE = 'Asia/Ho_Chi_Minh'
// 21:47, Sunday 18/10/2026, in Vietnam (02-shell-chat.md › Dữ liệu mẫu).
const NOW = new Date('2026-10-18T21:47:00+07:00')
const local = (text: string) => new Date(`${text}+07:00`)
const vi = i18n.getFixedT('vi', 'messaging')
const en = i18n.getFixedT('en', 'messaging')

describe('Times on messages (C-10 › Giờ ở đầu tin)', () => {
    it('gives the time today, "yesterday" and the time, else the whole date', () => {
        expect(messageTime(local('2026-10-18T20:02:00'), NOW, ZONE, vi)).toBe('20:02')
        expect(messageTime(local('2026-10-17T20:00:00'), NOW, ZONE, vi)).toBe('Hôm qua 20:00')
        expect(messageTime(local('2026-10-16T20:00:00'), NOW, ZONE, vi)).toBe('16/10/2026 20:00')
    })

    it("counts days in the account's zone, not the browser's", () => {
        // 00:30 on the 18th in Vietnam is still the 17th in London.
        expect(messageTime(local('2026-10-18T00:30:00'), NOW, ZONE, vi)).toBe('00:30')
        expect(messageTime(local('2026-10-18T00:30:00'), NOW, 'Europe/London', vi)).toBe('Hôm qua 18:30')
    })

    it('says the whole moment on hover', () => {
        expect(messageTimeInFull(local('2026-10-16T20:00:00'), ZONE, vi)).toBe('Thứ 6, 16/10/2026 lúc 20:00')
        expect(messageTimeInFull(local('2026-10-18T09:05:00'), ZONE, en)).toBe('Sunday, 18/10/2026 at 09:05')
    })

    it('names the day of a date line', () => {
        expect(dayLabel(local('2026-10-18T08:00:00'), NOW, ZONE, vi)).toBe('Hôm nay')
        expect(dayLabel(local('2026-10-17T08:00:00'), NOW, ZONE, vi)).toBe('Hôm qua')
        expect(dayLabel(local('2026-10-16T08:00:00'), NOW, ZONE, vi)).toBe('Thứ 6, 16/10/2026')
        expect(dayLabel(local('2026-10-11T08:00:00'), NOW, ZONE, vi)).toBe('Chủ Nhật, 11/10/2026')
    })
})

describe('The length of a message (REQ-MSG-01, C-12 › Bộ đếm ký tự)', () => {
    it('counts an emoji as one character, as the API does', () => {
        expect(characters('😀😀')).toBe(2)
        expect(MAX_MESSAGE_LENGTH).toBe(2000)
    })

    it('says nothing until 200 are left, then how many, then how many too many', () => {
        expect(lengthNotice('a'.repeat(1799))).toBeNull()
        expect(lengthNotice('a'.repeat(1800))).toEqual({ left: 200 })
        expect(lengthNotice('a'.repeat(2000))).toEqual({ left: 0 })
        expect(lengthNotice('a'.repeat(2012))).toEqual({ left: -12 })
    })

    it('counts what is sent: the blank around the text is dropped', () => {
        expect(lengthNotice(`${'a'.repeat(2000)}\n\n`)).toEqual({ left: 0 })
    })
})
