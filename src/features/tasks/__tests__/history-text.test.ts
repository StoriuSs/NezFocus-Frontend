import { beforeAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import '@/i18n/tasks'
import { historyLine, historyTime, type HistoryClock } from '../lib/history-text'
import type { TaskEvent } from '../types'

const ZONE = 'Asia/Ho_Chi_Minh'
const MINH = { id: 'minh', username: 'minh.do', displayName: 'Minh', avatarUrl: null }
const AN = { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null }
const LAN = { id: 'lan', username: 'lan.vu', displayName: 'Lan', avatarUrl: null }
/** 18/10/2026 10:00 in Hồ Chí Minh. */
const CLOCK: HistoryClock = { now: new Date('2026-10-18T03:00:00Z'), timeZone: ZONE, language: 'vi' }

const line = (kind: TaskEvent['kind'], more: Partial<TaskEvent> = {}): TaskEvent => ({
    id: 'h',
    kind,
    actor: MINH,
    subject: null,
    from: null,
    to: null,
    createdAt: '2026-10-12T13:40:00.000Z',
    ...more
})

let t: Parameters<typeof historyLine>[2]
beforeAll(async () => {
    await i18n.changeLanguage('vi')
    t = i18n.getFixedT('vi', 'tasks')
})

describe('the history in words (05 S-TASK-02 › Lịch sử, REQ-TASK-03)', () => {
    it('says who did what, "Bạn" and "bạn" for oneself', () => {
        const say = (event: TaskEvent) => historyLine(event, 'an', t, CLOCK)
        expect(say(line('created'))).toBe('Minh đã tạo việc')
        expect(say(line('created', { actor: AN }))).toBe('Bạn đã tạo việc')
        expect(say(line('title_changed', { from: 'Cũ', to: 'Mới' }))).toBe('Minh đã đổi tiêu đề “Cũ” → “Mới”')
        expect(say(line('description_changed'))).toBe('Minh đã sửa mô tả')
        expect(say(line('status_changed', { actor: AN, from: 'todo', to: 'doing' }))).toBe(
            'Bạn đã đổi trạng thái Cần làm → Đang làm'
        )
        expect(say(line('assignee_added', { subject: AN }))).toBe('Minh đã thêm bạn')
        expect(say(line('assignee_added', { subject: LAN }))).toBe('Minh đã thêm Lan')
        expect(say(line('assignee_removed', { subject: LAN }))).toBe('Minh đã gỡ Lan')
    })

    it('says taking oneself on or off as such, and a person who left the server by no one (D-195)', () => {
        const say = (event: TaskEvent) => historyLine(event, 'an', t, CLOCK)
        expect(say(line('assignee_added', { actor: LAN, subject: LAN }))).toBe('Lan đã tự nhận việc')
        expect(say(line('assignee_removed', { actor: AN, subject: AN }))).toBe('Bạn đã rút khỏi việc')
        expect(say(line('assignee_removed', { actor: null, subject: LAN }))).toBe(
            'Lan rời server nên không còn được giao'
        )
    })

    it('writes due dates with their time, the year only when not this one (05 R2)', () => {
        const say = (event: TaskEvent) => historyLine(event, 'an', t, CLOCK)
        expect(say(line('due_changed', { to: '2026-10-20T16:59:00.000Z' }))).toBe('Minh đã đặt hạn 20/10 · 23:59')
        expect(say(line('due_changed', { from: '2026-10-20T16:59:00.000Z', to: '2027-01-05T16:59:00.000Z' }))).toBe(
            'Minh đã đổi hạn 20/10 · 23:59 → 05/01/2027 · 23:59'
        )
        expect(say(line('due_changed', { from: '2026-10-20T16:59:00.000Z' }))).toBe('Minh đã bỏ hạn')
    })

    it('writes when: the time today, "Hôm qua" and the time, else the date (05 Q3)', () => {
        expect(historyTime(new Date('2026-10-18T01:05:00Z'), CLOCK, 'Hôm qua')).toBe('08:05')
        expect(historyTime(new Date('2026-10-17T14:40:00Z'), CLOCK, 'Hôm qua')).toBe('Hôm qua 21:40')
        expect(historyTime(new Date('2026-10-16T02:10:00Z'), CLOCK, 'Hôm qua')).toBe('16/10 09:10')
        expect(historyTime(new Date('2025-10-16T02:10:00Z'), CLOCK, 'Hôm qua')).toBe('16/10/2025 09:10')
    })
})
