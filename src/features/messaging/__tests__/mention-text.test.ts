import { describe, expect, it } from 'vitest'
import { applyEdit, insertMention, outgoingMentions, replaceShown, shownText, typedMention } from '../lib/mention-text'

const BINH = '0190a0b0-0000-7000-8000-00000000000b'
const LEADS = '0190a0b0-0000-7000-8000-0000000000f1'
const GENERAL = '0190a0b0-0000-7000-8000-0000000000c1'
const STRANGER = '0190a0b0-0000-7000-8000-00000000000e'

const B = `<@${BINH}>`
const names = { [B]: '@Bình', [`<@&${LEADS}>`]: '@Trưởng nhóm', [`<#${GENERAL}>`]: '#hoi-dap' }

describe('The composer shows names where the text holds tokens (C-12, REQ-MSG-03)', () => {
    it('shows each token it has a name for as that name, any other as written', () => {
        expect(shownText(`chào ${B} và <@${STRANGER}>`, names)).toBe(`chào @Bình và <@${STRANGER}>`)
        expect(shownText(`<#${GENERAL}> <@&${LEADS}>`, names)).toBe('#hoi-dap @Trưởng nhóm')
    })
})

describe('Typing in the composer, mapped back onto the text with tokens', () => {
    it('keeps a mention when typing right before or after it', () => {
        expect(applyEdit(B, names, '@Bình nhé', 9)).toBe(`${B} nhé`)
        expect(applyEdit(B, names, 'à @Bình', 2)).toBe(`à ${B}`)
    })

    it('turns a mention into words when an edit lands inside it', () => {
        expect(applyEdit(`${B} hi`, names, '@Bìxnh hi', 4)).toBe('@Bìxnh hi')
        // Backspace at its end takes its last letter, as with any word.
        expect(applyEdit(B, names, '@Bìn', 4)).toBe('@Bìn')
    })

    it('takes a mention out whole when a selection over it is deleted or replaced', () => {
        expect(applyEdit(`a ${B} b`, names, 'a  b', 2)).toBe('a  b')
        expect(applyEdit(`a ${B} b`, names, 'a x b', 3)).toBe('a x b')
    })

    it('reads where the edit was from the cursor when the text alone cannot tell', () => {
        // "@Bình" then the letter h: deleting the h typed after it keeps the mention…
        expect(applyEdit(`${B}h`, names, '@Bình', 5)).toBe(B)
        // …deleting the h of the name turns it into words.
        expect(applyEdit(`${B}h`, names, '@Bình', 4)).toBe('@Bình')
    })

    it('replaces what was shown between two places, for the emoji picker', () => {
        expect(replaceShown(`hi ${B}`, names, 2, 2, '😀')).toBe(`hi😀 ${B}`)
        expect(replaceShown(`hi ${B}`, names, 3, 8, '😀')).toBe('hi 😀')
    })
})

describe('What is being typed after @ or # (C-12 › MentionSuggest)', () => {
    it('is the word from an @ or # at the start or after a space, up to the cursor', () => {
        expect(typedMention('hi @bi', {}, 6)).toEqual({ trigger: '@', query: 'bi', start: 3 })
        expect(typedMention('@', {}, 1)).toEqual({ trigger: '@', query: '', start: 0 })
        expect(typedMention('xem (#ho', {}, 8)).toEqual({ trigger: '#', query: 'ho', start: 5 })
    })

    it('is nothing inside a word, an address, past a space, or right after a mention', () => {
        expect(typedMention('mail@bi', {}, 7)).toBeNull()
        expect(typedMention('C#', {}, 2)).toBeNull()
        expect(typedMention('hi @bi nh', {}, 9)).toBeNull()
        expect(typedMention(B, names, 5)).toBeNull()
    })
})

describe('Picking a suggestion', () => {
    it('puts the token where the typed word was, its name shown, a space and the cursor after it', () => {
        const typed = { trigger: '@' as const, query: 'bi', start: 3 }
        expect(insertMention('hi @bi', {}, typed, 6, B, '@Bình')).toEqual({
            markup: `hi ${B} `,
            names: { [B]: '@Bình' },
            caret: 9
        })
    })

    it('takes the rest of the word typed when the cursor was inside it', () => {
        const typed = { trigger: '@' as const, query: 'Bì', start: 0 }
        expect(insertMention('@Bìnhx hi', {}, typed, 3, B, '@Bình')).toEqual({
            markup: `${B} hi`,
            names: { [B]: '@Bình' },
            caret: 6
        })
    })

    it('uses the space already after the cursor', () => {
        const typed = { trigger: '#' as const, query: 'ho', start: 0 }
        expect(insertMention('#ho nhé', {}, typed, 3, `<#${GENERAL}>`, '#hoi-dap')).toEqual({
            markup: `<#${GENERAL}> nhé`,
            names: { [`<#${GENERAL}>`]: '#hoi-dap' },
            caret: 9
        })
    })

    it('writes @everyone as its word', () => {
        const typed = { trigger: '@' as const, query: 'ev', start: 0 }
        expect(insertMention('@ev', {}, typed, 3, '@everyone', '@everyone')).toEqual({
            markup: '@everyone ',
            names: {},
            caret: 10
        })
    })
})

describe('A message on its way shows its mentions before it is saved', () => {
    it('names the people and roles picked, and @everyone when the author may use it', () => {
        expect(outgoingMentions(`${B} <@&${LEADS}> @everyone \`${B}\``, names, true)).toEqual({
            mentionUsers: [{ id: BINH, username: null, displayName: 'Bình' }],
            mentionRoles: [{ id: LEADS, name: 'Trưởng nhóm' }],
            mentionEveryone: true
        })
        expect(outgoingMentions('@everyone', names, false).mentionEveryone).toBe(false)
    })
})
