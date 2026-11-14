import { describe, expect, it } from 'vitest'
import {
    composerNames,
    findMentions,
    isRelated,
    mentionName,
    readableText,
    startsAWord,
    type MentionNames
} from '../lib/mentions'
import type { Message } from '../types'

const AN = '0190a0b0-0000-7000-8000-00000000000a'
const BINH = '0190a0b0-0000-7000-8000-00000000000b'
const CHI = '0190a0b0-0000-7000-8000-00000000000c'
const GONE = '0190a0b0-0000-7000-8000-00000000000d'
const LEADS = '0190a0b0-0000-7000-8000-0000000000f1'
const ELSEWHERE = '0190a0b0-0000-7000-8000-0000000000f3'
const GENERAL = '0190a0b0-0000-7000-8000-0000000000c1'
const SECRET = '0190a0b0-0000-7000-8000-0000000000c2'

const person = (id: string, name: string) => ({ id, username: name.toLowerCase(), displayName: name, avatarUrl: null })

const message = (over: Partial<Message> = {}): Message => ({
    id: 'm1',
    channelId: 'hoi-dap',
    type: 'regular',
    author: person(BINH, 'Bình'),
    content: '',
    mentionUsers: [],
    mentionRoles: [],
    mentionEveryone: false,
    systemEvent: null,
    systemData: null,
    systemUser: null,
    pinned: false,
    reactions: [],
    replyTo: null,
    editedAt: null,
    createdAt: '2026-11-14T13:00:00.000Z',
    ...over
})

/*
 * The backend's own cases (NezFocus-Backend `messaging/domain/mention.rules.spec.ts`,
 * "Finding the mentions of a message"): the two must find the same mentions,
 * so a chip is drawn exactly where a mention counts (D-172). Change both together.
 */
describe('Finding the mentions of a message, as the backend does (REQ-MSG-03, D-172)', () => {
    it('finds people, roles, channels and @everyone, each once, in the order written', () => {
        expect(findMentions(`<@${BINH}> <@&${LEADS}> <#${GENERAL}> @everyone <@${BINH}> <@${CHI}>`)).toEqual({
            userIds: [BINH, CHI],
            roleIds: [LEADS],
            channelIds: [GENERAL],
            everyone: true
        })
    })

    it('finds nothing in code or in a link', () => {
        expect(findMentions(`\`<@${BINH}>\` \`\`\`\n@everyone\n\`\`\` https://example.com/@everyone`)).toEqual({
            userIds: [],
            roleIds: [],
            channelIds: [],
            everyone: false
        })
    })

    it('takes @everyone only as a word of its own', () => {
        expect(findMentions('mail@everyone.example').everyone).toBe(false)
        expect(findMentions('@everyones').everyone).toBe(false)
        expect(findMentions('(@everyone!)').everyone).toBe(true)
    })

    it('leaves @here as words until it comes with presence (M2 L7)', () => {
        expect(findMentions('@here')).toEqual({ userIds: [], roleIds: [], channelIds: [], everyone: false })
    })

    it('takes only well-formed ids', () => {
        expect(findMentions('<@123> <@&not-an-id> <#>').userIds).toEqual([])
    })
})

describe('A message about the one reading it (C-10 `related`, D-39, D-172)', () => {
    const an = { id: AN, roleIds: [LEADS] }

    it('is one that mentions them, @everyone in effect, or a role they hold', () => {
        expect(isRelated(message({ mentionUsers: [{ id: AN, username: 'an', displayName: 'An' }] }), an)).toBe(true)
        expect(isRelated(message({ mentionEveryone: true }), an)).toBe(true)
        expect(isRelated(message({ mentionRoles: [{ id: LEADS, name: 'Trưởng nhóm' }] }), an)).toBe(true)
    })

    it('is a reply to one of their messages', () => {
        const replyTo = {
            id: 'm0',
            author: person(AN, 'An'),
            content: 'Ok',
            deleted: false,
            mentionUsers: [],
            mentionRoles: []
        }
        expect(isRelated(message({ replyTo }), an)).toBe(true)
    })

    it('is not one of their own, whatever it mentions', () => {
        const own = message({
            author: person(AN, 'An'),
            mentionUsers: [{ id: AN, username: 'an', displayName: 'An' }],
            mentionEveryone: true,
            mentionRoles: [{ id: LEADS, name: 'Trưởng nhóm' }]
        })
        expect(isRelated(own, an)).toBe(false)
    })

    it('is not one mentioning others, a role they do not hold, or only writing @everyone as words', () => {
        expect(isRelated(message({ mentionUsers: [{ id: CHI, username: 'chi', displayName: 'Chi' }] }), an)).toBe(false)
        expect(isRelated(message({ mentionRoles: [{ id: ELSEWHERE, name: 'Khác' }] }), an)).toBe(false)
        expect(isRelated(message({ content: '@everyone', mentionEveryone: false }), an)).toBe(false)
    })

    it('is not a system message, nor anything while who reads is not known yet', () => {
        expect(isRelated(message({ type: 'system', author: null, mentionEveryone: true }), an)).toBe(false)
        expect(isRelated(message({ mentionEveryone: true }), { id: undefined, roleIds: [] })).toBe(false)
    })
})

const names: MentionNames = {
    users: [
        { id: BINH, username: 'binh.tran', displayName: 'Bình' },
        { id: CHI, username: 'chi.le', displayName: null },
        { id: GONE, username: null, displayName: null }
    ],
    roles: [{ id: LEADS, name: 'Trưởng nhóm' }],
    channel: (id) => (id === GENERAL ? { kind: 'channel', to: '/channels/s/g', name: 'hoi-dap' } : { kind: 'hidden' })
}
const words = {
    deletedAccount: 'Tài khoản đã bị xóa',
    unknownUser: '@người dùng không rõ',
    unknownRole: '@vai trò không rõ',
    hiddenChannel: '#không xem được'
}

describe('How a mention reads (REQ-MSG-03, D-171; owner, 14/11/2026)', () => {
    it('names a person by their name, else their username; an account deleted since says so', () => {
        expect(mentionName({ type: 'mention', kind: 'user', id: BINH }, names, words)).toBe('@Bình')
        expect(mentionName({ type: 'mention', kind: 'user', id: CHI }, names, words)).toBe('@chi.le')
        expect(mentionName({ type: 'mention', kind: 'user', id: GONE }, names, words)).toBe('@Tài khoản đã bị xóa')
    })

    it('names a role and a channel as they are now; one pointing at nothing says it is unknown', () => {
        expect(mentionName({ type: 'mention', kind: 'role', id: LEADS }, names, words)).toBe('@Trưởng nhóm')
        expect(mentionName({ type: 'mention', kind: 'role', id: ELSEWHERE }, names, words)).toBe('@vai trò không rõ')
        expect(mentionName({ type: 'mention', kind: 'user', id: AN }, names, words)).toBe('@người dùng không rõ')
        expect(mentionName({ type: 'mention', kind: 'channel', id: GENERAL }, names, words)).toBe('#hoi-dap')
        expect(mentionName({ type: 'mention', kind: 'channel', id: SECRET }, names, words)).toBe('#không xem được')
        expect(mentionName({ type: 'everyone' }, names, words)).toBe('@everyone')
    })

    it('copies a message with names in place of its tokens, formatting kept', () => {
        expect(readableText(`**<@${BINH}>** xem <#${GENERAL}> nhé <@&${LEADS}>`, names, words)).toBe(
            '**@Bình** xem #hoi-dap nhé @Trưởng nhóm'
        )
    })
})

describe('The names a message being edited shows in its box', () => {
    it('names each token it can, and leaves the others as written', () => {
        const content = `<@${BINH}> <@&${LEADS}> <#${GENERAL}> <#${SECRET}> <@&${ELSEWHERE}> @everyone`
        expect(composerNames(content, names, words)).toEqual({
            [`<@${BINH}>`]: '@Bình',
            [`<@&${LEADS}>`]: '@Trưởng nhóm',
            [`<#${GENERAL}>`]: '#hoi-dap'
        })
    })
})

describe('What a suggestion matches (C-12 › MentionSuggest)', () => {
    it('is the start of the name or of one of its words, without accents or case', () => {
        expect(startsAWord('Trưởng nhóm', 'tr')).toBe(true)
        expect(startsAWord('Quản trị', 'TRI')).toBe(true)
        expect(startsAWord('binh.tran', 'tran')).toBe(true)
        expect(startsAWord('tai-lieu', 'lieu')).toBe(true)
        expect(startsAWord('Trưởng nhóm', 'truong nh')).toBe(true)
        expect(startsAWord('Bình', '')).toBe(true)
    })

    it('is not the middle of a word', () => {
        expect(startsAWord('Bình', 'inh')).toBe(false)
        expect(startsAWord('hoi-dap', 'ap')).toBe(false)
    })
})
