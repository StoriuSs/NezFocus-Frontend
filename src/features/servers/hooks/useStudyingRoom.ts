import { useVoiceStore } from '@/features/voice'
import { useProfile } from '@/features/users'
import { useServers } from '../api/useServers'
import { studyingRoomOf, type StudyingRoom } from '../lib/live-rooms'

/**
 * The room session one takes part in, in this tab or another (D-236): this
 * tab's room once joined, else the room the servers list one in. The Study,
 * Solo and Stats pages count today's minutes with it and start no Solo in
 * it; what asks a Host before leaving stays this tab's (`useJoinedSession`).
 */
export function useStudyingRoom(): StudyingRoom | null {
    const call = useVoiceStore((state) => state.call)
    const servers = useServers().data
    const me = useProfile().data?.id
    if (!servers) return null
    return studyingRoomOf(servers, me, call && call.phase !== 'joining' ? call : null)
}
