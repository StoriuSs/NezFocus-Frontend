import type { InfiniteData } from '@tanstack/react-query'
import type { Task, TaskList } from '../types'

/*
 * How a change to one task changes a Task Board held in the cache: pure, so
 * the write's answer and the socket's event (D-191: the same task) go
 * through the same steps, in any order. A copy no newer than the one held
 * (`updatedAt`) changes nothing: two events close together may come back
 * out of order.
 */

export type DonePages = InfiniteData<TaskList, string | null>

const newer = (incoming: Task, held: Task | undefined) =>
    !held || Date.parse(incoming.updatedAt) >= Date.parse(held.updatedAt)

/**
 * The open tasks of a board without a search, after `task` changed. A task
 * new to this list that is not done was just made, or opened again
 * (`reopened`: one fewer done then); one done leaves it, one more done.
 */
export function putOpen(list: TaskList, task: Task, reopened: boolean): TaskList {
    const held = list.items.find((item) => item.id === task.id)
    if (!newer(task, held)) return list
    if (task.status === 'done') {
        if (!held) return list
        return {
            ...list,
            items: list.items.filter((item) => item.id !== task.id),
            doneCount: list.doneCount === null ? null : list.doneCount + 1
        }
    }
    if (held) return { ...list, items: list.items.map((item) => (item.id === task.id ? task : item)) }
    return {
        ...list,
        items: [...list.items, task],
        doneCount: reopened && list.doneCount !== null ? Math.max(0, list.doneCount - 1) : list.doneCount
    }
}

/** The done pages of a board without a search: a task just done goes on top (latest done first). */
export function putDone(pages: DonePages, task: Task): DonePages {
    const held = pages.pages.flatMap((page) => page.items).find((item) => item.id === task.id)
    if (!newer(task, held)) return pages
    if (task.status !== 'done') return dropDone(pages, task.id)
    if (held) {
        return {
            ...pages,
            pages: pages.pages.map((page) => ({
                ...page,
                items: page.items.map((item) => (item.id === task.id ? task : item))
            }))
        }
    }
    const [first, ...rest] = pages.pages
    if (!first) return pages
    return { ...pages, pages: [{ ...first, items: [task, ...first.items] }, ...rest] }
}

/** Without that task; `null` when the open list does not hold it (it may be a done one: read again). */
export function dropOpen(list: TaskList, taskId: string): TaskList | null {
    if (!list.items.some((item) => item.id === taskId)) return null
    return { ...list, items: list.items.filter((item) => item.id !== taskId) }
}

export function dropDone(pages: DonePages, taskId: string): DonePages {
    if (!pages.pages.some((page) => page.items.some((item) => item.id === taskId))) return pages
    return {
        ...pages,
        pages: pages.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== taskId) }))
    }
}

/** Whether the done pages hold that task. */
export const holdsDone = (pages: DonePages | undefined, taskId: string) =>
    pages?.pages.some((page) => page.items.some((item) => item.id === taskId)) ?? false
