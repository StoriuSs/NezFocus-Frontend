import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { userKeys } from '@/features/users'
import { useMidnightReload } from '../api/useMyTasks'
import { countsByServer, myRows } from '../lib/my-tasks'
import type { Hold } from '../lib/task-board'
import type { MyTask } from '../types'

const task = (id: string, overrides: Partial<MyTask> = {}): MyTask => ({
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
    group: 'no_due',
    ...overrides
})
const ids = (rows: { task: { id: string } }[]) => rows.map((row) => row.task.id)

describe('the To-do page groups (S-TASK-04, D-186, R5)', () => {
    const late = task('a', { group: 'overdue', dueAt: '2026-10-16T16:59:00.000Z' })
    const today1 = task('b', {
        group: 'today',
        dueAt: '2026-10-18T16:59:00.000Z',
        createdAt: '2026-10-16T00:00:00.000Z'
    })
    const today2 = task('c', {
        group: 'today',
        dueAt: '2026-10-18T16:59:00.000Z',
        createdAt: '2026-10-17T00:00:00.000Z'
    })
    const none = task('d', { serverId: 't' })

    it('puts each task in the group the server gave it, the same due date by the one made first', () => {
        const rows = myRows([none, today2, late, today1], [], 2, new Map())
        expect(ids(rows.groups.overdue)).toEqual(['a'])
        expect(ids(rows.groups.today)).toEqual(['b', 'c'])
        expect(ids(rows.groups.no_due)).toEqual(['d'])
        expect(rows.groups.next_7_days).toEqual([])
        expect(rows).toMatchObject({ doneCount: 2, openCount: 4 })
    })

    it('keeps a row marked done where it stood, the count of done with it, until its Toast goes', () => {
        const hold: Hold = { group: 'todo', status: 'done', task: today1 }
        const done = { ...today1, status: 'done' as const, group: null, completedAt: '2026-10-18T13:00:00.000Z' }
        // The server already moved it: out of the list, one more done, and on the first done page.
        const rows = myRows([late, today2], [done], 3, new Map([['b', hold]]))
        expect(ids(rows.groups.today)).toEqual(['b', 'c'])
        expect(rows.groups.today[0]!.status).toBe('done')
        expect(ids(rows.done)).toEqual([])
        expect(rows.doneCount).toBe(2)
        expect(myRows([late, today2], [done], 3, new Map()).doneCount).toBe(3)
    })

    it('keeps a row opened again in ĐÃ XONG until its Toast goes', () => {
        const done = { ...late, status: 'done' as const, group: null, completedAt: '2026-10-15T14:40:00.000Z' }
        const hold: Hold = { group: 'done', status: 'todo', task: done }
        const rows = myRows([late], [], 0, new Map([['a', hold]]))
        expect(ids(rows.done)).toEqual(['a'])
        expect(rows.groups.overdue).toEqual([])
        expect(rows.doneCount).toBe(1)
    })

    it('counts the tasks not done of each server and of all', () => {
        const counts = countsByServer([late, today1, none])
        expect(counts.all).toBe(3)
        expect([...counts.byServer]).toEqual([
            ['s', 2],
            ['t', 1]
        ])
    })
})

describe('reading the To-do lists again at midnight (D-196)', () => {
    afterEach(() => vi.useRealTimers())

    it('reads them again once the day changes in the account’s zone, not before', () => {
        vi.useFakeTimers()
        // 23:58:30 on 18/10 in Hồ Chí Minh: still 16:58 UTC.
        vi.setSystemTime(new Date('2026-10-18T16:58:30.000Z'))
        const client = new QueryClient()
        client.setQueryData(userKeys.settings(), { timezone: 'Asia/Ho_Chi_Minh' })
        const invalidate = vi.spyOn(client, 'invalidateQueries')
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
        )
        renderHook(() => useMidnightReload(), { wrapper })

        act(() => void vi.advanceTimersByTime(60_000))
        expect(invalidate).not.toHaveBeenCalled()
        // 00:00:00 here: the API's clock may still be a moment behind, in yesterday.
        act(() => void vi.advanceTimersByTime(60_000))
        expect(invalidate).not.toHaveBeenCalled()
        act(() => void vi.advanceTimersByTime(30_000))
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'mine'] })
    })

    it('does not read them again when the account’s zone first arrives, only when it changes', () => {
        vi.useFakeTimers()
        const client = new QueryClient()
        const invalidate = vi.spyOn(client, 'invalidateQueries')
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
        )
        const { rerender } = renderHook(() => useMidnightReload(), { wrapper })
        act(() => void client.setQueryData(userKeys.settings(), { timezone: 'Asia/Ho_Chi_Minh' }))
        rerender()
        expect(invalidate).not.toHaveBeenCalled()
        // Another zone chosen afterwards: its day may be another.
        act(() => void client.setQueryData(userKeys.settings(), { timezone: 'America/New_York' }))
        rerender()
        act(() => void vi.advanceTimersByTime(30_000))
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'mine'] })
    })
})
