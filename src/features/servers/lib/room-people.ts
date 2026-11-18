import type { RoomPerson, Server } from '../types'

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
    if (!servers) return servers
    const at = servers.findIndex((server) =>
        server.channels.some((channel) => channel.id === channelId && channel.type === 'voice')
    )
    if (at === -1) return servers
    return servers.map((server, index) =>
        index === at
            ? {
                  ...server,
                  channels: server.channels.map((channel) =>
                      channel.id === channelId ? { ...channel, voiceStates: people } : channel
                  )
              }
            : server
    )
}
