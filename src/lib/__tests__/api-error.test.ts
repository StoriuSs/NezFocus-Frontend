import { describe, expect, it } from 'vitest'
import { AxiosError } from 'axios'
import { apiError } from '@/test/helpers'
import { retryAfterSeconds } from '../api-error'

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
