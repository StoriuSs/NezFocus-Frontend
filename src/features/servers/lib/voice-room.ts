import type { VoiceDirectory, VoiceRoom } from '@/features/voice'
import { can } from './permissions'
import type { Server, ServerChannel } from '../types'

/**
 * A voice room as the voice feature takes it (voice reads no permission
 * bits, nor the servers' data): who is in it (D-205), and what one may do
 * there. A timeout leaves no CONNECT (appendix B, step 6); it is given apart
 * so the page says until when (D-54).
 */
export function voiceRoomOf(server: Server, channel: ServerChannel): VoiceRoom {
    return {
        serverId: server.id,
        channelId: channel.id,
        name: channel.name,
        isStudyRoom: channel.isStudyRoom,
        people: channel.voiceStates ?? [],
        canConnect: can(channel.permissions, 'CONNECT'),
        canSpeak: can(channel.permissions, 'SPEAK'),
        canVideo: can(channel.permissions, 'VIDEO'),
        timeoutUntil: server.timeoutUntil
    }
}

/** Every voice room held, for voice's tab-wide hooks (`useVoiceSession`). */
export function voiceDirectory(servers: Server[]): VoiceDirectory {
    const rooms = servers.flatMap((server) =>
        server.channels.filter((channel) => channel.type === 'voice').map((channel) => voiceRoomOf(server, channel))
    )
    return {
        room: (channelId) => rooms.find((room) => room.channelId === channelId),
        roomOf: (userId) => rooms.find((room) => room.people.some((person) => person.user.id === userId))
    }
}
