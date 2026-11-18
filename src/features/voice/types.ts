import type { ApiModel } from '@/lib/api-types'

/** Someone in a voice room (D-205): who, since when, and their icons (mic and camera self-reported, D-206). */
export type RoomPerson = ApiModel<'RoomPersonResponseDto'>

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
    /** In the order they joined. */
    people: RoomPerson[]
    canConnect: boolean
    canSpeak: boolean
    canVideo: boolean
    /** Timed out on its server until then (D-54): no joining, and why. */
    timeoutUntil: string | null
}

/** Finds rooms for the tab-wide hooks (`useVoiceSession`): the servers' data, handed by the app. */
export interface VoiceDirectory {
    room: (channelId: string) => VoiceRoom | undefined
    /** The room someone is in, by the lists held. */
    roomOf: (userId: string) => VoiceRoom | undefined
}
