import type { RoomSession, StudyCycle } from '@/features/study'
import type { ApiModel } from '@/lib/api-types'

/** Someone in a voice room (D-205): who, since when, and their icons (mic and camera self-reported, D-206). */
export type RoomPerson = ApiModel<'RoomPersonResponseDto'>

/** What a moderator's menu does to someone in a room (D-207, D-208). */
export type RoomAction = 'mute' | 'unmute' | 'disconnect'

/** Why the server put one out of a room (`voice.disconnected`, SRS 5.2, D-212). */
export type PutOutReason = 'moderator' | 'timeout' | 'kick' | 'ban' | 'permission' | 'channel_deleted' | 'server_left'

/** `POST /voice/token`: the token to join the room with, and where LiveKit is. */
export type VoiceToken = ApiModel<'VoiceTokenResponseDto'>

/**
 * A voice room as the app hands it to this feature: the servers feature owns
 * the data (who is in it comes with GET /servers and `voice_state.updated`,
 * D-205) and the permission bits, read there; voice imports no servers.
 */
export interface VoiceRoom {
    serverId: string
    channelId: string
    name: string
    isStudyRoom: boolean
    /** Its study session not yet ended, or null (D-220); kept live by the servers feature (D-231 L5-b). */
    session: RoomSession | null
    /** The cycle a session starts with (a study room's settings). */
    cycle: StudyCycle
    /** May start a session: anyone in a study room that lets anyone, else MANAGE_STUDY_ROOMS (REQ-STUDY-01). */
    canStartSession: boolean
    /** MANAGE_STUDY_ROOMS in the room: the Host's controls without being Host (07 › luật 6). */
    canManageStudy: boolean
    /** In the order they joined. */
    people: RoomPerson[]
    canConnect: boolean
    canSpeak: boolean
    canVideo: boolean
    /** Timed out on its server until then (D-54): no joining, and why. */
    timeoutUntil: string | null
    /** MUTE_MEMBERS in the room: "Mute" / "Unmute" on people ranked below (D-207, D-208). */
    canMute: boolean
    /** MOVE_MEMBERS in the room: "Disconnect from room" on people ranked below. */
    canMove: boolean
    /** Who in the room ranks below one (never oneself, never the owner): the only people a moderator's menu shows on. */
    outranked: ReadonlySet<string>
}

/** Finds rooms for the tab-wide hooks (`useVoiceSession`): the servers' data, handed by the app. */
export interface VoiceDirectory {
    room: (channelId: string) => VoiceRoom | undefined
    /** The room someone is in, by the lists held. */
    roomOf: (userId: string) => VoiceRoom | undefined
}
