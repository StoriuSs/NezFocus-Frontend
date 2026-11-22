import { useQuery } from '@tanstack/react-query'
import { studyKeys } from './keys'
import { fetchStudyToday } from './study.api'

/** One's day so far (D-231): today's seconds, where the open count stands, the streak; `streak.updated` keeps it. */
export function useStudyToday(enabled = true) {
    return useQuery({ queryKey: studyKeys.today(), queryFn: fetchStudyToday, enabled })
}
