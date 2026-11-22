import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isLaterRead } from '../lib/today'
import type { StudyToday } from '../types'
import { studyKeys } from './keys'
import { fetchStudyWeek } from './study.api'

/**
 * This week's days for the Study page's chart (08 S-STUDY-01, C-45), keyed
 * by today (`date`, one's zone): a new day reads it again. The day so far
 * read with it goes to today's numbers unless those were read later (D-232);
 * today's column is drawn from those, which events keep.
 */
export function useStudyWeek(date: string) {
    const client = useQueryClient()
    return useQuery({
        queryKey: studyKeys.week(date),
        queryFn: async () => {
            const { week, today } = await fetchStudyWeek()
            client.setQueryData<StudyToday>(studyKeys.today(), (held) =>
                held && isLaterRead(held, today) ? held : today
            )
            return week
        }
    })
}
