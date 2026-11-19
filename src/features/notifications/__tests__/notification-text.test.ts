import { Volume2 } from 'lucide-react'
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
    messagePath: (serverId, channelId, messageId) => `/channels/${serverId}/${channelId}/${messageId}`,
    inServer: () => true,
    serverPath: (serverId) => `/channels/${serverId}`,
    settingsPath: (serverId) => `/servers/${serverId}/settings`
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
    server: null,
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

/** A server item: its name and what was done, as they were when it was made (06 › Chữ của mục). */
const serverItem = (
    server: Partial<NonNullable<Notification['server']>>,
    more: Partial<Notification> = {}
): Notification =>
    item({
        type: 'moderation',
        serverId: 'cg',
        channelId: null,
        messageId: null,
        reason: null,
        message: null,
        actor: null,
        server: { name: 'CLB Guitar PTIT', action: 'kick', timeoutUntil: null, reason: null, ...server },
        // 20:00 on 13/10/2026 in Hồ Chí Minh.
        createdAt: '2026-10-13T13:00:00.000Z',
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

    it('says who handed you a server, its name then the source (06 › owner_transferred)', () => {
        expect(
            text(
                serverItem(
                    { name: 'Nhóm đồ án Mobile', action: null },
                    { type: 'owner_transferred', serverId: 'nd', actor: MINH }
                )
            )
        ).toEqual({
            title: 'Minh đã chuyển quyền chủ server Nhóm đồ án Mobile cho bạn',
            content: null,
            source: 'Nhóm đồ án Mobile',
            place: null
        })
    })

    it('says a timeout, until when (the date when another day), and why (06 › moderation · tạm khóa)', () => {
        const timedOut = (until: string, reason: string | null) =>
            text(serverItem({ action: 'timeout', timeoutUntil: until, reason }))
        expect(timedOut('2026-10-13T14:10:00.000Z', 'Gửi tin liên tục')).toEqual({
            title: 'Bạn bị tạm khóa ở CLB Guitar PTIT tới 21:10',
            content: 'Chưa gửi tin hay vào phòng được. Lý do: Gửi tin liên tục',
            source: 'CLB Guitar PTIT',
            place: null
        })
        expect(text(serverItem({ action: 'timeout' })).title).toBe('Bạn bị tạm khóa ở CLB Guitar PTIT')
        expect(timedOut('2026-10-19T01:00:00.000Z', null)).toMatchObject({
            title: 'Bạn bị tạm khóa ở CLB Guitar PTIT tới 19/10 · 08:00',
            content: 'Chưa gửi tin hay vào phòng được.'
        })
    })

    it('says a kick or a ban, why, and what follows, with no source (06 › moderation, 11 S-MOD-02)', () => {
        expect(text(serverItem({ action: 'kick', reason: 'Nhắn ngoài chủ đề nhiều lần' }))).toEqual({
            title: 'Bạn đã bị mời ra khỏi CLB Guitar PTIT',
            content: 'Lý do: Nhắn ngoài chủ đề nhiều lần. Bạn có thể quay lại khi có lời mời mới.',
            source: null,
            place: null
        })
        // A reason that ends its own sentence gets no second stop.
        expect(text(serverItem({ action: 'ban', reason: 'Bán đề thi có đáp án!' })).content).toBe(
            'Lý do: Bán đề thi có đáp án! Bạn không thể tham gia lại server này.'
        )
        expect(text(serverItem({ action: 'ban' }))).toMatchObject({
            title: 'Bạn đã bị cấm khỏi CLB Guitar PTIT',
            content: 'Bạn không thể tham gia lại server này.'
        })
    })

    it('names a voice room’s chat with no "#" (S-ROOM-08)', () => {
        const room = { serverName: 'Nhóm đồ án Mobile', channelName: 'Phòng học im lặng', icon: Volume2 }
        const said = notificationText(item({ channelId: 'phong-hoc' }), {
            t: i18n.getFixedT('vi', 'notifications'),
            words: WORDS,
            places: { ...PLACES, placeOf: () => room },
            now: NOW,
            timeZone: 'Asia/Ho_Chi_Minh'
        })
        expect(said).toMatchObject({ source: 'Phòng học im lặng · Nhóm đồ án Mobile', place: room })
    })

    it('has no source while the servers load, or for a channel no longer viewed', () => {
        expect(text(item({ serverId: 'ot' })).source).toBeNull()
        expect(text(item({ channelId: 'bi-mat' })).source).toBeNull()
    })
})
