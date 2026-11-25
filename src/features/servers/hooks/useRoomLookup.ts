import type { RoomLookup } from '@/features/social'
import { useServers } from '../api/useServers'
import { seenRooms } from '../lib/voice-room'

/** Before my servers are read: where anyone is, not known yet (no line rather than the general words). */
const unknown: RoomLookup = { roomOf: () => undefined }

/**
 * The social feature's `RoomLookup` (D-252), from the servers held, kept live
 * (D-205, D-220): the room someone is in, for their activity line. Connected
 * by the AppShell; read only by lines that show.
 */
export function useRoomLookup(): RoomLookup {
    const servers = useServers().data
    return servers ? seenRooms(servers) : unknown
}
