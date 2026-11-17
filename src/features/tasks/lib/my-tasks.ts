import type { DueGroup, MyTask, Task } from '../types'
import { byDone, byDue, type BoardRow, type Hold } from './task-board'

/** The To-do page's groups, in order (S-TASK-04): Quá hạn, Hôm nay, 7 ngày tới, Sau đó, Không hạn. */
export const DUE_GROUPS: readonly DueGroup[] = ['overdue', 'today', 'next_7_days', 'later', 'no_due']

export interface MyRows {
    /** Each group's rows; a group with none is not shown. */
    groups: Record<DueGroup, BoardRow[]>
    /** ĐÃ XONG, the latest done on top. */
    done: BoardRow[]
    /** "ĐÃ XONG — n": the done ones the server counts, rows standing elsewhere set back where they stand. */
    doneCount: number
    /** How many rows are not in ĐÃ XONG. */
    openCount: number
}

/** The group a task not done was given by the server; one the page did not read it with has none. */
const groupOf = (task: Task | undefined): DueGroup | undefined => (task as MyTask | undefined)?.group ?? undefined

/**
 * The To-do page's groups from what the cache holds (D-186): the tasks not
 * done in the groups the server gave them, the done ones read so far, and
 * the rows standing still while their Toast shows (R5). A row stands in the
 * group it was clicked in, sorted by the task as it was then, showing the
 * task as it is now; the server's count of done ones moves with it only once
 * it goes.
 */
export function myRows(
    open: readonly MyTask[],
    done: readonly Task[],
    doneCount: number,
    holds: ReadonlyMap<string, Hold>
): MyRows {
    const latest = new Map<string, Task>()
    for (const task of [...done, ...open]) latest.set(task.id, task)
    const openById = new Map(open.map((task) => [task.id, task]))
    const placed: Array<{ group: DueGroup | 'done'; row: BoardRow; key: Task }> = []
    let count = doneCount
    for (const [id, hold] of holds) {
        const task = latest.get(id) ?? hold.task
        const group = hold.group === 'done' ? 'done' : (groupOf(hold.task) ?? groupOf(openById.get(id)) ?? 'no_due')
        placed.push({ group, row: { task, status: hold.status }, key: hold.task })
        if (group === 'done' && openById.has(id)) count += 1
        if (group !== 'done' && !openById.has(id)) count -= 1
    }
    for (const task of latest.values()) {
        if (holds.has(task.id)) continue
        const group = task.status === 'done' ? 'done' : (groupOf(task) ?? 'no_due')
        placed.push({ group, row: { task, status: task.status }, key: task })
    }
    const rowsIn = (group: DueGroup | 'done') =>
        placed
            .filter((entry) => entry.group === group)
            .sort((a, b) => (group === 'done' ? byDone : byDue)(a.key, b.key))
            .map((entry) => entry.row)
    const groups = Object.fromEntries(DUE_GROUPS.map((group) => [group, rowsIn(group)])) as Record<DueGroup, BoardRow[]>
    return {
        groups,
        done: rowsIn('done'),
        doneCount: Math.max(0, count),
        openCount: DUE_GROUPS.reduce((sum, group) => sum + groups[group].length, 0)
    }
}

/**
 * How many tasks not done each server has, and all of them (the column's
 * numbers, S-TASK-04), from the list of every server.
 */
export function countsByServer(open: readonly Task[]): { all: number; byServer: ReadonlyMap<string, number> } {
    const byServer = new Map<string, number>()
    for (const task of open) byServer.set(task.serverId, (byServer.get(task.serverId) ?? 0) + 1)
    return { all: open.length, byServer }
}
