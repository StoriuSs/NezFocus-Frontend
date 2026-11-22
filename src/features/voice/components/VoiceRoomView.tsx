import '../voice.css'
import type { RoomSession } from '@/features/study'
import { useProfile } from '@/features/users'
import type { VoiceRoom } from '../types'
import { useVoiceStore } from '../voice.store'
import { InRoom } from './InRoom'
import { Preview } from './Preview'

/**
 * A voice room's page, under its Header (07): the preview page until this
 * tab is in the room, then the room. One URL for both (07 › Quy ước): being
 * in it is a state, so joining adds no step to the history. LiveKit's room
 * and its hooks load with this chunk, never with the first screen.
 * `joinedSession`: the session of the room this tab is in, if another: its
 * Host is asked before switching here (D-50). `onMorePeople`: opens the
 * panel "Người trong phòng" (a "+N" seat, C-18).
 */
export default function VoiceRoomView({
    room,
    joinedSession = null,
    onMorePeople
}: {
    room: VoiceRoom
    joinedSession?: RoomSession | null
    onMorePeople?: (seat: HTMLButtonElement, order: string[]) => void
}) {
    const me = useProfile().data?.id
    const call = useVoiceStore((state) => state.call)
    const live = useVoiceStore((state) => state.room)
    const inside = call?.channelId === room.channelId && call.phase !== 'joining' && live !== null && me !== undefined
    return inside ? (
        <InRoom room={room} live={live} me={me} onMorePeople={onMorePeople} />
    ) : (
        <Preview room={room} joinedSession={joinedSession} onMorePeople={onMorePeople} />
    )
}
