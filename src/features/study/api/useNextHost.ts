import { useQuery } from '@tanstack/react-query'
import { fetchNextHost } from './study.api'
import { studyKeys } from './keys'

/**
 * Who would control the session if its Host left now, read as "Rời phòng?"
 * opens (D-233): people come and go, so it is read each time, never kept.
 * A failure is shown as the sentence that names nobody (queries show no toast).
 */
export function useNextHost(sessionId: string) {
    return useQuery({
        queryKey: studyKeys.nextHost(sessionId),
        queryFn: () => fetchNextHost(sessionId),
        staleTime: 0,
        gcTime: 0,
        retry: false
    })
}
