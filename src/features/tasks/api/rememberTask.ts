import type { QueryClient } from '@tanstack/react-query'
import { dropDone, dropOpen, putDone, putOpen, type DonePages } from '../lib/task-cache'
import type { Task, TaskList } from '../types'
import { taskKeys } from './keys'

/**
 * The newest copy of each task this client has heard of (its `updatedAt`),
 * a deleted one for good: a change told late, older than one already taken
 * in, or about a task deleted, is left out, whichever list holds it now.
 */
const seen = new WeakMap<QueryClient, Map<string, number>>()
const heard = (client: QueryClient) => {
    let tasks = seen.get(client)
    if (!tasks) seen.set(client, (tasks = new Map()))
    return tasks
}

/** A board still being read when a change comes: its answer may predate it, so it is read again. */
function readAgainIfReading(client: QueryClient, channelId: string) {
    for (const key of [taskKeys.open(channelId, ''), taskKeys.done(channelId, '')]) {
        if (client.getQueryState(key)?.fetchStatus === 'fetching') {
            // A first read is not cancelled by a refetch (nothing to keep meanwhile): cancel it, then read.
            void client
                .cancelQueries({ queryKey: key, exact: true })
                .then(() => client.refetchQueries({ queryKey: key, exact: true }))
        }
    }
}

/**
 * A task as a write answered it or an event told it (D-191), into every
 * board of its channel held in the cache. The board without a search takes
 * it in place; a search reads again, its matching being the server's (D-97).
 * A task "updated" into the open list that the list did not hold was done
 * before: opened again, one fewer done.
 */
export function rememberTask(client: QueryClient, task: Task, change: 'created' | 'updated'): void {
    const tasks = heard(client)
    const at = Date.parse(task.updatedAt)
    if ((tasks.get(task.id) ?? Number.NEGATIVE_INFINITY) > at) return
    tasks.set(task.id, at)
    const open = taskKeys.open(task.channelId, '')
    const done = taskKeys.done(task.channelId, '')
    const held = client.getQueryData<TaskList>(open)
    const inOpen = held?.items.some((item) => item.id === task.id) ?? false
    const reopened = change === 'updated' && task.status !== 'done' && !inOpen
    client.setQueryData<TaskList>(open, (list) => list && putOpen(list, task, reopened))
    client.setQueryData<DonePages>(done, (pages) => pages && putDone(pages, task))
    readAgainIfReading(client, task.channelId)
    void client.invalidateQueries({
        queryKey: taskKeys.board(task.channelId),
        predicate: (query) => query.queryKey[4] !== ''
    })
}

/** A task deleted: out of every board of its channel; a done one no page holds reads the count again. */
export function forgetTask(client: QueryClient, channelId: string, taskId: string): void {
    heard(client).set(taskId, Number.POSITIVE_INFINITY)
    const open = taskKeys.open(channelId, '')
    let found = false
    client.setQueryData<TaskList>(open, (list) => {
        const next = list && dropOpen(list, taskId)
        if (next) found = true
        return next ?? list
    })
    const donePages = client.getQueryData<DonePages>(taskKeys.done(channelId, ''))
    const inDone = donePages?.pages.some((page) => page.items.some((item) => item.id === taskId)) ?? false
    if (inDone) {
        client.setQueryData<DonePages>(taskKeys.done(channelId, ''), (pages) => pages && dropDone(pages, taskId))
        client.setQueryData<TaskList>(open, (list) =>
            list && list.doneCount !== null ? { ...list, doneCount: Math.max(0, list.doneCount - 1) } : list
        )
    } else if (!found && client.getQueryState(open)?.fetchStatus !== 'fetching') {
        // A done task in no page read yet: how many are done is the server's to say.
        void client.invalidateQueries({ queryKey: open, exact: true })
    }
    readAgainIfReading(client, channelId)
    void client.invalidateQueries({
        queryKey: taskKeys.board(channelId),
        predicate: (query) => query.queryKey[4] !== ''
    })
}
