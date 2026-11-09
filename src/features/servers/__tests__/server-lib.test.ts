import { describe, expect, it } from 'vitest'
import { channelGroups, firstTextChannel } from '../lib/channel-list'
import { can } from '../lib/permissions'
import { isServerName, serverInitials, serverNameLength } from '../lib/server-name'
import type { ServerChannel } from '../types'

const channel = (id: string, extra: Partial<ServerChannel> = {}): ServerChannel => ({
    id,
    categoryId: null,
    type: 'text',
    name: id,
    position: 0,
    isPrivate: false,
    sendMode: 'everyone',
    isStudyRoom: false,
    taskBoardEnabled: false,
    permissions: '0',
    ...extra
})

describe('server names', () => {
    it('takes the first letter of the first two words, in capitals (C-05)', () => {
        expect(serverInitials('Ôn thi Giải tích 2')).toBe('ÔT')
        expect(serverInitials('  nhóm   đồ án ')).toBe('NĐ')
        expect(serverInitials('Toán')).toBe('T')
        expect(serverInitials('🙂 vui')).toBe('🙂V')
        expect(serverInitials('   ')).toBe('')
    })

    it('counts as the API does: code points, after composing and trimming', () => {
        expect(serverNameLength(' Ôn '.normalize('NFD'))).toBe(2)
        expect(isServerName('Ôn'.normalize('NFD'))).toBe(true)
        expect(isServerName('🙂'.repeat(100))).toBe(true)
    })

    it.each([
        ['one character', 'Ô'],
        ['blank', '    '],
        ['invisible only', 'ㅤㅤ'],
        ['two lines', 'Ôn\nthi'],
        ['101 characters', 'a'.repeat(101)]
    ])('refuses %s', (_title, name) => {
        expect(isServerName(name)).toBe(false)
    })
})

describe('channel list order', () => {
    const server = {
        categories: [
            { id: 'rooms', name: 'Phòng học', position: 1 },
            { id: 'info', name: 'Thông tin', position: 0 },
            { id: 'empty', name: 'Ôn tập cuối kỳ', position: 2 }
        ],
        channels: [
            channel('hoi-dap', { categoryId: 'info', position: 1 }),
            channel('room', { categoryId: 'rooms', type: 'voice' }),
            channel('chao-mung', { categoryId: 'info', position: 0 }),
            channel('loose-room', { type: 'voice', position: 0 }),
            channel('thong-bao', { position: 1 })
        ]
    }

    it('puts the channels outside any category first, then each category, all by position', () => {
        expect(channelGroups(server).map((g) => [g.category?.id ?? null, g.channels.map((c) => c.id)])).toEqual([
            [null, ['loose-room', 'thong-bao']],
            ['info', ['chao-mung', 'hoi-dap']],
            ['rooms', ['room']],
            ['empty', []]
        ])
    })

    it('opens a server at its first text channel in that order, skipping rooms', () => {
        expect(firstTextChannel(server)?.id).toBe('thong-bao')
        expect(firstTextChannel({ categories: [], channels: [channel('room', { type: 'voice' })] })).toBeUndefined()
    })

    it('has no group for loose channels when there are none', () => {
        expect(channelGroups({ categories: [], channels: [] })).toEqual([])
    })
})

describe('can', () => {
    it('reads a bit from the decimal string the API sends, past 32 bits too', () => {
        const bits = String((1n << 15n) | (1n << 22n))
        expect(can(bits, 'CONNECT')).toBe(true)
        expect(can(bits, 'MANAGE_TASKS')).toBe(true)
        expect(can(bits, 'SPEAK')).toBe(false)
    })

    it('grants nothing for an unreadable value', () => {
        expect(can('', 'CONNECT')).toBe(false)
        expect(can('-1', 'ADMINISTRATOR')).toBe(false)
        expect(can('0x8000', 'CONNECT')).toBe(false)
    })
})
