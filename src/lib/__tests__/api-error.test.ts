import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AxiosError } from 'axios'
import i18n from '@/i18n'
import { apiError } from '@/test/helpers'
import { getApiErrorMessage, retryAfterSeconds } from '../api-error'
import { setTimeZoneSource } from '../time-zones'

describe('How long a refused request asks to wait', () => {
    it('reads the Retry-After of a 429, in seconds', () => {
        expect(retryAfterSeconds(apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': '4' } }))).toBe(4)
    })

    it('gives nothing without a usable one, or for anything but a 429', () => {
        expect(retryAfterSeconds(apiError(429, 'RATE_LIMIT_EXCEEDED'))).toBeUndefined()
        expect(
            retryAfterSeconds(apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': '0' } }))
        ).toBeUndefined()
        expect(
            retryAfterSeconds(apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': 'soon' } }))
        ).toBeUndefined()
        expect(
            retryAfterSeconds(apiError(503, 'SERVICE_UNAVAILABLE', { headers: { 'retry-after': '4' } }))
        ).toBeUndefined()
        expect(retryAfterSeconds(new AxiosError('Network Error', 'ERR_NETWORK'))).toBeUndefined()
        expect(retryAfterSeconds(new Error('bug'))).toBeUndefined()
    })
})

describe('What a refusal says (11 › Mã lỗi)', () => {
    // Far from the machine's zone, so the time is read in the account's, not the browser's.
    const ZONE = 'Pacific/Kiritimati'
    const today = (time: string) => {
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date())
        return new Date(`${day}T${time}:00+14:00`)
    }
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
        setTimeZoneSource(() => ZONE)
    })
    afterEach(() => setTimeZoneSource(() => undefined))

    it('says until when one is timed out, from the answer, in the account’s zone', () => {
        const error = apiError(403, 'MEMBER_TIMED_OUT', { data: { timeoutUntil: today('22:30').toISOString() } })
        expect(getApiErrorMessage(error)).toBe('Bạn đang bị tạm khóa tới 22:30')
    })

    it('adds the day when the timeout ends on another one', () => {
        const later = new Date(today('22:30').getTime() + 2 * 24 * 3600_000)
        const day = new Intl.DateTimeFormat('vi', { timeZone: ZONE, day: '2-digit', month: '2-digit' })
            .formatToParts(later)
            .filter((part) => part.type !== 'literal')
            .map((part) => part.value)
            .join('/')
        const error = apiError(403, 'MEMBER_TIMED_OUT', { data: { timeoutUntil: later.toISOString() } })
        expect(getApiErrorMessage(error)).toBe(`Bạn đang bị tạm khóa tới 22:30, ${day}`)
    })

    it('still says why when the answer carries no end', () => {
        expect(getApiErrorMessage(apiError(403, 'MEMBER_TIMED_OUT'))).toBe('Bạn đang bị tạm khóa')
    })

    it('says one may no longer do it on FORBIDDEN_ERROR', () => {
        expect(getApiErrorMessage(apiError(403, 'FORBIDDEN_ERROR'))).toBe('Bạn không còn quyền làm việc này')
    })
})
