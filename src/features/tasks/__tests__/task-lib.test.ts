import { describe, expect, it } from 'vitest'
import { apiError } from '@/test/helpers'
import { addMonths, monthWeeks, nextFriday, readTime, stepTime } from '../lib/calendar'
import { dueLine, type DayWords } from '../lib/due-text'
import { boardRows, byDue, type Hold } from '../lib/task-board'
import { dropDone, dropOpen, putDone, putOpen, type DonePages } from '../lib/task-cache'
import { shortTitle } from '../lib/task-toasts'
import { taskFailure } from '../lib/task-errors'
import type { Task, TaskList } from '../types'

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
    id,
    serverId: 's',
    channelId: 'c',
    title: `Việc ${id}`,
    description: '',
    status: 'todo',
    dueAt: null,
    completedAt: null,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    creator: { id: 'an', username: 'an', displayName: 'An', avatarUrl: null, leftServer: false },
    assignees: [],
    ...overrides
})

const WORDS: DayWords = {
    today: 'Hôm nay',
    tomorrow: 'Ngày mai',
    weekdays: ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'],
    overdue: 'Quá hạn',
    done: 'Xong',
    noDue: 'Không hạn'
}
// Sunday 18/10/2026, 21:47 in Hồ Chí Minh (05 › world A).
const NOW = new Date('2026-10-18T14:47:00.000Z')
const ZONE = 'Asia/Ho_Chi_Minh'
const at = (local: string) => new Date(`${local}+07:00`)
const line = (fields: Partial<Task>) =>
    dueLine({ status: 'todo', dueAt: null, completedAt: null, ...fields }, NOW, ZONE, 'vi', WORDS)

describe('the due line (05 › Quy ước › Thời gian, C-28)', () => {
    it('says today, tomorrow, a weekday within the week, the date further, the year only when not this one', () => {
        expect(line({ dueAt: at('2026-10-18T23:59:00').toISOString() })).toEqual({
            kind: 'due',
            text: 'Hôm nay · 23:59'
        })
        expect(line({ dueAt: at('2026-10-19T08:00:00').toISOString() }).text).toBe('Ngày mai · 08:00')
        expect(line({ dueAt: at('2026-10-23T23:59:00').toISOString() }).text).toBe('Thứ 6, 23/10 · 23:59')
        expect(line({ dueAt: at('2026-10-24T23:59:00').toISOString() }).text).toBe('Thứ 7, 24/10 · 23:59')
        expect(line({ dueAt: at('2026-10-25T23:59:00').toISOString() }).text).toBe('25/10 · 23:59')
        expect(line({ dueAt: at('2026-11-05T23:59:00').toISOString() }).text).toBe('05/11 · 23:59')
        expect(line({ dueAt: at('2027-01-05T23:59:00').toISOString() }).text).toBe('05/01/2027 · 23:59')
    })

    it('says overdue past it, today too, and nothing about a due date once done (R8)', () => {
        expect(line({ dueAt: at('2026-10-16T23:59:00').toISOString() })).toEqual({
            kind: 'overdue',
            text: 'Quá hạn · 16/10 · 23:59'
        })
        expect(line({ dueAt: at('2026-10-18T21:00:00').toISOString() }).text).toBe('Quá hạn · Hôm nay · 21:00')
        expect(
            line({
                status: 'done',
                dueAt: at('2026-10-16T23:59:00').toISOString(),
                completedAt: at('2026-10-18T20:30:00').toISOString()
            })
        ).toEqual({ kind: 'done', text: 'Xong · Hôm nay · 20:30' })
        expect(line({})).toEqual({ kind: 'none', text: 'Không hạn' })
    })

    it('reads the days in the account zone, not the browser’s', () => {
        // 23:30 in New York on the 17th is the 18th in Hồ Chí Minh.
        const due = new Date('2026-10-18T03:30:00.000Z').toISOString()
        expect(
            dueLine({ status: 'todo', dueAt: due, completedAt: null }, NOW, 'America/New_York', 'vi', WORDS).text
        ).toBe('Quá hạn · 17/10 · 23:30')
        expect(line({ dueAt: due }).text).toBe('Quá hạn · Hôm nay · 10:30')
    })
})

describe('the board groups (05 Q4, R5)', () => {
    it('sorts by due, none last, the same due by who was made first', () => {
        const sorted = [
            task('d', { dueAt: null }),
            task('b', { dueAt: '2026-10-20T00:00:00.000Z', createdAt: '2026-10-12T00:00:00.000Z' }),
            task('a', { dueAt: '2026-10-20T00:00:00.000Z', createdAt: '2026-10-11T00:00:00.000Z' }),
            task('c', { dueAt: '2026-10-19T00:00:00.000Z' })
        ].sort(byDue)
        expect(sorted.map((one) => one.id)).toEqual(['c', 'a', 'b', 'd'])
    })

    it('keeps a row just marked where it was, its box showing the new status, the counts unmoved', () => {
        const marked = task('a', { status: 'done', completedAt: '2026-10-18T14:00:00.000Z' })
        const holds = new Map<string, Hold>([['a', { group: 'todo', status: 'done', task: task('a') }]])
        // The answer came: the cache has it done, one more done.
        const { todo } = boardRows([task('b')], [], 4, holds)
        expect(todo.map((row) => [row.task.id, row.status])).toEqual([
            ['a', 'done'],
            ['b', 'todo']
        ])
        expect(boardRows([task('b')], [marked], 4, holds).doneCount).toBe(3)
        // Let go: it moves.
        const after = boardRows([task('b')], [marked], 4, new Map())
        const { todo: left } = after
        expect(left.map((row) => row.task.id)).toEqual(['b'])
        expect(after.done.map((row) => row.task.id)).toEqual(['a'])
        expect(after.doneCount).toBe(4)
    })
})

describe('the cache of a board (D-191)', () => {
    const list = (items: Task[], doneCount = 2): TaskList => ({ items, doneCount, hasMore: false })
    const pages = (items: Task[]): DonePages => ({
        pages: [{ items, doneCount: null, hasMore: false }],
        pageParams: [null]
    })

    it('adds a new task, swaps a newer copy in, keeps a newer one held', () => {
        const held = task('a', { updatedAt: '2026-10-18T10:00:00.000Z', title: 'mới' })
        expect(putOpen(list([]), task('a'), false).items).toHaveLength(1)
        expect(putOpen(list([task('a')]), held, false).items[0]!.title).toBe('mới')
        expect(putOpen(list([held]), task('a', { title: 'cũ' }), false).items[0]!.title).toBe('mới')
    })

    it('moves a task done out of the open list and on top of the done pages, and back when reopened', () => {
        const done = task('a', {
            status: 'done',
            completedAt: '2026-10-18T10:00:00.000Z',
            updatedAt: '2026-10-18T10:00:00.000Z'
        })
        expect(putOpen(list([task('a'), task('b')]), done, false)).toMatchObject({ doneCount: 3 })
        expect(putDone(pages([task('z', { status: 'done' })]), done).pages[0]!.items.map((one) => one.id)).toEqual([
            'a',
            'z'
        ])
        const reopened = task('a', { updatedAt: '2026-10-18T11:00:00.000Z' })
        expect(putOpen(list([task('b')]), reopened, true)).toMatchObject({ doneCount: 1 })
        expect(putDone(pages([done]), reopened).pages[0]!.items).toEqual([])
    })

    it('drops a deleted task, saying when the open list did not hold it', () => {
        expect(dropOpen(list([task('a')]), 'a')!.items).toEqual([])
        expect(dropOpen(list([task('a')]), 'x')).toBeNull()
        expect(dropDone(pages([task('a', { status: 'done' })]), 'a').pages[0]!.items).toEqual([])
    })
})

describe('the date picker (C-43)', () => {
    it('lays a month out Monday first, whole weeks', () => {
        const weeks = monthWeeks(2026, 10)
        expect(weeks[0]![0]).toEqual({ year: 2026, month: 9, day: 28 })
        expect(weeks.at(-1)!.at(-1)).toEqual({ year: 2026, month: 11, day: 1 })
        expect(weeks).toHaveLength(5)
    })

    it('finds next Friday, a week on when today is one', () => {
        expect(nextFriday({ year: 2026, month: 10, day: 18 })).toEqual({ year: 2026, month: 10, day: 23 })
        expect(nextFriday({ year: 2026, month: 10, day: 23 })).toEqual({ year: 2026, month: 10, day: 30 })
    })

    it('reads 23:59 and 2359, refuses the rest, steps 15 minutes round the clock', () => {
        expect(readTime('23:59')).toEqual({ hour: 23, minute: 59 })
        expect(readTime('0830')).toEqual({ hour: 8, minute: 30 })
        expect(readTime('24:00')).toBeNull()
        expect(readTime('9h')).toBeNull()
        expect(stepTime({ hour: 23, minute: 50 }, 1)).toEqual({ hour: 0, minute: 5 })
        expect(stepTime({ hour: 0, minute: 0 }, -1)).toEqual({ hour: 23, minute: 45 })
        expect(addMonths({ year: 2026, month: 1, day: 31 }, 1)).toEqual({ year: 2026, month: 2, day: 28 })
    })
})

describe('words around a task', () => {
    it('cuts a title in a Toast at 24 characters (C-16)', () => {
        expect(shortTitle('Ôn chương 4 — tích phân bội')).toBe('Ôn chương 4 — tích phân…')
        expect(shortTitle('Ngắn')).toBe('Ngắn')
    })

    it('tells the refusals the form names apart', () => {
        const refused = (type: string, data?: unknown) => apiError(400, type, { data })
        expect(taskFailure(refused('INVALID_TASK_ASSIGNEE', { userIds: ['lan'] }))).toEqual({
            kind: 'assignees',
            userIds: ['lan']
        })
        expect(taskFailure(refused('FORBIDDEN_ERROR', { reason: 'task_board_disabled' }))).toEqual({
            kind: 'board-off'
        })
        expect(taskFailure(refused('FORBIDDEN_ERROR'))).toEqual({ kind: 'forbidden' })
        expect(taskFailure(refused('MAX_OPEN_TASKS_REACHED'))).toEqual({ kind: 'full' })
    })
})
