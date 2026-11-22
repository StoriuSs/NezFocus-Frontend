import type { RoomSession } from '@/features/study'
import { useVoiceStore } from '@/features/voice'
import { useServers } from '../api/useServers'

/**
 * The study session of the room this tab is in, from the servers held (as
 * the room's page has it): null while joining, in a room with no session,
 * or in none. What the tab title and the phase sound follow, and what asks
 * its Host before leaving it another way than Rời (switching rooms, signing
 * out: D-50, D-77).
 */
export function useJoinedSession(): RoomSession | null {
    const call = useVoiceStore((state) => state.call)
    const servers = useServers().data
    if (!call || call.phase === 'joining') return null
    return (
        servers
            ?.find((server) => server.id === call.serverId)
            ?.channels.find((channel) => channel.id === call.channelId)?.focusSession ?? null
    )
}
