import type { Task, TaskStatus } from '../types'

/**
 * A row just marked done or opened again, standing where it was while its
 * Toast shows (05 Q4, R5, C-28 `just-toggled`): `group` is where it stands,
 * `status` what its box shows, `task` the task as it was clicked (its place
 * in that group).
 */
export interface Hold {
    group: TaskStatus
    status: TaskStatus
    task: Task
}

export interface BoardRow {
    task: Task
    /** What the box shows: the status, or the one just clicked while the row stands still. */
    status: TaskStatus
}

export interface BoardRows {
    doing: BoardRow[]
    todo: BoardRow[]
    done: BoardRow[]
    /** "XONG — n": the done ones the server counts, rows standing elsewhere set back where they stand. */
    doneCount: number
}

const dueOf = (task: Task) => (task.dueAt ? Date.parse(task.dueAt) : Number.POSITIVE_INFINITY)

/** ĐANG LÀM / CẦN LÀM: due first, none last; the same due, the one made first (05 Q4). */
export function byDue(a: Task, b: Task): number {
    return (
        dueOf(a) - dueOf(b) ||
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )
}

/** XONG: the latest done on top (05 Q4, as the backend pages them). */
export function byDone(a: Task, b: Task): number {
    const at = (task: Task) => (task.completedAt ? Date.parse(task.completedAt) : 0)
    return at(b) - at(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
}

/**
 * The board's three groups from what the cache holds: the open tasks, the
 * done ones read so far, and the rows standing still. A row stands in its
 * group, sorted by the task as it was clicked, showing the task as it is now.
 */
export function boardRows(
    open: readonly Task[],
    done: readonly Task[],
    doneCount: number,
    holds: ReadonlyMap<string, Hold>
): BoardRows {
    const latest = new Map<string, Task>()
    for (const task of [...done, ...open]) latest.set(task.id, task)
    const openIds = new Set(open.map((task) => task.id))
    const placed: Array<{ group: TaskStatus; row: BoardRow; key: Task }> = []
    let count = doneCount
    for (const [id, hold] of holds) {
        const task = latest.get(id) ?? hold.task
        placed.push({ group: hold.group, row: { task, status: hold.status }, key: hold.task })
        // The server counts it where it is now: out of the open list, it is one of the done.
        if (hold.group === 'done' && openIds.has(id)) count += 1
        if (hold.group !== 'done' && !openIds.has(id)) count -= 1
    }
    for (const task of latest.values()) {
        if (holds.has(task.id)) continue
        placed.push({ group: task.status, row: { task, status: task.status }, key: task })
    }
    const group = (status: TaskStatus, order: (a: Task, b: Task) => number) =>
        placed
            .filter((entry) => entry.group === status)
            .sort((a, b) => order(a.key, b.key))
            .map((entry) => entry.row)
    return {
        doing: group('doing', byDue),
        todo: group('todo', byDue),
        done: group('done', byDone),
        doneCount: Math.max(0, count)
    }
}
