import { describe, expect, it } from 'vitest'
import { dropPin, editPin } from '../lib/pin-cache'
import type { BareMessage, PinnedMessage } from '../types'

const tuan = { id: 'tuan', username: 'tuan.le', displayName: 'Tuấn', avatarUrl: null }

const pinned = (id: string): PinnedMessage => ({
    id,
    channelId: 'hoi-dap',
    type: 'regular',
    author: tuan,
    content: `Tin ${id}`,
    systemEvent: null,
    systemData: null,
    systemUser: null,
    replyTo: null,
    editedAt: null,
    pinned: true,
    reactions: [{ emoji: '👍', count: 2, me: false }],
    createdAt: '2026-10-16T13:30:00.000Z',
    pinnedAt: '2026-10-16T14:00:00.000Z'
})

describe("A channel's pins in the cache (S-CHAT-02)", () => {
    it('drops a message unpinned or deleted, the others kept in order', () => {
        const pins = [pinned('m3'), pinned('m1'), pinned('m2')]
        expect(dropPin(pins, 'm1').map((pin) => pin.id)).toEqual(['m3', 'm2'])
    })

    it('shows the text of a pinned message as edited, keeping when it was pinned and its reactions', () => {
        const pins = [pinned('m1')]
        const { pinnedAt: _at, reactions: _reactions, ...rest } = pinned('m1')
        const edit: BareMessage = { ...rest, content: 'Đề cương mới', editedAt: '2026-10-17T08:00:00.000Z' }

        expect(editPin(pins, edit)).toEqual([{ ...pinned('m1'), content: 'Đề cương mới', editedAt: edit.editedAt }])
    })

    it('keeps the newer text when two edits arrive the wrong way round', () => {
        const pins = [{ ...pinned('m1'), content: 'Bản mới', editedAt: '2026-10-17T09:00:00.000Z' }]
        const { pinnedAt: _at, reactions: _reactions, ...rest } = pinned('m1')
        expect(editPin(pins, { ...rest, content: 'Bản cũ', editedAt: '2026-10-17T08:00:00.000Z' })).toBe(pins)
    })

    it('gives the same list back when the message is not pinned, so nothing draws again', () => {
        const pins = [pinned('m1')]
        const { pinnedAt: _at, reactions: _reactions, ...rest } = pinned('m9')
        expect(dropPin(pins, 'm9')).toBe(pins)
        expect(editPin(pins, rest)).toBe(pins)
    })
})
