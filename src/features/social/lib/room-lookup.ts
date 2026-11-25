import type { RoomSession } from '@/features/study'

/**
 * Where someone is, as far as I see it (D-240, D-252): the voice room of my
 * servers they are in, among the rooms I see (`GET /servers` lists only the
 * channels I view), with its name, whether it is a study room, and its
 * session. A room I do not see is no answer: their activity line then says
 * only "Đang học cùng nhóm" / "Đang ở một phòng voice". Undefined while
 * my servers are not read yet: no line until they are.
 *
 * The servers feature holds the rooms and answers with a hook
 * (`useRoomLookup`); the social feature cannot import it, so the AppShell
 * connects the two, as `ChatLinks`.
 */
export interface RoomLookup {
    roomOf: (userId: string) => SeenRoom | null | undefined
}

export interface SeenRoom {
    name: string
    isStudyRoom: boolean
    session: RoomSession | null
}

let connected: (() => RoomLookup) | null = null

export function connectRoomLookup(hook: () => RoomLookup): void {
    connected = hook
}

/** The connected answer, read on each render as any hook (connected once, before the app draws). */
export function useConnectedRoomLookup(): RoomLookup {
    if (!connected) throw new Error('RoomLookup is not connected: the AppShell connects it.')
    return connected()
}
