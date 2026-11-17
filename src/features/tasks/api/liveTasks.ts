import type { QueryClient } from '@tanstack/react-query'
import { onRealtimeEvent } from '@/features/realtime'
import type { Task } from '../types'
import { taskKeys } from './keys'
import { forgetTask, rememberTask } from './rememberTask'

const listening = new WeakSet<QueryClient>()

/**
 * Keeps the Task Boards in the cache live (05 Q4, SRS 5.2): `task.created`
 * and `task.updated` carry the whole task, into its place; `task.deleted`
 * takes it out. They come to every socket that views the channel (D-163),
 * whether its board is open or not; a board not read is not touched. Each
 * `ready` (the socket live again) reads every board again: changes may have
 * been missed meanwhile. Once per query client, for the app's life.
 *
 * Returns the way to stop (the first call only; tests use it).
 */
export function listenForTasks(client: QueryClient): () => void {
    if (listening.has(client)) return () => undefined
    listening.add(client)
    const stops = [
        onRealtimeEvent('task.created', (data) => rememberTask(client, (data as { task: Task }).task, 'created')),
        onRealtimeEvent('task.updated', (data) => rememberTask(client, (data as { task: Task }).task, 'updated')),
        onRealtimeEvent('task.deleted', (data) => {
            const { taskId, channelId } = data as { taskId: string; channelId: string }
            forgetTask(client, channelId, taskId)
        }),
        onRealtimeEvent('ready', () => void client.invalidateQueries({ queryKey: taskKeys.all }))
    ]
    return () => {
        listening.delete(client)
        for (const stop of stops) stop()
    }
}
