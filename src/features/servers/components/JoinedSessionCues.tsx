import { Suspense } from 'react'
import { SessionCues } from '@/features/study'
import { useJoinedSession } from '../hooks/useJoinedSession'

/**
 * The tab's title, the phase sound and the streak toast of the study session
 * in the room this tab is in (REQ-STUDY-06, STUDY-07, 07 S-ROOM-05), on every
 * page, its own included;
 * nothing while joining, in a room with no session, or in none.
 */
export function JoinedSessionCues() {
    const session = useJoinedSession()
    if (!session) return null
    return (
        <Suspense fallback={null}>
            <SessionCues session={session} />
        </Suspense>
    )
}
