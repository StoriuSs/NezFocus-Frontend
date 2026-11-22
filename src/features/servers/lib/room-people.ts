import { isLater, roomSessionOf, type FocusSession } from '@/features/study'
import type { RoomPerson, Server, ServerChannel } from '../types'

/**
 * The servers with one voice room's people swapped for `people` (D-205: an
 * event carries the room's whole list, so it replaces, never merges). The
 * same list when no server holds that room, or nothing is held: an event
 * never makes one.
 */
export function withRoomPeople(
    servers: Server[] | undefined,
    channelId: string,
    people: RoomPerson[]
): Server[] | undefined {
    return withRoom(servers, channelId, (channel) => ({ ...channel, voiceStates: people }))
}

/**
 * The servers with a voice room's study session as just told (an event, a
 * command's answer, D-231 L5-b): kept only when later than the one held
 * (D-225: the same session's higher version, or a session started later);
 * ended, the room has none. The same list when nothing changes.
 */
export function withRoomSession(servers: Server[] | undefined, session: FocusSession): Server[] | undefined {
    const channelId = session.channelId
    if (!channelId) return servers
    return withRoom(servers, channelId, (channel) => {
        const held = channel.focusSession
        if (held && !isLater(session, held)) return channel
        const room = roomSessionOf(session)
        if (!held && !room) return channel
        return { ...channel, focusSession: room }
    })
}

/** One voice room changed by `change`; the same list when no server holds it, or the room comes back the same. */
function withRoom(
    servers: Server[] | undefined,
    channelId: string,
    change: (channel: ServerChannel) => ServerChannel
): Server[] | undefined {
    if (!servers) return servers
    const server = servers.find((one) =>
        one.channels.some((channel) => channel.id === channelId && channel.type === 'voice')
    )
    if (!server) return servers
    const channels = server.channels.map((channel) => (channel.id === channelId ? change(channel) : channel))
    if (channels.every((channel, index) => channel === server.channels[index])) return servers
    return servers.map((known) => (known === server ? { ...server, channels } : known))
}
