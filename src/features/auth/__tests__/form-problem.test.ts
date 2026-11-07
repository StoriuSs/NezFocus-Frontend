import { describe, it, expect, beforeEach } from 'vitest'
import { AxiosError } from 'axios'
import { renderHook } from '@testing-library/react'
import i18n from '@/i18n'
import { apiError } from '@/test/helpers'
import { formatWait } from '@/features/auth/lib/form-errors'
import { requestFailure, useMessageText } from '@/features/auth/lib/form-problem'

const NOW = 1_000_000

describe('requestFailure', () => {
    it('keeps a limit as the moment it ends and which limit it is, for the page to word', () => {
        const failure = requestFailure(
            apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': '2280' }, data: { reason: 'emails' } }),
            NOW
        )
        expect(failure.limit).toEqual({ reason: 'emails', until: NOW + 2_280_000 })
    })

    it('knows the limit of a code sent a moment ago (D-136)', () => {
        const failure = requestFailure(
            apiError(429, 'RATE_LIMIT_EXCEEDED', {
                headers: { 'retry-after': '37' },
                data: { reason: 'recent_email' }
            }),
            NOW
        )
        expect(failure.limit).toEqual({ reason: 'recent_email', until: NOW + 37_000 })
    })

    it('leaves out a limit reason it does not know, and a limit without Retry-After', () => {
        expect(
            requestFailure(
                apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': '60' }, data: { reason: 'moon' } }),
                NOW
            ).limit
        ).toEqual({ reason: undefined, until: NOW + 60_000 })

        const noHeader = requestFailure(apiError(429, 'RATE_LIMIT_EXCEEDED'))
        expect(noHeader.limit).toBeUndefined()
        expect(noHeader.message).toEqual({ key: 'api:RATE_LIMIT_EXCEEDED' })
    })

    it('says offline when no answer came, and a server error for a 5xx, never the raw type', () => {
        const offline = requestFailure(new AxiosError('Network Error', 'ERR_NETWORK'))
        expect(offline).toMatchObject({ offline: true, message: { key: 'auth:problems.offline' } })

        expect(requestFailure(apiError(503, 'SERVICE_UNAVAILABLE_ERROR')).message).toEqual({
            key: 'auth:problems.server'
        })
    })

    it('names the API error by its type when the catalogue has it, the generic one otherwise', () => {
        expect(requestFailure(apiError(400, 'AUTH_CODE_INVALID')).message).toEqual({ key: 'api:AUTH_CODE_INVALID' })
        expect(requestFailure(apiError(400, 'SOMETHING_NEW')).message).toEqual({ key: 'api:GENERIC_ERROR' })
    })

    it('reads the password rules the API refused', () => {
        const failure = requestFailure(
            apiError(422, 'AUTH_PASSWORD_REJECTED', { data: { rules: ['matches_username'] } })
        )
        expect(failure.passwordRules).toEqual(['matches_username'])
    })
})

describe('messages follow the language on screen', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
    })

    it('words the same message again after the language changes', async () => {
        const { result, rerender } = renderHook(() => useMessageText())
        const message = { key: 'auth:problems.offline' }
        const vietnamese = result.current(message)

        await i18n.changeLanguage('en')
        rerender()

        expect(result.current(message)).not.toBe(vietnamese)
        expect(result.current(message)).toBe(i18n.t('auth:problems.offline'))
    })
})

describe('formatWait (C-22 › FormMessage)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('vi')
    })

    it('counts seconds under 90, then minutes rounded up, then hours rounded up', () => {
        expect(formatWait(42)).toBe('42 giây')
        expect(formatWait(89)).toBe('89 giây')
        expect(formatWait(90)).toBe('2 phút')
        expect(formatWait(2280)).toBe('38 phút')
        expect(formatWait(3600)).toBe('1 giờ')
        expect(formatWait(3601)).toBe('2 giờ')
    })
})
