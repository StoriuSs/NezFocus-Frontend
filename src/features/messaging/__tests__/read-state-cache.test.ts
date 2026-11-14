import { describe, expect, it } from 'vitest'
import {
    hearDeleted,
    hearEdited,
    hearMessage,
    keepList,
    keepState,
    markRead,
    mentionTotal,
    serverState
} from '../lib/read-state-cache'
import type { BareMessage, ReadState } from '../types'

// UUIDv7-like ids: newer is greater as text, as the backend compares them.
const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`

const state = (channelId: string, more: Partial<ReadState> = {}): ReadState => ({
    serverId: 'nd',
    channelId,
    lastReadId: id(10),
    unreadCount: 0,
    mentionCount: 0,
    ...more
})

const message = (n: number, more: Partial<BareMessage> = {}): BareMessage => ({
    id: id(n),
    channelId: 'hoi-dap',
    type: 'regular',
    author: { id: 'binh', username: 'binh.tran', displayName: 'Bình', avatarUrl: null },
    content: 'Chào',
    mentionUsers: [],
    mentionRoles: [],
    mentionEveryone: false,
    mentionHereUserIds: [],
    systemEvent: null,
    systemData: null,
    systemUser: null,
    pinned: false,
    replyTo: null,
    editedAt: null,
    createdAt: '2026-11-14T13:02:00.000Z',
    ...more
})

const an = { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null }

describe('Keeping read states (REQ-MSG-09, D-173)', () => {
    it('takes a state whose mark is not behind the one held, never an older one', () => {
        const held = [state('hoi-dap', { lastReadId: id(20), unreadCount: 3 })]

        expect(keepState(held, state('hoi-dap', { lastReadId: id(30) }))).toEqual([
            state('hoi-dap', { lastReadId: id(30) })
        ])
        expect(keepState(held, state('hoi-dap', { lastReadId: id(20), unreadCount: 4 }))?.[0]?.unreadCount).toBe(4)
        expect(keepState(held, state('hoi-dap', { lastReadId: id(15) }))).toBe(held)
    })

    it('adds the state of a channel not held yet, and holds nothing before the first read', () => {
        expect(keepState([state('hoi-dap')], state('tai-lieu'))?.map((s) => s.channelId)).toEqual([
            'hoi-dap',
            'tai-lieu'
        ])
        expect(keepState(undefined, state('tai-lieu'))).toBeUndefined()
    })

    it('reads a fresh list as it comes, keeping a channel whose held mark is further on', () => {
        const held = [state('hoi-dap', { lastReadId: id(40) }), state('gone')]
        const fresh = [state('hoi-dap', { lastReadId: id(30), unreadCount: 5 }), state('tai-lieu')]

        expect(keepList(held, fresh)).toEqual([state('hoi-dap', { lastReadId: id(40) }), state('tai-lieu')])
        expect(keepList(undefined, fresh)).toBe(fresh)
    })
})

describe('A message heard on the socket', () => {
    const held = [state('hoi-dap'), state('tai-lieu')]

    it('makes its channel unread by one, about the reader by one when it mentions them', () => {
        const plain = hearMessage(held, message(11), 'an')
        expect(plain.refetch).toBe(false)
        expect(plain.states?.[0]).toMatchObject({ unreadCount: 1, mentionCount: 0 })

        const mention = hearMessage(held, message(11, { mentionUsers: [an] }), 'an')
        expect(mention.states?.[0]).toMatchObject({ unreadCount: 1, mentionCount: 1 })

        const everyone = hearMessage(held, message(11, { mentionEveryone: true }), 'an')
        expect(everyone.states?.[0]).toMatchObject({ mentionCount: 1 })

        const reply = hearMessage(
            held,
            message(11, {
                replyTo: { id: id(5), author: an, content: 'x', deleted: false, mentionUsers: [], mentionRoles: [] }
            }),
            'an'
        )
        expect(reply.states?.[0]).toMatchObject({ mentionCount: 1 })
    })

    it('stops counting at 100, which shows as 99+', () => {
        const full = [state('hoi-dap', { unreadCount: 100, mentionCount: 100 })]
        expect(hearMessage(full, message(11, { mentionEveryone: true }), 'an').states?.[0]).toMatchObject({
            unreadCount: 100,
            mentionCount: 100
        })
    })

    it('counts nothing for one’s own message, nor a system message about oneself (D-173)', () => {
        expect(hearMessage(held, message(11, { author: an, mentionEveryone: true }), 'an').states).toBe(held)
        const aboutMe = message(11, {
            type: 'system',
            author: null,
            systemEvent: 'message_pinned',
            systemData: { userId: 'an' }
        })
        expect(hearMessage(held, aboutMe, 'an').states).toBe(held)
    })

    it('counts a system message about someone else as unread, never as a mention', () => {
        const aboutBinh = message(11, {
            type: 'system',
            author: null,
            systemEvent: 'message_pinned',
            systemData: { userId: 'binh' },
            mentionEveryone: true
        })
        expect(hearMessage(held, aboutBinh, 'an').states?.[0]).toMatchObject({ unreadCount: 1, mentionCount: 0 })
    })

    it('counts nothing at or before the mark (heard late)', () => {
        expect(hearMessage(held, message(10), 'an').states).toBe(held)
        expect(hearMessage(held, message(9), 'an').states).toBe(held)
    })

    it('asks for the list again when it mentions a role: whose roles are those is the server’s to say', () => {
        const role = hearMessage(held, message(11, { mentionRoles: [{ id: 'r1', name: 'Trưởng nhóm' }] }), 'an')
        expect(role.refetch).toBe(true)
        expect(role.states?.[0]).toMatchObject({ unreadCount: 1, mentionCount: 0 })
        // Already about the reader another way: counted, nothing to ask.
        const both = hearMessage(
            held,
            message(11, { mentionUsers: [an], mentionRoles: [{ id: 'r1', name: 'x' }] }),
            'an'
        )
        expect(both.refetch).toBe(false)
        expect(both.states?.[0]).toMatchObject({ mentionCount: 1 })
    })

    it('asks for the list again for a reply to a deleted message: whose it was is the server’s to say (D-172)', () => {
        const reply = message(11, {
            replyTo: { id: id(5), author: null, content: '', deleted: true, mentionUsers: [], mentionRoles: [] }
        })
        expect(hearMessage(held, reply, 'an')).toMatchObject({ refetch: true })
    })

    it('asks for the list again for a channel it holds no state of (new, or newly seen)', () => {
        const heard = hearMessage(held, message(11, { channelId: 'moi' }), 'an')
        expect(heard).toEqual({ states: held, refetch: true })
    })

    it('does nothing before the list is first read', () => {
        expect(hearMessage(undefined, message(11), 'an')).toEqual({ states: undefined, refetch: false })
    })
})

describe('A message deleted', () => {
    const held = [state('hoi-dap', { unreadCount: 2 })]

    it('asks for the list again when it was after the mark: it may have been unread, or about the reader', () => {
        expect(hearDeleted(held, 'hoi-dap', id(11))).toEqual({ states: held, refetch: true })
    })

    it('changes nothing when it was read already, or in a channel not held', () => {
        expect(hearDeleted(held, 'hoi-dap', id(10)).refetch).toBe(false)
        expect(hearDeleted(held, 'khac', id(11)).refetch).toBe(false)
    })
})

describe('A message edited', () => {
    const held = [state('hoi-dap')]

    it('asks for the list again when it is unread: a mention may have come or gone', () => {
        expect(hearEdited(held, message(11, { mentionUsers: [an] }), 'an')).toEqual({ states: held, refetch: true })
    })

    it('changes nothing when it was read already, or is the reader’s own', () => {
        expect(hearEdited(held, message(10), 'an').refetch).toBe(false)
        expect(hearEdited(held, message(11, { author: an }), 'an').refetch).toBe(false)
        expect(hearEdited(held, message(11, { channelId: 'khac' }), 'an').refetch).toBe(false)
    })
})

describe('Marking read here', () => {
    const held = [state('hoi-dap', { unreadCount: 4, mentionCount: 2 })]

    it('moves the mark forward, and clears the counts when it reached the newest message', () => {
        expect(markRead(held, 'hoi-dap', id(12), false)?.[0]).toMatchObject({
            lastReadId: id(12),
            unreadCount: 4,
            mentionCount: 2
        })
        expect(markRead(held, 'hoi-dap', id(14), true)?.[0]).toMatchObject({
            lastReadId: id(14),
            unreadCount: 0,
            mentionCount: 0
        })
    })

    it('never moves it back', () => {
        expect(markRead(held, 'hoi-dap', id(9), true)).toBe(held)
    })
})

describe('Totals', () => {
    const held = [
        state('hoi-dap', { serverId: 'nd', unreadCount: 3, mentionCount: 2 }),
        state('chung', { serverId: 'nd', unreadCount: 1, mentionCount: 0 }),
        state('cg-chung', { serverId: 'cg', unreadCount: 5, mentionCount: 0 }),
        state('ot-chung', { serverId: 'ot', unreadCount: 0, mentionCount: 0 }),
        state('x', { serverId: 'xx', unreadCount: 100, mentionCount: 100 })
    ]

    it('a server is unread when any of its channels is; its badge is the sum of their mentions', () => {
        expect(serverState(held, 'nd')).toEqual({ unread: true, mentions: 2 })
        expect(serverState(held, 'cg')).toEqual({ unread: true, mentions: 0 })
        expect(serverState(held, 'ot')).toEqual({ unread: false, mentions: 0 })
        expect(serverState(undefined, 'nd')).toEqual({ unread: false, mentions: 0 })
    })

    it('the tab’s number is every mention of the reader still unread', () => {
        expect(mentionTotal(held)).toBe(102)
        expect(mentionTotal(undefined)).toBe(0)
    })

    it('counts only the channels still listed: a server left, a channel deleted, no longer count (owner, 14/11/2026)', () => {
        expect(serverState(held, 'nd', ['chung'])).toEqual({ unread: true, mentions: 0 })
        expect(mentionTotal(held, ['hoi-dap', 'cg-chung'])).toBe(2)
    })
})
