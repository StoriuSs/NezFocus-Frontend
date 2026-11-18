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
    taskId: null,
    task: null,
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
/** 21:47 on Saturday 17/10/2026 in Hồ Chí Minh (06 › Luật nhất quán dữ liệu 6). */
const NOW = new Date('2026-10-17T21:47:00+07:00')
const text = (one: Notification) =>
    notificationText(one, {
        t: i18n.getFixedT('vi', 'notifications'),
        words: WORDS,
        places: PLACES,
        now: NOW,
        timeZone: 'Asia/Ho_Chi_Minh'
    })
const MINH = { id: 'minh', username: 'minh.do', displayName: 'Minh', avatarUrl: null }
const GIANG = { id: 'giang', username: 'giang.vo', displayName: 'Giang', avatarUrl: null }
const taskItem = (
    type: Notification['type'],
    task: Partial<NonNullable<Notification['task']>>,
    more: Partial<Notification> = {}
) =>
    item({
        type,
        channelId: 'hoi-dap',
        messageId: null,
        reason: null,
        message: null,
        taskId: 't1',
        task: { title: 'Chuẩn bị demo cuối kỳ', dueAt: null, reminder: null, unassignedBy: null, ...task },
        ...more
    })

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

    it('says who gave you a task, and its due date then (06 › task_assigned, D-98)', () => {
        const due = '2026-11-05T16:59:00.000Z'
        expect(text(taskItem('task_assigned', { dueAt: due }, { actor: MINH }))).toEqual({
            title: 'Minh giao cho bạn: Chuẩn bị demo cuối kỳ',
            content: 'Hạn 05/11 · 23:59',
            source: '#hoi-dap · Nhóm đồ án Mobile',
            place: { serverName: 'Nhóm đồ án Mobile', channelName: 'hoi-dap' }
        })
        expect(text(taskItem('task_assigned', {}, { actor: MINH })).content).toBe('Không hạn')
        expect(text(taskItem('task_assigned', {}, { actor: null })).title).toBe(
            'Tài khoản đã bị xóa giao cho bạn: Chuẩn bị demo cuối kỳ'
        )
    })

    it('says how long is left before a task is due, with no line under it (06 › task_reminder, 05 R3)', () => {
        const reminder = (mark: '24h' | '2h') =>
            text(taskItem('task_reminder', { title: 'Cập nhật tiến độ tuần', reminder: mark }, { actor: null }))
        expect(reminder('24h').title).toBe('Còn 24 giờ tới hạn: Cập nhật tiến độ tuần')
        expect(reminder('24h').content).toBeNull()
        expect(reminder('2h').title).toBe('Còn 2 giờ tới hạn: Cập nhật tiến độ tuần')
    })

    it('says no one is on a task any more, and why (06 › task_unassigned, D-95)', () => {
        const left = (by: 'withdrew' | 'left_server') =>
            text(taskItem('task_unassigned', { title: 'Làm slide thuyết trình', unassignedBy: by }, { actor: GIANG }))
        expect(left('withdrew').title).toBe('Không còn ai làm: Làm slide thuyết trình')
        expect(left('withdrew').content).toBe('Giang đã rút khỏi việc')
        expect(left('left_server').content).toBe('Giang đã rời server')
    })

    it('has no source while the servers load, or for a channel no longer viewed', () => {
        expect(text(item({ serverId: 'ot' })).source).toBeNull()
        expect(text(item({ channelId: 'bi-mat' })).source).toBeNull()
    })
})
