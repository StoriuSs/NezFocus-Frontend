import { describe, expect, it } from 'vitest'
import { dmChatPermissions, dmStanding, isGone, showsPresence } from '../lib/dm-chat'
import {
    dmWith,
    heldDms,
    isLastOf,
    previewOf,
    shownDms,
    withDm,
    withDmPresence,
    withEdited,
    withMessage,
    withoutDm,
    type HeardMessage,
    type PreviewWords
} from '../lib/dm-list'
import { forgetMessagesPlace, messagesPlace, rememberMessagesPlace } from '../lib/messages-place'
import { dmMessageLink, dmPath, isMessagesPath, messagesPlaceOf } from '../lib/paths'
import type { Dm, DmLastMessage } from '../types'

// UUIDv7-like ids: newer is greater as text, as the backend compares them.
const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`

const last = (n: number, at: string, more: Partial<DmLastMessage> = {}): DmLastMessage => ({
    id: id(n),
    type: 'regular',
    systemEvent: null,
    systemData: null,
    authorId: 'binh',
    content: 'Ok',
    mentionUsers: [],
    files: { count: 0, images: 0 },
    createdAt: at,
    ...more
})
const dm = (channelId: string, userId: string, lastMessage: DmLastMessage | null, more: Partial<Dm> = {}): Dm => ({
    id: channelId,
    user: { id: userId, username: `${userId}.x`, displayName: userId, avatarUrl: null },
    presence: 'online',
    activity: null,
    lastMessage,
    canMessage: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...more
})
const heard = (n: number, channelId: string, more: Partial<HeardMessage> = {}): HeardMessage => ({
    id: id(n),
    channelId,
    type: 'regular',
    systemEvent: null,
    systemData: null,
    author: { id: 'tuan' },
    content: 'An ơi rảnh không',
    mentionUsers: [],
    attachments: [],
    createdAt: '2026-10-18T14:46:00.000Z',
    ...more
})

const TUAN = dm('dm-tuan', 'tuan', last(5, '2026-10-18T14:46:00.000Z'))
const BINH = dm('dm-binh', 'binh', last(4, '2026-10-18T14:09:00.000Z'))
const CHI = dm('dm-chi', 'chi', last(3, '2026-10-18T13:31:00.000Z'))
const NEW = dm('dm-phong', 'phong', null, { createdAt: '2026-10-18T14:47:00.000Z' })

describe('The DM column (S-DM-01, Q5)', () => {
    it('lists the latest active first, ties by id, a DM with no message only while open (D-249 L7-f)', () => {
        const tie = dm('dm-zz', 'zz', last(9, '2026-10-18T14:09:00.000Z'))
        expect(shownDms([CHI, BINH, NEW, TUAN, tie], undefined).map((one) => one.id)).toEqual([
            'dm-tuan',
            'dm-zz',
            'dm-binh',
            'dm-chi'
        ])
        expect(shownDms([CHI, NEW, TUAN], 'dm-phong').map((one) => one.id)).toEqual(['dm-phong', 'dm-tuan', 'dm-chi'])
        // Made days ago and still empty, opened again: at the top while open all the same (S-DM-01 › Thứ tự).
        const old = dm('dm-old', 'old', null, { createdAt: '2026-09-01T00:00:00.000Z' })
        expect(shownDms([CHI, old, TUAN], 'dm-old').map((one) => one.id)).toEqual(['dm-old', 'dm-tuan', 'dm-chi'])
    })

    it('holds the order shown while the pointer is over the column: a closed one goes, a new one comes last', () => {
        const rows = [CHI, TUAN, NEW]
        expect(heldDms(['dm-tuan', 'dm-binh', 'dm-chi'], rows).map((one) => one.id)).toEqual([
            'dm-tuan',
            'dm-chi',
            'dm-phong'
        ])
    })

    it('puts a DM in its place, adds one, takes one out, finds mine with someone', () => {
        const edited = { ...BINH, canMessage: false }
        expect(withDm([TUAN, BINH], edited)).toEqual([TUAN, edited])
        expect(withDm([TUAN], BINH)).toEqual([TUAN, BINH])
        expect(withoutDm([TUAN, BINH], 'dm-tuan')).toEqual([BINH])
        expect(dmWith([TUAN, BINH], 'binh')).toBe(BINH)
        expect(dmWith(undefined, 'binh')).toBeUndefined()
    })

    it('makes a newer message heard the last one, the files counted; an older one or a DM not held changes nothing', () => {
        const list = [CHI, BINH]
        const next = withMessage(list, heard(8, 'dm-chi', { attachments: [{ width: 100 }, { width: null }] }))
        expect(next[0]!.lastMessage).toEqual({
            id: id(8),
            type: 'regular',
            systemEvent: null,
            systemData: null,
            authorId: 'tuan',
            content: 'An ơi rảnh không',
            mentionUsers: [],
            files: { count: 2, images: 1 },
            createdAt: '2026-10-18T14:46:00.000Z'
        })
        expect(withMessage(list, heard(1, 'dm-chi'))).toBe(list)
        expect(withMessage(list, heard(9, 'dm-tuan'))).toBe(list)
    })

    it("changes the last message's words on its edit only; a deletion of it asks for the list", () => {
        const list = [BINH]
        expect(withEdited(list, heard(4, 'dm-binh', { content: 'Ok nhé' }))[0]!.lastMessage!.content).toBe('Ok nhé')
        expect(withEdited(list, heard(2, 'dm-binh'))).toBe(list)
        expect(isLastOf(list, 'dm-binh', id(4))).toBe(true)
        expect(isLastOf(list, 'dm-binh', id(2))).toBe(false)
        expect(isLastOf(undefined, 'dm-binh', id(4))).toBe(false)
    })

    it('moves the dot where it is given, never where it is not (presence null)', () => {
        const hidden = dm('dm-phong', 'phong', null, { presence: null })
        const list = [BINH, hidden]
        expect(withDmPresence(list, 'binh', 'idle')[0]!.presence).toBe('idle')
        expect(withDmPresence(list, 'phong', 'online')).toBe(list)
    })

    it('says the last message on one line: "Bạn: …" for mine, files alone, a call as it went', () => {
        const words: PreviewWords = {
            mine: (text: string) => `Bạn: ${text}`,
            image: 'Đã gửi một ảnh',
            file: 'Đã gửi một tệp',
            call: (call) => (call ? `${call.outcome} ${call.seconds ?? '-'}` : 'Cuộc gọi')
        }
        const plain = (message: DmLastMessage) => message.content
        expect(previewOf(last(1, 'x', { content: 'Đi,\n8h nhé' }), 'binh', plain, words)).toBe('Bạn: Đi, 8h nhé')
        expect(previewOf(last(1, 'x', { authorId: 'tuan', content: 'Chào' }), 'binh', plain, words)).toBe('Chào')
        expect(
            previewOf(
                last(1, 'x', { authorId: 'tuan', content: '', files: { count: 1, images: 1 } }),
                'binh',
                plain,
                words
            )
        ).toBe('Đã gửi một ảnh')
        expect(
            previewOf(
                last(1, 'x', { authorId: 'tuan', content: '', files: { count: 2, images: 1 } }),
                'binh',
                plain,
                words
            )
        ).toBe('Đã gửi một tệp')
        expect(
            previewOf(last(1, 'x', { type: 'system', authorId: null, systemEvent: 'call_ended' }), 'binh', plain, words)
        ).toBe('Cuộc gọi')
        const call = (status: string, durationSeconds: number | null) =>
            last(1, 'x', {
                type: 'system',
                authorId: null,
                systemEvent: 'call_ended',
                systemData: { userId: 'tuan', callId: 'c1', status, endReason: null, video: false, durationSeconds }
            })
        expect(previewOf(call('missed', null), 'binh', plain, words)).toBe('missed -')
        expect(previewOf(call('ended', 754), 'binh', plain, words)).toBe('ended 754')
        // A pin in a DM is a system message too, but no call (C-30 has no words for it).
        const pin = last(1, 'x', { type: 'system', authorId: null, systemEvent: 'message_pinned' })
        expect(previewOf(pin, 'binh', plain, words)).toBe('')
        expect(previewOf(null, 'binh', plain, words)).toBe('')
    })
})

describe('Where a DM stands (S-DM-03, D-238, D-249 L7-c)', () => {
    const gone = { id: 'em', username: null, displayName: null, avatarUrl: null }

    it('reads deleted first, then blocked by me, then whether I may message them', () => {
        expect(isGone(gone)).toBe(true)
        expect(dmStanding({ user: gone, canMessage: false }, true)).toBe('deleted-account')
        expect(dmStanding(BINH, true)).toBe('blocked-by-me')
        expect(dmStanding({ ...BINH, canMessage: false }, false)).toBe('cannot-message')
        expect(dmStanding(BINH, false)).toBe('open')
        expect(showsPresence('open')).toBe(true)
        expect(showsPresence('cannot-message')).toBe(false)
    })

    it('lets both pin and each delete their own, sending only while open, never @everyone or moderation', () => {
        expect(dmChatPermissions('open')).toEqual({
            send: true,
            sendBlocked: null,
            manage: false,
            pins: true,
            deleteOwn: true,
            react: true,
            addReactions: true,
            mentionEveryone: false,
            attachFiles: true
        })
        expect(dmChatPermissions('cannot-message')).toMatchObject({
            send: false,
            sendBlocked: { reason: 'cannot-message' },
            react: false,
            addReactions: false,
            attachFiles: false,
            pins: true,
            deleteOwn: true
        })
        expect(dmChatPermissions('blocked-by-me').sendBlocked).toEqual({ reason: 'cannot-message' })
        expect(dmChatPermissions('deleted-account').sendBlocked).toEqual({ reason: 'deleted-account' })
    })
})

describe('Paths and where 💬 goes (09 › URL, Q6, D-249 L7-e)', () => {
    it('builds DM paths, and lights 💬 on the Friends page and every DM', () => {
        expect(dmPath('d1')).toBe('/dm/d1')
        expect(dmMessageLink('d1', 'm1')).toBe(`${window.location.origin}/dm/d1/m1`)
        expect(isMessagesPath('/friends')).toBe(true)
        expect(isMessagesPath('/dm/d1/m1')).toBe(true)
        expect(isMessagesPath('/study')).toBe(false)
    })

    it('keeps a DM without its message and the Friends page without its tab, nothing else', () => {
        expect(messagesPlaceOf('/dm/d1/m1')).toBe('/dm/d1')
        expect(messagesPlaceOf('/friends')).toBe('/friends')
        expect(messagesPlaceOf('/channels/s/c')).toBeNull()
    })

    it('remembers the last place for its account only, and forgets a DM closed', () => {
        expect(messagesPlace('an')).toBeNull()
        rememberMessagesPlace('an', '/dm/d1')
        expect(messagesPlace('an')).toBe('/dm/d1')
        expect(messagesPlace('binh')).toBeNull()
        forgetMessagesPlace('/dm/d2')
        expect(messagesPlace('an')).toBe('/dm/d1')
        forgetMessagesPlace('/dm/d1')
        expect(messagesPlace('an')).toBeNull()
    })
})
