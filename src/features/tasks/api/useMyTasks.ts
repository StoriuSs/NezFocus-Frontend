import { useEffect, useRef } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsCache } from '@/features/users'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { getApiErrorType } from '@/lib/api-error'
import { wallClock } from '@/lib/time-zones'
import type { MyTaskList } from '../types'
import { taskKeys } from './keys'
import { listenForTasks } from './liveTasks'
import { fetchMyDoneTasks, fetchMyTasks } from './tasks.api'

/**
 * One's tasks not done (S-TASK-04, D-186), every server's or `server`'s,
 * those matching `search` (already folded, '' for none), each in the group
 * the server put it in. Read again, not patched, after a change of one's
 * tasks (`listenForTasks`): the server groups them.
 */
export function useMyTasks(server: string | null, search: string) {
    const client = useQueryClient()
    useEffect(() => {
        // For the app's life, not this page's: no stop on unmount.
        listenForTasks(client)
    }, [client])
    return useQuery({
        queryKey: taskKeys.mineOpen(server ?? '', search),
        queryFn: () => fetchMyTasks(server, search),
        staleTime: Infinity
    })
}

/**
 * One's done tasks, latest done first, 50 a page and "Xem thêm" for more
 * (D-97); read once the group opens. A page after a task no longer among
 * them (CONFLICT_ERROR, SRS 5.1) starts the group again.
 */
export function useMyDoneTasks(server: string | null, search: string, enabled: boolean) {
    const client = useQueryClient()
    const key = taskKeys.mineDone(server ?? '', search)
    const query = useInfiniteQuery({
        queryKey: key,
        queryFn: ({ pageParam }) => fetchMyDoneTasks(server, search, pageParam),
        initialPageParam: null as string | null,
        getNextPageParam: (last: MyTaskList) => (last.hasMore ? (last.items.at(-1)?.id ?? null) : null),
        staleTime: Infinity,
        enabled
    })
    const stale = query.isError && getApiErrorType(query.error) === 'CONFLICT_ERROR'
    useEffect(() => {
        if (stale) void client.resetQueries({ queryKey: taskKeys.mineDone(server ?? '', search), exact: true })
    }, [stale, client, server, search])
    return query
}

/** A new day is read this long after it starts, so the API's clock has passed midnight too. */
const MIDNIGHT_MARGIN_MS = 30_000

/**
 * The day it is in the account's zone: a new day, or another zone chosen,
 * reads the To-do page's lists again, their groups and the rail's badge with
 * them (D-196). Ticks once a minute; a tab asleep past midnight catches up on
 * its next tick. The zone arriving with the settings is not a change.
 */
export function useMidnightReload(): void {
    const client = useQueryClient()
    const now = useMinuteClock()
    const timeZone = useQuery(settingsCache).data?.timezone
    const { year, month, day } = wallClock(now, timeZone)
    const today = timeZone === undefined ? null : `${timeZone} ${year}-${month}-${day}`
    const seen = useRef(today)
    useEffect(() => {
        if (today === null || seen.current === today) return
        const first = seen.current === null
        seen.current = today
        if (first) return
        const timer = setTimeout(() => void client.invalidateQueries({ queryKey: taskKeys.mine() }), MIDNIGHT_MARGIN_MS)
        return () => clearTimeout(timer)
    }, [today, client])
}

/**
 * The rail's "Việc" badge (C-05): one's tasks overdue or due today, from the
 * list of every server (the page's "Tất cả việc"); 0 until it is read.
 */
export function useDueTaskCount(): number {
    useMidnightReload()
    return useMyTasks(null, '').data?.dueCount ?? 0
}
