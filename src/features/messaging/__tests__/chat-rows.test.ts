import { describe, expect, it } from 'vitest'
import { chatRows, type ChatFolds } from '../lib/chat-rows'
import type { ChatMessage, Message } from '../types'

const ZONE = 'Asia/Ho_Chi_Minh'
const person = (id: string) => ({ id, username: id, displayName: id, avatarUrl: null })

/** A message of `who` at `time` (local, 18/10/2026 unless `day` says otherwise). */
const at = (who: string | null, time: string, day = '2026-10-18'): Message => ({
    attachments: [],
    id: `${day}T${time}-${who}`,
    channelId: 'hoi-dap',
    type: who ? 'regular' : 'system',
    author: who ? person(who) : null,
    content: '',
    mentionUsers: [],
    mentionRoles: [],
    mentionEveryone: false,
    mentionHereUserIds: [],
    systemEvent: who ? null : 'member_joined',
    systemData: null,
    systemUser: null,
    systemUsers: [],
    pinned: false,
    reactions: [],
    replyTo: null,
    editedAt: null,
    createdAt: new Date(`${day}T${time}:00+07:00`).toISOString()
})

const shape = (messages: ChatMessage[], fold?: ChatFolds) =>
    chatRows(messages, ZONE, fold).map((row) =>
        row.kind === 'date'
            ? `— ${row.day}`
            : row.kind === 'blocked'
              ? `[${row.count} blocked]`
              : `${row.grouped ? '  ' : ''}${row.message.author?.id ?? 'system'}${row.hides ? ' (Ẩn)' : ''}`
    )

describe('Rows of the message list (C-10 › Luật)', () => {
    it('opens each day with its date line', () => {
        expect(shape([at('binh', '20:02', '2026-10-17'), at('chi', '20:04')])).toEqual([
            '— 2026-10-17',
            'binh',
            '— 2026-10-18',
            'chi'
        ])
    })

    it('groups one person within 5 minutes of the first message of the group, not of the one before', () => {
        // Bình 21:07, 21:10, 21:13, 21:16: groups "21:07" (21:07, 21:10) and "21:13" (21:13, 21:16).
        expect(shape(['21:07', '21:10', '21:13', '21:16'].map((time) => at('binh', time)))).toEqual([
            '— 2026-10-18',
            'binh',
            '  binh',
            'binh',
            '  binh'
        ])
    })

    it('starts a new group when someone else speaks, or a day begins', () => {
        expect(
            shape([at('binh', '23:58', '2026-10-17'), at('binh', '00:01'), at('chi', '00:02'), at('binh', '00:03')])
        ).toEqual(['— 2026-10-17', 'binh', '— 2026-10-18', 'binh', 'chi', 'binh'])
    })

    it('never groups a system message, nor anything after it', () => {
        expect(shape([at('binh', '20:00'), at(null, '20:01'), at('binh', '20:02')])).toEqual([
            '— 2026-10-18',
            'binh',
            'system',
            'binh'
        ])
    })

    it("groups a message on its way with the sender's last one", () => {
        const sending: ChatMessage = {
            nonce: 'n1',
            channelId: 'hoi-dap',
            content: 'Ok',
            author: person('binh'),
            createdAt: new Date('2026-10-18T20:03:00+07:00').toISOString(),
            state: 'sending'
        }
        const rows = chatRows([at('binh', '20:02'), sending], ZONE)
        expect(rows.map((row) => row.key)).toEqual(['day:2026-10-18', '2026-10-18T20:02-binh', 'nonce:n1'])
        expect(rows[2]).toMatchObject({ kind: 'message', grouped: true })
    })
})

describe('Messages of people one blocked (02 S-CHAT-01 `blocked`, D-250)', () => {
    const KHANH = new Set(['khanh'])
    const none = new Set<string>()

    it('folds a run of their messages into one row, several people in a row too, ending a group', () => {
        expect(
            shape(
                [
                    at('binh', '20:02'),
                    at('khanh', '20:03'),
                    at('khanh', '20:04'),
                    at('binh', '20:05'),
                    at('chi', '20:06')
                ],
                { blocked: KHANH, shown: none }
            )
        ).toEqual(['— 2026-10-18', 'binh', '[2 blocked]', 'binh', 'chi'])
        expect(
            shape([at('khanh', '20:03'), at('lan', '20:04')], { blocked: new Set(['khanh', 'lan']), shown: none })
        ).toEqual(['— 2026-10-18', '[2 blocked]'])
    })

    it('keeps a run within its day, and leaves system messages unfolded', () => {
        expect(
            shape([at('khanh', '23:59', '2026-10-17'), at('khanh', '00:01'), at(null, '00:02'), at('khanh', '00:03')], {
                blocked: KHANH,
                shown: none
            })
        ).toEqual(['— 2026-10-17', '[1 blocked]', '— 2026-10-18', '[1 blocked]', 'system', '[1 blocked]'])
    })

    it('draws a run shown again as messages, the first heading its group with "Ẩn"', () => {
        const messages = [at('binh', '20:02'), at('khanh', '20:03'), at('khanh', '20:04')]
        const [, , folded] = chatRows(messages, ZONE, { blocked: KHANH, shown: none })
        expect(folded).toEqual({
            kind: 'blocked',
            key: 'blocked:2026-10-18T20:03-khanh',
            count: 2,
            messageIds: ['2026-10-18T20:03-khanh', '2026-10-18T20:04-khanh']
        })
        const shown = new Set(folded!.kind === 'blocked' ? folded!.messageIds : [])
        expect(shape(messages, { blocked: KHANH, shown })).toEqual(['— 2026-10-18', 'binh', 'khanh (Ẩn)', '  khanh'])
    })

    it('keeps a run shown when it grows: older messages loaded above it, a new one below', () => {
        const shown = new Set(['2026-10-18T20:03-khanh'])
        expect(
            shape([at('khanh', '20:01'), at('khanh', '20:03'), at('khanh', '20:04')], { blocked: KHANH, shown })
        ).toEqual(['— 2026-10-18', 'khanh (Ẩn)', '  khanh', '  khanh'])
    })

    it('folds nothing with nobody blocked', () => {
        expect(shape([at('khanh', '20:03')], { blocked: none, shown: none })).toEqual(['— 2026-10-18', 'khanh'])
    })
})
