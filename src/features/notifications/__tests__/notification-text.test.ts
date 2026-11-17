import { beforeAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import '@/i18n/notifications'
import type { MentionWords } from '@/features/messaging'
import { notificationText } from '../lib/notification-text'
import type { InboxPlaces, Notification } from '../types'

const AN_ID = '0193a000-0000-7000-8000-0000000000a1'
const TAI_LIEU = '0193a000-0000-7000-8000-0000000000c1'
const BI_MAT = '0193a000-0000-7000-8000-0000000000c2'
const WORDS: MentionWords = {
    deletedAccount: '@Tài khoản đã bị xóa',
    unknownUser: '@người dùng không rõ',
    unknownRole: '@vai trò không rõ',
    hiddenChannel: '#không xem được'
}
const PLACES: InboxPlaces = {
    placeOf: (serverId, channelId) =>
        serverId === 'nd' && channelId === 'hoi-dap'
            ? { serverName: 'Nhóm đồ án Mobile', channelName: 'hoi-dap' }
            : serverId === 'nd'
              ? null
              : undefined,
    mentionChannel: (channelId) =>
        channelId === TAI_LIEU ? { kind: 'channel', to: '/x', name: 'tai-lieu' } : { kind: 'hidden' },
    messagePath: (serverId, channelId, messageId) => `/channels/${serverId}/${channelId}/${messageId}`
}

const LAN = { id: 'lan', username: 'lan.pham', displayName: 'Lan', avatarUrl: null }
const item = (more: Partial<Notification> = {}): Notification => ({
    id: 'n1',
    type: 'mention',
    serverId: 'nd',
    channelId: 'hoi-dap',
    messageId: 'm1',
    roleId: null,
    reason: 'user',
    actor: LAN,
    message: {
        id: 'm1',
        content: `<@${AN_ID}> mai bạn mang **laptop** giúp nhóm nhé`,
        mentionUsers: [{ id: AN_ID, username: 'an.nguyen', displayName: 'An' }],
        mentionRoles: [],
        files: { count: 0, images: 0 }
    },
    readAt: null,
    createdAt: '2026-10-17T14:30:00.000Z',
    ...more
})
const text = (one: Notification) =>
    notificationText(one, { t: i18n.getFixedT('vi', 'notifications'), words: WORDS, places: PLACES })

beforeAll(async () => {
    await i18n.changeLanguage('vi')
})

describe('notificationText', () => {
    it('says who mentioned you, what the message says now without markers, and where (06 › Nội dung chữ)', () => {
        expect(text(item())).toEqual({
            title: 'Lan nhắc tới bạn',
            content: '@An mai bạn mang laptop giúp nhóm nhé',
            source: '#hoi-dap · Nhóm đồ án Mobile',
            place: { serverName: 'Nhóm đồ án Mobile', channelName: 'hoi-dap' }
        })
    })

    it('names a wide mention by what it reached: @everyone, @here, the role', () => {
        expect(text(item({ reason: 'everyone' })).title).toBe('Lan nhắc tới @everyone')
        expect(text(item({ reason: 'here' })).title).toBe('Lan nhắc tới @here')
        const message = { ...item().message!, mentionRoles: [{ id: 'tn', name: 'Trưởng nhóm' }] }
        expect(text(item({ reason: 'role', roleId: 'tn', message })).title).toBe('Lan nhắc tới @Trưởng nhóm')
        expect(text(item({ reason: 'role', roleId: 'gone' })).title).toBe('Lan nhắc tới @vai trò không rõ')
    })

    it('says a reply', () => {
        expect(text(item({ type: 'reply', reason: null })).title).toBe('Lan trả lời bạn')
    })

    it('falls back to the username, and names a deleted account so', () => {
        expect(text(item({ actor: { ...LAN, displayName: null } })).title).toBe('lan.pham nhắc tới bạn')
        expect(text(item({ actor: null })).title).toBe('Tài khoản đã bị xóa nhắc tới bạn')
        expect(text(item({ actor: { ...LAN, displayName: null, username: null } })).title).toBe(
            'Tài khoản đã bị xóa nhắc tới bạn'
        )
    })

    it('reads channel mentions by name, on one line', () => {
        const message = { ...item().message!, content: `xem <#${TAI_LIEU}>\nvà <#${BI_MAT}>` }
        expect(text(item({ message })).content).toBe('xem #tai-lieu và #không xem được')
    })

    it('says what a message of files only sent', () => {
        const files = (count: number, images: number) => ({ ...item().message!, content: '', files: { count, images } })
        expect(text(item({ message: files(1, 1) })).content).toBe('Đã gửi một ảnh')
        expect(text(item({ message: files(2, 2) })).content).toBe('Đã gửi 2 ảnh')
        expect(text(item({ message: files(3, 1) })).content).toBe('Đã gửi 3 tệp')
        expect(text(item({ message: files(1, 0) })).content).toBe('Đã gửi một tệp')
    })

    it('has no source while the servers load, or for a channel no longer viewed', () => {
        expect(text(item({ serverId: 'ot' })).source).toBeNull()
        expect(text(item({ channelId: 'bi-mat' })).source).toBeNull()
    })
})
