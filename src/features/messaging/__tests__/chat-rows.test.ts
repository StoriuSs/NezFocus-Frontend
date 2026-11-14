import { describe, expect, it } from 'vitest'
import { chatRows } from '../lib/chat-rows'
import type { ChatMessage, Message } from '../types'

const ZONE = 'Asia/Ho_Chi_Minh'
const person = (id: string) => ({ id, username: id, displayName: id, avatarUrl: null })

/** A message of `who` at `time` (local, 18/10/2026 unless `day` says otherwise). */
const at = (who: string | null, time: string, day = '2026-10-18'): Message => ({
    id: `${day}T${time}-${who}`,
    channelId: 'hoi-dap',
    type: who ? 'regular' : 'system',
    author: who ? person(who) : null,
    content: '',
    systemEvent: who ? null : 'member_joined',
    systemData: null,
    systemUser: null,
    pinned: false,
    reactions: [],
    replyTo: null,
    editedAt: null,
    createdAt: new Date(`${day}T${time}:00+07:00`).toISOString()
})

const shape = (messages: ChatMessage[]) =>
    chatRows(messages, ZONE).map((row) =>
        row.kind === 'date' ? `— ${row.day}` : `${row.grouped ? '  ' : ''}${row.message.author?.id ?? 'system'}`
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
