import type { QueryClient } from '@tanstack/react-query'
import { onRealtimeEvent } from '@/features/realtime'
import type { Task, TaskList } from '../types'
import type { DonePages } from '../lib/task-cache'
import { taskKeys } from './keys'
import { forgetTask, rememberTask } from './rememberTask'

const listening = new WeakSet<QueryClient>()

/**
 * Signals after which who views a channel may have changed, or its board
 * been turned off, while no task did (D-178, D-194): the tasks of that
 * server held in the cache are read again, for "Mất quyền xem kênh" and
 * "(đã rời server)" (someone joining may be a creator back), and an open
 * detail one may no longer view closes.
 */
const STANDING = [
    'server.updated',
    'channel.updated',
    'channel.deleted',
    'role.updated',
    'role.deleted',
    'member.joined',
    'member.updated',
    'member.left'
]
/** A burst of signals is one read, a little later... */
const GATHER_MS = 300
/** ...and the server's members do not all ask at once (D-178). */
const SPREAD_MS = 500

/** Whether a task query's data names a task of that server. */
function ofServer(data: unknown, serverId: string): boolean {
    if (!data || typeof data !== 'object') return false
    if ('serverId' in data) return (data as Task).serverId === serverId
    const lists = 'pages' in data ? (data as DonePages).pages : 'items' in data ? [data as TaskList] : []
    return lists.some((list) => list.items.some((item) => (item as Partial<Task>).serverId === serverId))
}

/**
 * Keeps the Task Boards in the cache live (05 Q4, SRS 5.2): `task.created`
 * and `task.updated` carry the whole task, into its place; `task.deleted`
 * takes it out. They come to every socket that views the channel (D-163),
 * whether its board is open or not; a board not read is not touched. Each
 * `ready` (the socket live again) reads every board again: changes may have
 * been missed meanwhile. A change of who may view a server's channels reads
 * its tasks again (`STANDING`). Once per query client, for the app's life.
 *
 * Returns the way to stop (the first call only; tests use it).
 */
export function listenForTasks(client: QueryClient): () => void {
    if (listening.has(client)) return () => undefined
    listening.add(client)
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const stops = [
        onRealtimeEvent('task.created', (data) => rememberTask(client, (data as { task: Task }).task, 'created')),
        onRealtimeEvent('task.updated', (data) => rememberTask(client, (data as { task: Task }).task, 'updated')),
        onRealtimeEvent('task.deleted', (data) => {
            const { taskId, channelId } = data as { taskId: string; channelId: string }
            forgetTask(client, channelId, taskId)
        }),
        onRealtimeEvent('ready', () => void client.invalidateQueries({ queryKey: taskKeys.all })),
        ...STANDING.map((event) =>
            onRealtimeEvent(event, (data) => {
                const { serverId } = data as { serverId: string }
                if (timers.has(serverId)) return
                timers.set(
                    serverId,
                    setTimeout(
                        () => {
                            timers.delete(serverId)
                            void client.invalidateQueries({
                                queryKey: taskKeys.all,
                                predicate: (query) => ofServer(query.state.data, serverId)
                            })
                        },
                        GATHER_MS + Math.random() * SPREAD_MS
                    )
                )
            })
        )
    ]
    return () => {
        listening.delete(client)
        for (const stop of stops) stop()
        for (const timer of timers.values()) clearTimeout(timer)
    }
}
