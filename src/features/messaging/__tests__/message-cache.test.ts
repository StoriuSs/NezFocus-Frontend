import { describe, expect, it } from 'vitest'
import {
    addNewer,
    addOutgoing,
    addSaved,
    dropOutgoing,
    lastSavedId,
    removeSaved,
    replaceSaved,
    setOutgoingState,
    startOver
} from '../lib/message-cache'
import type { ChannelMessages, Message, MessagePage, OutgoingMessage } from '../types'

const binh = { id: 'binh', username: 'binh.tran', displayName: 'Bình', avatarUrl: null }

const saved = (id: string): Message => ({
    id,
    channelId: 'hoi-dap',
    type: 'regular',
    author: binh,
    content: `Tin ${id}`,
    systemEvent: null,
    systemData: null,
    replyTo: null,
    editedAt: null,
    createdAt: '2026-10-18T13:02:00.000Z'
})

const outgoing = (nonce: string): OutgoingMessage => ({
    nonce,
    channelId: 'hoi-dap',
    content: `Đang gửi ${nonce}`,
    author: binh,
    createdAt: '2026-10-18T14:47:00.000Z',
    state: 'sending'
})

const history = (...pages: { ids: string[]; before?: boolean; after?: boolean }[]): ChannelMessages => ({
    pages: pages.map(({ ids, before = false, after = false }) => ({
        items: ids.map(saved),
        hasMoreBefore: before,
        hasMoreAfter: after
    })),
    pageParams: pages.map(() => null)
})

const ids = (data: ChannelMessages) => data.pages.flatMap((page) => page.items.map((item) => item.id))
const nonces = (data: ChannelMessages) => (data.pages.at(-1)?.outgoing ?? []).map((item) => item.nonce)

describe('A channel history in the cache, with messages on their way (ARCHITECTURE 10.2)', () => {
    it('keeps a message being sent after the saved ones', () => {
        const data = addOutgoing(history({ ids: ['m1'] }, { ids: ['m2', 'm3'] }), outgoing('n1'))
        expect(ids(data)).toEqual(['m1', 'm2', 'm3'])
        expect(nonces(data)).toEqual(['n1'])
    })

    it('swaps a message on its way for the saved one, matched by nonce', () => {
        const data = addSaved(addOutgoing(history({ ids: ['m1'] }), outgoing('n1')), saved('m2'), 'n1')
        expect(ids(data)).toEqual(['m1', 'm2'])
        expect(nonces(data)).toEqual([])
    })

    it('adds a saved message once, however many times it is heard (the answer, then the event)', () => {
        const once = addSaved(history({ ids: ['m1'] }), saved('m2'), 'n1')
        expect(ids(addSaved(once, saved('m2'), 'n1'))).toEqual(['m1', 'm2'])
    })

    it('puts a message that arrives late in its place by id', () => {
        expect(ids(addSaved(history({ ids: ['m1', 'm3'] }), saved('m2')))).toEqual(['m1', 'm2', 'm3'])
    })

    it('does not append a new message to a history that stops short of the newest', () => {
        const around = history({ ids: ['m1', 'm2'], after: true })
        expect(ids(addSaved(around, saved('m9')))).toEqual(['m1', 'm2'])
    })

    it('marks one message on its way, then drops it', () => {
        const data = addOutgoing(addOutgoing(history({ ids: [] }), outgoing('n1')), outgoing('n2'))
        const failed = setOutgoingState(data, 'n1', 'rate-limited', 5000)
        expect(failed.pages[0]?.outgoing).toMatchObject([
            { nonce: 'n1', state: 'rate-limited', retryAt: 5000 },
            { state: 'sending' }
        ])
        expect(nonces(dropOutgoing(failed, 'n1'))).toEqual(['n2'])
    })

    it('knows the newest saved message, to catch up from', () => {
        expect(lastSavedId(history({ ids: ['m1'] }, { ids: ['m2', 'm3'] }))).toBe('m3')
        expect(lastSavedId(history({ ids: [] }))).toBeUndefined()
    })

    it('adds what was missed while away, without twins, and says whether more is missing', () => {
        const missed: MessagePage = { items: [saved('m3'), saved('m4')], hasMoreBefore: true, hasMoreAfter: false }
        const data = addNewer(addOutgoing(history({ ids: ['m2', 'm3'] }), outgoing('n1')), missed)
        expect(ids(data)).toEqual(['m2', 'm3', 'm4'])
        expect(nonces(data)).toEqual(['n1'])
        expect(data.pages.at(-1)?.hasMoreAfter).toBe(false)
    })

    it('puts what was missed before a message heard meanwhile, in id order', () => {
        const heard = addSaved(history({ ids: ['m2'] }), saved('m9'))
        const missed: MessagePage = { items: [saved('m3'), saved('m4')], hasMoreBefore: true, hasMoreAfter: false }
        expect(ids(addNewer(heard, missed))).toEqual(['m2', 'm3', 'm4', 'm9'])
    })

    it('starts over from the newest page when too much was missed, keeping what is on its way', () => {
        const latest: MessagePage = { items: [saved('m90')], hasMoreBefore: true, hasMoreAfter: false }
        const data = startOver(addOutgoing(history({ ids: ['m1'] }, { ids: ['m2'] }), outgoing('n1')), latest)
        expect(ids(data)).toEqual(['m90'])
        expect(data.pageParams).toEqual([null])
        expect(nonces(data)).toEqual(['n1'])
    })
})

describe('Edits and deletions in the cache (REQ-MSG-05)', () => {
    const answering = (id: string, original: Message): Message => ({
        ...saved(id),
        replyTo: { id: original.id, author: original.author, content: original.content, deleted: false }
    })
    const outgoingAnswer = (nonce: string, original: Message): OutgoingMessage => ({
        ...outgoing(nonce),
        replyTo: { id: original.id, author: original.author, content: original.content, deleted: false }
    })
    const withReplies = () => {
        const data = history({ ids: ['m1'] }, { ids: [] })
        data.pages[1]!.items = [answering('m2', saved('m1'))]
        return addOutgoing(data, outgoingAnswer('n1', saved('m1')))
    }

    it('swaps an edited message in its place, and in the reply lines that quote it', () => {
        const edited = { ...saved('m1'), content: 'Câu 4 đổi cận', editedAt: '2026-10-18T13:05:00.000Z' }

        const data = replaceSaved(withReplies(), edited)

        expect(data.pages[0]!.items[0]).toEqual(edited)
        expect(data.pages[1]!.items[0]!.replyTo).toMatchObject({ content: 'Câu 4 đổi cận', deleted: false })
        expect(data.pages[1]!.outgoing![0]!.replyTo).toMatchObject({ content: 'Câu 4 đổi cận' })
    })

    it('keeps a newer edit when an older one arrives late', () => {
        const newer = { ...saved('m1'), content: 'Bản sau', editedAt: '2026-10-18T13:06:00.000Z' }
        const older = { ...saved('m1'), content: 'Bản trước', editedAt: '2026-10-18T13:05:00.000Z' }

        const data = replaceSaved(replaceSaved(history({ ids: ['m1'] }), newer), older)

        expect(data.pages[0]!.items[0]!.content).toBe('Bản sau')
    })

    it('brings back no quote of a message deleted before its edit arrived', () => {
        const edited = { ...saved('m1'), content: 'Sửa muộn', editedAt: '2026-10-18T13:05:00.000Z' }

        const data = replaceSaved(removeSaved(withReplies(), 'm1'), edited)

        expect(data.pages[1]!.items[0]!.replyTo).toMatchObject({ deleted: true, content: '' })
    })

    it('ignores an edit of a message it does not hold', () => {
        const data = history({ ids: ['m1'] })
        expect(replaceSaved(data, saved('m9'))).toBe(data)
    })

    it('drops a deleted message; the replies to it say it was deleted', () => {
        const data = removeSaved(withReplies(), 'm1')

        expect(ids(data)).toEqual(['m2'])
        const deleted = { id: 'm1', author: null, content: '', deleted: true }
        expect(data.pages[1]!.items[0]!.replyTo).toEqual(deleted)
        expect(data.pages[1]!.outgoing![0]!.replyTo).toEqual(deleted)
    })

    it('leaves a history that never held the deleted message as it was', () => {
        const data = history({ ids: ['m1'] })
        expect(removeSaved(data, 'm9')).toBe(data)
    })
})
