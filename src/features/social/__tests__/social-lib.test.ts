import { describe, expect, it } from 'vitest'
import { apiError, httpError } from '@/test/helpers'
import { addFriendProblem, normalizedUsername } from '../lib/add-friend'
import { countsOf, defaultTabOf, groupsOf, heldGroups, matches } from '../lib/friends-list'
import { friendsPath, tabOf } from '../lib/paths'
import { incomingCountOf, withoutPerson, withPresence, withRelationship } from '../lib/relationship-cache'
import { requestTime } from '../lib/request-time'
import type { Presence, Relationship } from '../types'

const person = (id: string, displayName: string | null, username: string | null = id) => ({
    id,
    username,
    displayName,
    avatarUrl: null
})
const friend = (id: string, name: string, presence: Presence, username?: string): Relationship => ({
    type: 'friend',
    since: '2026-10-01T00:00:00.000Z',
    presence,
    activity: null,
    note: null,
    user: person(id, name, username ?? id)
})
const request = (type: 'incoming' | 'outgoing', id: string, name: string, since: string): Relationship => ({
    type,
    since,
    presence: null,
    activity: null,
    note: null,
    user: person(id, name)
})
const blocked = (id: string, name: string): Relationship => ({ ...request('incoming', id, name, ''), type: 'blocked' })

// 09 › luật 3: An's friends, and the requests of luật 4.
const LIST: Relationship[] = [
    friend('nam', 'Nam', 'offline'),
    friend('mai', 'Mai', 'dnd'),
    friend('lan', 'Lan', 'idle'),
    friend('minh', 'Minh', 'online'),
    friend('ha', 'Hà', 'online'),
    friend('chi', 'Chi', 'online'),
    friend('binh', 'Bình', 'online'),
    request('incoming', 'giang', 'Giang', '2026-10-18T12:48:00.000Z'),
    request('outgoing', 'dung', 'Dũng', '2026-10-17T10:00:00.000Z'),
    request('outgoing', 'tuan', 'Tuấn', '2026-10-18T14:47:00.000Z'),
    blocked('khanh', 'Khánh')
]
const ids = (groups: { key: string; rows: Relationship[] }[]) =>
    groups.map(({ key, rows }) => [key, rows.map((row) => row.user.id)])

describe('the tabs of the Friends page (S-DM-02 › Thứ tự, REQ-SOCIAL-02)', () => {
    it('lists on Online the friends not offline: online, then away, then do not disturb, each by name as Vietnamese sorts it', () => {
        expect(ids(groupsOf(LIST, 'online', ''))).toEqual([['online', ['binh', 'chi', 'ha', 'minh', 'lan', 'mai']]])
    })

    it('adds the offline ones on All, by name; requests and blocks are on their own tabs', () => {
        expect(ids(groupsOf(LIST, 'all', ''))).toEqual([
            ['online', ['binh', 'chi', 'ha', 'minh', 'lan', 'mai']],
            ['offline', ['nam']]
        ])
        expect(ids(groupsOf(LIST, 'pending', '', 'outgoing'))).toEqual([['outgoing', ['tuan', 'dung']]])
        expect(ids(groupsOf(LIST, 'pending', ''))).toEqual([['incoming', ['giang']]])
        expect(ids(groupsOf(LIST, 'blocked', ''))).toEqual([['blocked', ['khanh']]])
    })

    it('breaks a tie of names by username, and puts a deleted account (no name) last', () => {
        const list = [
            friend('b', 'An', 'online', 'an.b'),
            { ...friend('gone', '', 'online'), user: person('gone', null, null) },
            friend('a', 'an', 'online', 'an.a')
        ]
        expect(ids(groupsOf(list, 'online', ''))).toEqual([['online', ['a', 'b', 'gone']]])
    })

    it('searches the tab shown by name or username, accents and case aside', () => {
        expect(ids(groupsOf(LIST, 'all', 'minh'))).toEqual([
            ['online', ['minh']],
            ['offline', []]
        ])
        expect(matches(friend('ha', 'Hà', 'online', 'ha.nguyen'), ' HA ')).toBe(true)
        expect(matches(friend('dung', 'Dũng', 'online'), 'dung')).toBe(true)
        expect(matches(friend('ha', 'Hà', 'online', 'ha.nguyen'), 'nguyenn')).toBe(false)
    })

    it('counts each kind, and opens on Pending when a request waits for me', () => {
        expect(countsOf(LIST)).toEqual({ friend: 7, incoming: 1, outgoing: 2, blocked: 1 })
        expect(defaultTabOf(LIST)).toBe('pending')
        expect(defaultTabOf(LIST.filter((entry) => entry.type !== 'incoming'))).toBe('online')
        expect(defaultTabOf(undefined)).toBe('online')
    })

    it('keeps the rows where they were while the pointer is on them, a request answered leaving at once', () => {
        const held = groupsOf(LIST, 'online', '')
        const now = withPresence(withPresence(LIST, 'binh', 'idle'), 'mai', 'online')
        expect(ids(heldGroups(held, now))).toEqual([['online', ['binh', 'chi', 'ha', 'minh', 'lan', 'mai']]])
        expect(heldGroups(held, now)[0]!.rows[0]!.presence).toBe('idle')

        const pending = groupsOf(LIST, 'pending', '')
        expect(ids(heldGroups(pending, withRelationship(LIST, friend('giang', 'Giang', 'online'))))).toEqual([
            ['incoming', []]
        ])
    })
})

describe('the relationships held (D-242)', () => {
    it('puts an answer in its place, takes out `none` and a person removed', () => {
        const accepted = withRelationship(LIST, friend('giang', 'Giang', 'online'))
        expect(accepted.find((entry) => entry.user.id === 'giang')?.type).toBe('friend')
        expect(accepted).toHaveLength(LIST.length)
        expect(withRelationship(LIST, { ...blocked('khanh', 'Khánh'), type: 'none' })).toHaveLength(LIST.length - 1)
        expect(withoutPerson(LIST, 'dung').some((entry) => entry.user.id === 'dung')).toBe(false)
        expect(withoutPerson(LIST, 'nobody')).toBe(LIST)
    })

    it('moves a friend’s dot only, presence being for friends alone', () => {
        expect(withPresence(LIST, 'nam', 'online').find((entry) => entry.user.id === 'nam')?.presence).toBe('online')
        expect(withPresence(LIST, 'giang', 'online')).toBe(LIST)
        expect(withPresence(LIST, 'minh', 'online')).toBe(LIST)
    })

    it('counts the requests to me', () => {
        expect(incomingCountOf(LIST)).toBe(1)
        expect(incomingCountOf(undefined)).toBe(0)
    })
})

describe('Add friend (S-DM-02 › Thêm bạn)', () => {
    it('reads a username as typed: no spaces around, one "@" dropped, lower case', () => {
        expect(normalizedUsername('  @Tuan.Hoang ')).toBe('tuan.hoang')
        expect(normalizedUsername('@@x')).toBe('@x')
    })

    it('tells each refusal apart, the two limits by their reason, with one answer for whoever cannot be asked', () => {
        expect(addFriendProblem(apiError(404, 'NOT_FOUND_ERROR'))).toEqual({ kind: 'notFound' })
        expect(addFriendProblem(apiError(403, 'CANNOT_MESSAGE_USER'))).toEqual({ kind: 'cannot' })
        expect(addFriendProblem(apiError(409, 'FRIEND_REQUEST_PENDING'))).toEqual({ kind: 'pending' })
        expect(addFriendProblem(apiError(409, 'ALREADY_FRIENDS'))).toEqual({ kind: 'alreadyFriends' })
        expect(
            addFriendProblem(
                apiError(429, 'RATE_LIMIT_EXCEEDED', {
                    data: { reason: 'user_lookup' },
                    headers: { 'retry-after': '42' }
                })
            )
        ).toEqual({ kind: 'lookupLimit', waitSeconds: 42 })
        expect(addFriendProblem(apiError(429, 'RATE_LIMIT_EXCEEDED', { data: { reason: 'friend_requests' } }))).toEqual(
            { kind: 'dailyLimit' }
        )
        expect(addFriendProblem(httpError(500, {}))).toEqual({ kind: 'failed' })
        expect(addFriendProblem(new Error('x'))).toEqual({ kind: 'failed' })
    })
})

describe('the time column of a request (D-110 R11)', () => {
    const NOW = new Date('2026-10-18T14:47:18Z') // 21:47 in Hồ Chí Minh
    const at = (iso: string) => requestTime(new Date(iso), NOW, 'Hôm qua', 'Asia/Ho_Chi_Minh')

    it('says the clock today, "Hôm qua" the day before, the date earlier, with the year when another', () => {
        expect(at('2026-10-18T12:48:00Z')).toBe('19:48')
        expect(at('2026-10-17T17:30:00Z')).toBe('00:30')
        expect(at('2026-10-17T16:59:00Z')).toBe('Hôm qua')
        expect(at('2026-10-16T17:00:00Z')).toBe('Hôm qua')
        expect(at('2026-10-15T10:00:00Z')).toBe('15/10')
        expect(at('2025-10-15T10:00:00Z')).toBe('15/10/2025')
    })
})

describe('the paths of the Friends page (D-248)', () => {
    it('names a tab in the address, and reads back only a known one', () => {
        expect(friendsPath()).toBe('/friends')
        expect(friendsPath('blocked')).toBe('/friends?tab=blocked')
        expect(tabOf('pending')).toBe('pending')
        expect(tabOf('other')).toBeNull()
        expect(tabOf(null)).toBeNull()
    })
})
