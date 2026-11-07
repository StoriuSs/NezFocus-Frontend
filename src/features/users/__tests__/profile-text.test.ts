import { describe, expect, it } from 'vitest'
import {
    BIO_MAX_LENGTH,
    DISPLAY_NAME_MAX_LENGTH,
    bioIssue,
    characterCount,
    cutTo,
    displayNameIssue
} from '@/features/users/lib/profile-text'

// The API's rules (REQ-AUTH-06, D-69, D-139), so a name the form takes is never refused on save.
describe('profile text', () => {
    it('counts characters as the API does: composed, in code points', () => {
        expect([DISPLAY_NAME_MAX_LENGTH, BIO_MAX_LENGTH]).toEqual([32, 200])
        expect(characterCount('🙂')).toBe(1)
        expect(characterCount(' Nguyễn ')).toBe(6)
    })

    it.each([
        ['A', undefined],
        ['🙂'.repeat(32), undefined],
        ['ễ'.repeat(32), undefined],
        ['An​', undefined],
        ['', 'required'],
        ['   ', 'required'],
        ['ㅤㅤ', 'required'],
        ['​', 'required'],
        ['a'.repeat(33), 'tooLong']
    ])('names %j: %s', (name, issue) => {
        expect(displayNameIssue(name)).toBe(issue)
    })

    it('takes a bio of 200 characters with line breaks, not 201', () => {
        expect(bioIssue(`${'🙂'.repeat(199)}\n`)).toBeUndefined()
        expect(bioIssue('a'.repeat(201))).toBe('tooLong')
    })

    it('cuts pasted text between characters, never inside an emoji', () => {
        expect(cutTo(`${'a'.repeat(31)}🙂🙂`, 32)).toBe(`${'a'.repeat(31)}🙂`)
        expect(cutTo('An', 32)).toBe('An')
    })
})
