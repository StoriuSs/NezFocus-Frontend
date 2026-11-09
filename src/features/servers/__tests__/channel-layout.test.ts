import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('@/lib/api', () => ({ default: api }))

import {
    createCategory,
    createChannel,
    deleteCategory,
    deleteChannel,
    moveInLayout,
    renameCategory,
    updateChannel
} from '../api/layout.api'
import {
    applyMove,
    channelSlots,
    clashingChannel,
    dropClash,
    nameProblem,
    normaliseTextChannelName,
    slotOf,
    storedName
} from '../lib/channel-layout'
import { categoryDropAfter, categorySlots, channelDropSlot } from '../lib/drop-target'
import { layoutRule } from '../lib/layout-error'
import type { Server, ServerChannel } from '../types'

const channel = (id: string, extra: Partial<ServerChannel> = {}): ServerChannel => ({
    id,
    categoryId: 'info',
    type: 'text',
    name: id,
    position: 0,
    isPrivate: false,
    sendMode: 'everyone',
    isStudyRoom: false,
    taskBoardEnabled: false,
    permissions: '0',
    viewRoleIds: null,
    ...extra
})

/** ÔT: `chung` on top; THÔNG TIN with three channels; PHÒNG HỌC with one room. */
const OT: Server = {
    id: 'ot',
    name: 'ÔT',
    iconUrl: null,
    isOwner: true,
    permissions: '0',
    topRolePosition: 0,
    roleIds: [],
    roles: [],
    timeoutUntil: null,
    welcomeChannelId: null,
    categories: [
        { id: 'rooms', name: 'Phòng học', position: 1 },
        { id: 'info', name: 'Thông tin', position: 0 }
    ],
    channels: [
        channel('chung', { categoryId: null }),
        channel('tai-lieu', { position: 1 }),
        channel('chao-mung', { position: 0 }),
        channel('hoi-dap', { position: 2 }),
        channel('phong', { categoryId: 'rooms', type: 'voice', name: 'Phòng ôn' })
    ]
}

const order = (server: Server, categoryId: string | null) =>
    server.channels
        .filter((c) => c.categoryId === categoryId)
        .sort((a, b) => a.position - b.position)
        .map((c) => c.id)

describe('channel names on the client (REQ-SRV-02)', () => {
    it('normalises a text channel as the API stores it', () => {
        expect(normaliseTextChannelName('Hỏi Đáp Chung')).toBe('hỏi-đáp-chung')
        expect(normaliseTextChannelName(' Q&A / ôn  tập! ')).toBe('qa-ôn-tập')
        expect(storedName('voice', '  Phòng ôn ')).toBe('Phòng ôn')
    })

    it('says why a name cannot be used', () => {
        expect(nameProblem('text', '???')).toBe('length')
        expect(nameProblem('text', '__')).toBe('noLetterOrDigit')
        expect(nameProblem('voice', '​')).toBe('length')
        expect(nameProblem('category', 'x'.repeat(101))).toBe('length')
        expect(nameProblem('text', 'Tài liệu')).toBeNull()
    })

    it('finds a clash in the group, of the same kind, in any case but not other accents (D-84)', () => {
        expect(clashingChannel(OT, 'info', 'text', 'Tai-Lieu')?.id).toBe('tai-lieu')
        expect(clashingChannel(OT, 'info', 'text', 'tài-liệu')).toBeUndefined()
        expect(clashingChannel(OT, 'info', 'text', 'tai-lieu', 'tai-lieu')).toBeUndefined()
        expect(clashingChannel(OT, 'rooms', 'text', 'phòng ôn')).toBeUndefined()
    })
})

describe('drop places (S-SRV-06)', () => {
    const hoiDap = OT.channels.find((c) => c.id === 'hoi-dap')!

    it('lists every place in list order, the dragged channel left out', () => {
        expect(channelSlots(OT, 'hoi-dap')).toEqual([
            { categoryId: null, afterId: null },
            { categoryId: null, afterId: 'chung' },
            { categoryId: 'info', afterId: null },
            { categoryId: 'info', afterId: 'chao-mung' },
            { categoryId: 'info', afterId: 'tai-lieu' },
            { categoryId: 'rooms', afterId: null },
            { categoryId: 'rooms', afterId: 'phong' }
        ])
        expect(slotOf(OT, hoiDap)).toEqual({ categoryId: 'info', afterId: 'tai-lieu' })
    })

    it('refuses a clash in another group only', () => {
        const clash = { ...OT, channels: [...OT.channels, channel('x', { categoryId: 'rooms', name: 'hoi-dap' })] }
        expect(dropClash(clash, hoiDap, { categoryId: 'rooms', afterId: null })?.id).toBe('x')
        expect(dropClash(clash, hoiDap, { categoryId: 'info', afterId: null })).toBeUndefined()
    })

    it('reads the place under the pointer: a channel row, a heading, the top', () => {
        expect(channelDropSlot(OT, 'hoi-dap', 'ch:chao-mung', true)).toEqual({
            categoryId: 'info',
            afterId: 'chao-mung'
        })
        expect(channelDropSlot(OT, 'hoi-dap', 'ch:chao-mung', false)).toEqual({ categoryId: 'info', afterId: null })
        expect(channelDropSlot(OT, 'hoi-dap', 'ch:tai-lieu', false)).toEqual({
            categoryId: 'info',
            afterId: 'chao-mung'
        })
        expect(channelDropSlot(OT, 'hoi-dap', 'ch:hoi-dap', true)).toEqual({ categoryId: 'info', afterId: 'tai-lieu' })
        expect(channelDropSlot(OT, 'chao-mung', 'ch:chao-mung', false)).toEqual({ categoryId: 'info', afterId: null })
        // A heading's lower half: the end of it; upper half: the end of the group above.
        expect(channelDropSlot(OT, 'hoi-dap', 'cat:rooms', true)).toEqual({ categoryId: 'rooms', afterId: 'phong' })
        expect(channelDropSlot(OT, 'hoi-dap', 'cat:rooms', false)).toEqual({ categoryId: 'info', afterId: 'tai-lieu' })
        expect(channelDropSlot(OT, 'hoi-dap', 'cat:info', false)).toEqual({ categoryId: null, afterId: 'chung' })
        expect(channelDropSlot(OT, 'hoi-dap', 'top', false)).toEqual({ categoryId: null, afterId: null })
        expect(channelDropSlot(OT, 'hoi-dap', 'cat:gone', true)).toBeNull()
        expect(channelDropSlot(OT, 'hoi-dap', 'ch:gone', true)).toBeNull()
    })

    it('places a category before or after another heading', () => {
        expect(categoryDropAfter(OT, 'rooms', 'cat:info', false)).toEqual({ afterId: null })
        expect(categoryDropAfter(OT, 'info', 'cat:rooms', true)).toEqual({ afterId: 'rooms' })
        expect(categoryDropAfter(OT, 'rooms', 'cat:rooms', true)).toEqual({ afterId: 'info' })
        expect(categoryDropAfter(OT, 'info', 'cat:info', true)).toEqual({ afterId: null })
        expect(categoryDropAfter(OT, 'rooms', 'ch:chung', true)).toBeNull()
        expect(categoryDropAfter(OT, 'rooms', 'cat:gone', true)).toBeNull()
        expect(categorySlots(OT, 'rooms')).toEqual([null, 'info'])
    })
})

describe('the list right after a drop', () => {
    it('moves a channel within its group or into another, numbering them again', () => {
        const within = applyMove(OT, { kind: 'channel', id: 'hoi-dap', categoryId: 'info', afterId: null })
        expect(order(within, 'info')).toEqual(['hoi-dap', 'chao-mung', 'tai-lieu'])
        const into = applyMove(OT, { kind: 'channel', id: 'chao-mung', categoryId: 'rooms', afterId: 'phong' })
        expect(order(into, 'rooms')).toEqual(['phong', 'chao-mung'])
        expect(order(into, 'info')).toEqual(['tai-lieu', 'hoi-dap'])
    })

    it('moves a category, and leaves the list as it was for an id it does not know', () => {
        const moved = applyMove(OT, { kind: 'category', id: 'rooms', afterId: null })
        expect([...moved.categories].sort((a, b) => a.position - b.position).map((c) => c.id)).toEqual([
            'rooms',
            'info'
        ])
        expect(applyMove(OT, { kind: 'category', id: 'gone', afterId: null })).toBe(OT)
        expect(applyMove(OT, { kind: 'channel', id: 'gone', categoryId: null, afterId: null })).toBe(OT)
    })
})

describe('channel list API', () => {
    beforeEach(() => {
        Object.values(api).forEach((fn) => fn.mockReset())
        Object.values(api).forEach((fn) => fn.mockResolvedValue({ data: { data: { id: 'new', server: OT } } }))
    })

    it('calls each route with its body and intent key', async () => {
        await createCategory('ot', 'Ôn tập', 'k1')
        expect(api.post).toHaveBeenCalledWith(
            '/servers/ot/categories',
            { name: 'Ôn tập' },
            { headers: { 'Idempotency-Key': 'k1' } }
        )
        await createChannel('ot', { type: 'text', name: 'x' }, 'k2')
        expect(api.post).toHaveBeenLastCalledWith(
            '/servers/ot/channels',
            { type: 'text', name: 'x' },
            { headers: { 'Idempotency-Key': 'k2' } }
        )
        await renameCategory('ot', 'info', 'Tin')
        expect(api.patch).toHaveBeenCalledWith('/servers/ot/categories/info', { name: 'Tin' })
        await updateChannel('ot', 'c1', { sendMode: 'managers' })
        expect(api.patch).toHaveBeenLastCalledWith('/servers/ot/channels/c1', { sendMode: 'managers' })
        const move = { kind: 'channel', id: 'c1', categoryId: null, afterId: null } as const
        await moveInLayout('ot', move)
        expect(api.patch).toHaveBeenLastCalledWith('/servers/ot/channels/order', move)
        await deleteCategory('ot', 'info')
        expect(api.delete).toHaveBeenCalledWith('/servers/ot/categories/info')
        await deleteChannel('ot', 'c1')
        expect(api.delete).toHaveBeenLastCalledWith('/servers/ot/channels/c1')
    })
})

describe('reading a refused change', () => {
    const refused = (data: object) =>
        new AxiosError('422', '422', undefined, undefined, {
            status: 422,
            statusText: '',
            headers: {},
            config: { headers: new AxiosHeaders() },
            data: { meta: { type: 'VALIDATION_ERROR', code: '422000' }, data }
        })

    it('gives the rule and the clashing names', () => {
        expect(layoutRule(refused({ rule: 'name_taken', names: ['hoi-dap', 3] }))).toEqual({
            rule: 'name_taken',
            names: ['hoi-dap']
        })
        expect(layoutRule(refused({ rule: 'limit' }))).toEqual({ rule: 'limit', names: [] })
        expect(layoutRule(refused({}))).toBeNull()
        expect(layoutRule(new Error('x'))).toBeNull()
    })
})
