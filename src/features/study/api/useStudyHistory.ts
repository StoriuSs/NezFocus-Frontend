import { useEffect } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { getApiErrorType } from '@/lib/api-error'
import { serverNow } from '@/lib/server-clock'
import { accountTimeZone } from '@/lib/time-zones'
import type { StatsPeriod } from '../lib/periods'
import { dayStartOf, todaySecondsAt } from '../lib/today'
import type { StudyHistoryRead, StudyToday } from '../types'
import { studyKeys } from './keys'
import { fetchStudyHistory } from './study.api'

/**
 * A period's sessions for the Stats page (C-47, D-230), 20 a page and "Xem
 * thêm" for more, the next page after the last line's session. A page after
 * a session no longer one's (CONFLICT_ERROR) starts the history again. Read
 * again after each count (`streak.updated`, D-235), each page with today's
 * counted seconds as it was read (`countedToday`).
 */
export function useStudyHistory(period: StatsPeriod) {
    const client = useQueryClient()
    const key = studyKeys.history(period.view, period.start)
    const query = useInfiniteQuery({
        queryKey: key,
        queryFn: async ({ pageParam }): Promise<StudyHistoryRead> => {
            const page = await fetchStudyHistory(period, pageParam)
            // Today's counted seconds as the lines were read: the line one is in grows by what today gains after.
            const day = client.getQueryData<StudyToday>(studyKeys.today())
            const now = serverNow()
            const readDay = dayStartOf(now, accountTimeZone())
            const countedToday = day ? todaySecondsAt(day, null, now, readDay) : null
            return { ...page, countedToday, readDay }
        },
        initialPageParam: null as string | null,
        getNextPageParam: (last: StudyHistoryRead) => (last.hasMore ? (last.items.at(-1)?.sessionId ?? null) : null)
    })
    const stale = query.isError && getApiErrorType(query.error) === 'CONFLICT_ERROR'
    useEffect(() => {
        if (stale) void client.resetQueries({ queryKey: studyKeys.history(period.view, period.start), exact: true })
    }, [stale, client, period.view, period.start])
    return query
}
