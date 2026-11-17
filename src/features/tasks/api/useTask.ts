import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { taskKeys } from './keys'
import { listenForTasks } from './liveTasks'
import { heldTask } from './rememberTask'
import { fetchTask, fetchTaskHistory } from './tasks.api'

/**
 * One task for its detail (S-TASK-02): at once from a board in the cache
 * when one holds it, read again each time the detail opens (whether its
 * people still view the channel, D-194); kept live by the socket after.
 */
export function useTask(taskId: string) {
    const client = useQueryClient()
    useEffect(() => {
        listenForTasks(client)
    }, [client])
    return useQuery({
        queryKey: taskKeys.one(taskId),
        queryFn: () => fetchTask(taskId),
        initialData: () => heldTask(client, taskId),
        initialDataUpdatedAt: 0,
        staleTime: Infinity,
        refetchOnMount: 'always'
    })
}

/** Its history, newest first, 200 lines and how many (SRS 5.1); read again after each change (rememberTask). */
export function useTaskHistory(taskId: string, enabled: boolean) {
    return useQuery({
        queryKey: taskKeys.history(taskId),
        queryFn: () => fetchTaskHistory(taskId),
        staleTime: Infinity,
        refetchOnMount: 'always',
        enabled
    })
}
