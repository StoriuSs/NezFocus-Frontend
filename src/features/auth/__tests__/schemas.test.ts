import { describe, expect, it } from 'vitest'
import { newPasswordIssue } from '../lib/schemas'

describe('the new-password check of the forms', () => {
    it('passes a password that meets every rule', () => {
        expect(newPasswordIssue('Harbour-Lantern-42', {})).toBeUndefined()
    })

    it('points at the conditions under the field when one is unmet', () => {
        expect(newPasswordIssue('ontap2026', {})).toBe('auth:validation.passwordWeak')
    })

    it('names the rule in the field when the password is the email or the username (D-66)', () => {
        expect(newPasswordIssue('JaneDoe2026!', { email: 'jane.doe@example.test' })).toBe(
            'auth:passwordRules.matches_email'
        )
        expect(newPasswordIssue('Harbour_Seven1', { username: 'harbour_seven' })).toBe(
            'auth:passwordRules.matches_username'
        )
    })

    it('names the length cap in the field, not in the grid', () => {
        expect(newPasswordIssue(`Aa1!${'a'.repeat(125)}`, {})).toBe('auth:passwordRules.max_length')
    })
})
