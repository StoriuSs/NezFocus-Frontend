import { describe, expect, it } from 'vitest'
import {
    FIELD_RULES,
    GRID_RULES,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    brokenPasswordRules,
    passwordFieldRule,
    rejectedRules
} from '../lib/password-rules'

// The same cases as the API's password-policy.spec.ts (SRS REQ-AUTH-01, D-29,
// D-66). Each case breaks exactly one rule, so loosening any rule turns red.
describe('password rules', () => {
    it('accepts a password that meets every rule', () => {
        expect(brokenPasswordRules('Harbour-Lantern-42')).toEqual([])
    })

    it.each([
        ['min_length', 'Aa1!aaa'],
        ['max_length', `Aa1!${'a'.repeat(PASSWORD_MAX_LENGTH - 3)}`],
        ['lowercase', 'HARBOUR-42'],
        ['uppercase', 'harbour-42'],
        ['digit', 'Harbour-Lantern'],
        ['special', 'HarbourLantern42']
    ])('refuses a password that breaks only %s', (rule, password) => {
        expect(brokenPasswordRules(password)).toEqual([rule])
    })

    it('holds the length bounds at 8 and 128 characters', () => {
        expect(PASSWORD_MIN_LENGTH).toBe(8)
        expect(PASSWORD_MAX_LENGTH).toBe(128)
        expect(brokenPasswordRules('Aa1!aaaa')).toEqual([])
        expect(brokenPasswordRules(`Aa1!${'a'.repeat(PASSWORD_MAX_LENGTH - 4)}`)).toEqual([])
    })

    it('names every missing rule, as the SRS example ontap2026 does', () => {
        expect(brokenPasswordRules('ontap2026')).toEqual(['uppercase', 'special'])
    })

    it('counts Vietnamese letters as letters and a space as a special character', () => {
        expect(brokenPasswordRules('Đàlạt 2026')).toEqual([])
        expect(brokenPasswordRules('ĐÀLẠT 2026')).toEqual(['lowercase'])
    })

    it('does not refuse a common password (D-29)', () => {
        expect(brokenPasswordRules('Password1!')).toEqual([])
    })

    it('refuses the email address, its local part or the username, dressed up (D-66)', () => {
        expect(brokenPasswordRules('JaneDoe2026!', { email: 'Jane.Doe@example.test' })).toEqual(['matches_email'])
        expect(brokenPasswordRules('Harbour_Seven1', { username: 'harbour_seven' })).toEqual(['matches_username'])
        expect(brokenPasswordRules('Harbour.Seven1', { username: 'harbour.seven' })).toEqual(['matches_username'])
    })

    it('allows a password that only contains the email or the username (D-66)', () => {
        expect(brokenPasswordRules('JaneDoe-Harbour-42', { email: 'jane.doe@example.test' })).toEqual([])
        expect(brokenPasswordRules('Harbour-Seven-Lantern-1', { username: 'harbour_seven' })).toEqual([])
    })
})

describe('where each rule is shown (C-22)', () => {
    it('lists the five conditions in the order of the grid', () => {
        expect(GRID_RULES).toEqual(['min_length', 'uppercase', 'lowercase', 'digit', 'special'])
    })

    it('shows the length cap and the identity rules as an error of the field, not in the grid', () => {
        expect(FIELD_RULES).toEqual(['max_length', 'matches_email', 'matches_username'])
        expect(passwordFieldRule(['uppercase', 'matches_username'])).toBe('matches_username')
        expect(passwordFieldRule(['uppercase', 'digit'])).toBeUndefined()
    })

    it('keeps only rule ids this app knows from a refusal', () => {
        expect(rejectedRules(['digit', 'common', 42, 'matches_email'])).toEqual(['digit', 'matches_email'])
        expect(rejectedRules('digit')).toEqual([])
    })
})
