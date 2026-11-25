import { cycleOf } from '@/features/study'
import type { RoomLookup } from '@/features/social'
import type { VoiceDirectory, VoiceRoom } from '@/features/voice'
import { isBelow } from './moderation'
import { can } from './permissions'
import type { Server, ServerChannel } from '../types'

/**
 * A voice room as the voice feature takes it (voice reads no permission
 * bits, nor the servers' data): who is in it (D-205), and what one may do
 * there. A timeout leaves no CONNECT (appendix B, step 6); it is given apart
 * so the page says until when (D-54). A moderator's menu (D-207, D-208)
 * goes by the room's MUTE_MEMBERS / MOVE_MEMBERS and by rank, worked out
 * here as plain values: who in the room ranks below one, the owner above
 * all and no one above themselves. A study room's session, its cycle, and
 * who may start or control one (REQ-STUDY-01, 03) come the same way.
 */
export function voiceRoomOf(server: Server, channel: ServerChannel): VoiceRoom {
    const people = channel.voiceStates ?? []
    return {
        serverId: server.id,
        channelId: channel.id,
        name: channel.name,
        isStudyRoom: channel.isStudyRoom,
        session: channel.focusSession ?? null,
        cycle: cycleOf(channel),
        canStartSession:
            channel.isStudyRoom &&
            (channel.studyStarter === 'anyone' || can(channel.permissions, 'MANAGE_STUDY_ROOMS')),
        canManageStudy: can(channel.permissions, 'MANAGE_STUDY_ROOMS'),
        people,
        canConnect: can(channel.permissions, 'CONNECT'),
        canSpeak: can(channel.permissions, 'SPEAK'),
        canVideo: can(channel.permissions, 'VIDEO'),
        timeoutUntil: server.timeoutUntil,
        canMute: can(channel.permissions, 'MUTE_MEMBERS'),
        canMove: can(channel.permissions, 'MOVE_MEMBERS'),
        outranked: new Set(people.filter((person) => isBelow(server, person)).map((person) => person.user.id))
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

/** One answer per list of servers held: every activity line on screen reads the same one. */
const lookups = new WeakMap<Server[], RoomLookup>()

/**
 * The social feature's `RoomLookup` (D-252): the voice room someone is in
 * among the rooms of my servers I see (`GET /servers` holds only the
 * channels I view, with who is in each and its session), its name, kind and
 * session; worked out once per list held (`voiceDirectory`), every row on
 * screen reading the same answer.
 */
export function seenRooms(servers: Server[]): RoomLookup {
    const held = lookups.get(servers)
    if (held) return held
    const directory = voiceDirectory(servers)
    const lookup: RoomLookup = {
        roomOf: (userId) => {
            const room = directory.roomOf(userId)
            return room ? { name: room.name, isStudyRoom: room.isStudyRoom, session: room.session } : null
        }
    }
    lookups.set(servers, lookup)
    return lookup
}
