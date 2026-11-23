import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { StatsPeriod } from '../lib/periods'
import { isLaterRead } from '../lib/today'
import type { StudyToday } from '../types'
import { studyKeys } from './keys'
import { fetchStudyPeriod } from './study.api'

/**
 * A period's numbers for the Stats page (08 S-STUDY-03, D-235), keyed by
 * today too (`today`, one's zone): a new day reads it again. The day so far
 * read with it goes to today's numbers unless those were read later (D-232);
 * `streak.updated` reads it again after each count (`listenForSessions`).
 * Past midnight the period's numbers stay while its new day is read.
 */
export function useStudyPeriod(period: StatsPeriod, today: string) {
    const client = useQueryClient()
    return useQuery({
        queryKey: studyKeys.period(period.view, period.start, today),
        queryFn: async () => {
            const { stats, today: day } = await fetchStudyPeriod(period)
            client.setQueryData<StudyToday>(studyKeys.today(), (held) => (held && isLaterRead(held, day) ? held : day))
            return stats
        },
        // A new day of the same period: what was read stays until the new read comes (offline too).
        placeholderData: (previous, previousQuery) =>
            previousQuery?.queryKey[2] === period.view && previousQuery.queryKey[3] === period.start
                ? previous
                : undefined
    })
}
