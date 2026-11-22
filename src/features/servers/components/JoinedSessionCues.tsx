import { Suspense } from 'react'
import { SessionCues } from '@/features/study'
import { useVoiceStore } from '@/features/voice'
import { useServers } from '../api/useServers'

/**
 * The tab's title, the phase sound and the streak toast of the study session
 * in the room this tab is in (REQ-STUDY-06, STUDY-07, 07 S-ROOM-05), on every
 * page, its own included;
 * nothing while joining, in a room with no session, or in none. The session
 * is the room's in the servers held, as the room's page has it.
 */
export function JoinedSessionCues() {
    const call = useVoiceStore((state) => state.call)
    const servers = useServers().data
    const session =
        call && call.phase !== 'joining'
            ? servers
                  ?.find((server) => server.id === call.serverId)
                  ?.channels.find((channel) => channel.id === call.channelId)?.focusSession
            : null
    if (!session) return null
    return (
        <Suspense fallback={null}>
            <SessionCues session={session} />
        </Suspense>
    )
}
