import type { RoomSession } from '@/features/study'
import { can } from './permissions'
import type { Server } from '../types'

/** A room studying now as the Study page lists it (08 S-STUDY-01, C-44). */
export interface LiveRoom {
    serverId: string
    serverName: string
    channelId: string
    name: string
    session: RoomSession
    /** Who is in it, oneself left out (C-44 › Dòng người). */
    people: number
    /** One is in it ("Bạn ở đây"), in this tab or another. */
    here: boolean
}

/**
 * What a Study page row hands the room's page as it opens it (08 › Edge):
 * the session it showed and the room's name, for a session that has just
 * ended (`room-ended-on-join`) or a room no longer one's to open.
 */
export interface StudyRow {
    sessionId: string
    name: string
}

/** How long a page opened from a Study page row remembers it: "just" ended, or lost, means about then. */
export const STUDY_ROW_MS = 10_000

/** The Study page row a page was opened from, if any (`location.state`). */
export function studyRowOf(state: unknown): StudyRow | null {
    const row = (state as { studyRow?: Partial<StudyRow> } | null)?.studyRow
    return typeof row?.sessionId === 'string' && typeof row.name === 'string'
        ? { sessionId: row.sessionId, name: row.name }
        : null
}

/** The session one takes part in and its room's name (`studyingRoomOf`). */
export interface StudyingRoom {
    session: RoomSession
    name: string
}

/**
 * The room session one takes part in, as the servers held say (D-236):
 * the room this tab is in (`call`, once joined), else the one whose people
 * list oneself, joined in another tab or device. What the Study pages count
 * today's minutes with and why they start no Solo (REQ-STUDY-05); null in
 * no room, or in one with no session.
 */
export function studyingRoomOf(
    servers: Server[],
    me: string | undefined,
    call: { channelId: string } | null
): StudyingRoom | null {
    const channels = servers.flatMap((server) => server.channels)
    const found = call
        ? channels.find((channel) => channel.id === call.channelId)
        : me === undefined
          ? undefined
          : channels.find(
                (channel) => channel.focusSession && (channel.voiceStates ?? []).some((one) => one.user.id === me)
            )
    return found?.focusSession ? { session: found.focusSession, name: found.name } : null
}

/**
 * Every room with a session, running or paused, in one's servers that one
 * sees and may join (REQ-STUDY-09: CONNECT; a channel held is one seen; a
 * timeout leaves no CONNECT).
 */
export function liveRoomsOf(servers: Server[], me: string | undefined): LiveRoom[] {
    return servers.flatMap((server) =>
        server.channels.flatMap((channel) => {
            if (channel.type !== 'voice' || !channel.focusSession || !can(channel.permissions, 'CONNECT')) return []
            const people = channel.voiceStates ?? []
            const here = me !== undefined && people.some((person) => person.user.id === me)
            return [
                {
                    serverId: server.id,
                    serverName: server.name,
                    channelId: channel.id,
                    name: channel.name,
                    session: channel.focusSession,
                    people: people.length - (here ? 1 : 0),
                    here
                }
            ]
        })
    )
}

/**
 * The Study page's order (REQ-STUDY-09, D-217 until friends come in M6): the
 * room one is in, then more people, then the session started earlier; the
 * room's id settles the rest, so every order is the same.
 */
export function compareRooms(a: LiveRoom, b: LiveRoom): number {
    if (a.here !== b.here) return a.here ? -1 : 1
    if (a.people !== b.people) return b.people - a.people
    const started = Date.parse(a.session.startedAt) - Date.parse(b.session.startedAt)
    if (started !== 0) return started
    return a.channelId < b.channelId ? -1 : a.channelId > b.channelId ? 1 : 0
}

/** The rooms in the page's order, worked out now (opening the page, coming back after 5 minutes away). */
export const orderOf = (rooms: LiveRoom[]): string[] => [...rooms].sort(compareRooms).map((room) => room.channelId)

/**
 * The order kept while one looks (08 › Thứ tự, Q4): the rooms still there
 * where they were (those in `keep`, fading out, too), a room starting a
 * session at the end, more than one in the page's order.
 */
export function keptOrder(order: string[], rooms: LiveRoom[], keep: ReadonlySet<string> = new Set()): string[] {
    const present = new Set(rooms.map((room) => room.channelId))
    const kept = order.filter((id) => present.has(id) || keep.has(id))
    const known = new Set(kept)
    return [...kept, ...orderOf(rooms.filter((room) => !known.has(room.channelId)))]
}
