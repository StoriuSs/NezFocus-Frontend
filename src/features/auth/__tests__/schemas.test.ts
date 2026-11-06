import { beforeAll, describe, expect, it } from 'vitest'
import * as z from 'zod'
import i18n from '@/i18n'
import { newPasswordCheck, passwordFieldMessage } from '../lib/schemas'
import type { PasswordContext } from '../lib/password-rules'

const t = i18n.getFixedT('vi', 'auth')

/** The password field's message for these values, or undefined when it passes. */
function passwordError(password: string, context: PasswordContext = {}, confirmPassword = password) {
    const schema = z
        .object({ password: z.string(), confirmPassword: z.string() })
        .superRefine((values, ctx) => newPasswordCheck(t, values, context, ctx))
    const result = schema.safeParse({ password, confirmPassword })
    return result.success ? undefined : result.error.issues.map((issue) => `${String(issue.path[0])}: ${issue.message}`)
}

describe('the new-password check of the forms', () => {
    beforeAll(async () => {
        await i18n.loadNamespaces('auth')
    })

    it('passes a password that meets every rule and is typed twice the same', () => {
        expect(passwordError('Harbour-Lantern-42')).toBeUndefined()
    })

    it('points at the conditions under the field when one is unmet', () => {
        expect(passwordError('ontap2026')).toEqual(['password: Mật khẩu chưa đủ điều kiện'])
    })

    it('names the rule in the field when the password is the email or the username (D-66)', () => {
        expect(passwordError('JaneDoe2026!', { email: 'jane.doe@example.test' })).toEqual([
            'password: Không dùng email làm mật khẩu'
        ])
        expect(passwordError('Harbour_Seven1', { username: 'harbour_seven' })).toEqual([
            'password: Không dùng username làm mật khẩu'
        ])
    })

    it('names the length cap in the field, not in the grid', () => {
        expect(passwordError(`Aa1!${'a'.repeat(125)}`)).toEqual(['password: Mật khẩu tối đa 128 ký tự'])
    })

    it('says when the two passwords differ', () => {
        expect(passwordError('Harbour-Lantern-42', {}, 'Harbour-Lantern-43')).toEqual([
            'confirmPassword: Hai mật khẩu không khớp'
        ])
    })
})

describe('the field error for an API refusal', () => {
    it('names a field rule the API refused, and nothing for a grid condition', () => {
        expect(passwordFieldMessage(t, ['uppercase', 'matches_username'])).toBe('Không dùng username làm mật khẩu')
        expect(passwordFieldMessage(t, ['uppercase'])).toBeUndefined()
    })
})
