import { useEffect } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { getApiErrorType } from '@/lib/api-error'
import type { TaskList } from '../types'
import { taskKeys } from './keys'
import { listenForTasks } from './liveTasks'
import { fetchDoneTasks, fetchOpenTasks } from './tasks.api'

/**
 * A channel's Task Board (S-TASK-01): the tasks not done and how many are
 * done, or those matching `search` (already folded, '' for none). Never read
 * again on its own: the socket keeps it live (`listenForTasks`).
 */
export function useOpenTasks(channelId: string, search: string, enabled = true) {
    const client = useQueryClient()
    useEffect(() => {
        // For the app's life, not this board's: no stop on unmount.
        listenForTasks(client)
    }, [client])
    return useQuery({
        queryKey: taskKeys.open(channelId, search),
        queryFn: () => fetchOpenTasks(channelId, search),
        staleTime: Infinity,
        enabled
    })
}

/**
 * Its done tasks, latest done first, 50 a page and "Xem thêm" for more
 * (D-97); read once the group opens. A page after a task no longer done
 * (CONFLICT_ERROR, SRS 5.1) starts the group again.
 */
export function useDoneTasks(channelId: string, search: string, enabled: boolean) {
    const client = useQueryClient()
    const query = useInfiniteQuery({
        queryKey: taskKeys.done(channelId, search),
        queryFn: ({ pageParam }) => fetchDoneTasks(channelId, search, pageParam),
        initialPageParam: null as string | null,
        getNextPageParam: (last: TaskList) => (last.hasMore ? (last.items.at(-1)?.id ?? null) : null),
        staleTime: Infinity,
        enabled
    })
    const stale = query.isError && getApiErrorType(query.error) === 'CONFLICT_ERROR'
    useEffect(() => {
        if (stale) void client.resetQueries({ queryKey: taskKeys.done(channelId, search), exact: true })
    }, [stale, client, channelId, search])
    return query
}

/** How many tasks of the channel are not done: the channel settings' warning before the board is turned off (04 S-SET-05). */
export function useOpenTaskCount(channelId: string, enabled: boolean): number | undefined {
    return useOpenTasks(channelId, '', enabled).data?.items.length
}
