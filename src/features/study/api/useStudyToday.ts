import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isLaterRead } from '../lib/today'
import type { StudyToday } from '../types'
import { studyKeys } from './keys'
import { fetchStudyToday } from './study.api'

/**
 * One's day so far (D-231): today's seconds, where the open count stands,
 * the streak; `streak.updated` keeps it. A read that comes back after an
 * event read later (joining a room: the GET may read before the
 * participation opens) leaves the event's numbers (D-232).
 */
export function useStudyToday() {
    const client = useQueryClient()
    return useQuery({
        queryKey: studyKeys.today(),
        queryFn: async () => {
            const read = await fetchStudyToday()
            const held = client.getQueryData<StudyToday>(studyKeys.today())
            return held && isLaterRead(held, read) ? held : read
        }
    })
}
