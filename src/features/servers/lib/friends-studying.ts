import { activityShown, nameOf, type Relationship } from '@/features/social'
import type { PhaseState } from '@/features/study'
import type { RoomPerson } from '@/features/voice'
import { compareRooms, liveRoomsOf, type LiveRoom } from './live-rooms'
import type { Server } from '../types'

/**
 * A friend studying now, as the Solo page's "Bạn bè đang học" lists them
 * (08 S-STUDY-02, C-44 `friend`): in a room's session one sees, with the
 * room (the row a link to its page), or on a Solo of their own, with its
 * phase (`friend · solo`: no room, no link).
 */
export type StudyingFriend =
    | { kind: 'room'; user: RoomPerson['user']; room: LiveRoom }
    | { kind: 'solo'; user: Relationship['user']; phase: PhaseState }

const collator = new Intl.Collator('vi', { sensitivity: 'base' })
const byName = (a: StudyingFriend, b: StudyingFriend) =>
    collator.compare(nameOf(a.user) ?? '', nameOf(b.user) ?? '') || a.user.id.localeCompare(b.user.id)

/**
 * Who of one's friends studies now (R2, R7, D-252 4g, D-254): those in a
 * session of a room one sees (`GET /servers` holds only rooms seen; their
 * names never hide, D-79), room by room in the Study page's order, by name
 * within a room; then those on a Solo they show (`activity.solo`, which the
 * backend leaves out when they turned the switch off) and not offline, by
 * name, also when they sit in a voice room with no session. A room wins over
 * a Solo, as in the activity line.
 */
export function friendsStudyingOf(
    servers: Server[],
    me: string | undefined,
    relationships: readonly Relationship[]
): StudyingFriend[] {
    const friends = relationships.filter((entry) => entry.type === 'friend')
    const rooms = liveRoomsOf(servers, me, new Set(friends.map((entry) => entry.user.id)), true).sort(compareRooms)
    const inRooms = rooms.flatMap((room) =>
        room.friends.map((user): StudyingFriend => ({ kind: 'room', user, room })).sort(byName)
    )
    const placed = new Set(inRooms.map((friend) => friend.user.id))
    const alone = friends.flatMap((entry): StudyingFriend[] => {
        const solo = entry.activity?.solo
        if (!solo || placed.has(entry.user.id) || !activityShown(entry.presence, true)) return []
        return [
            {
                kind: 'solo',
                user: entry.user,
                phase: {
                    status: solo.status,
                    phase: solo.phase,
                    phaseEndsAt: solo.phaseEndsAt,
                    pausedRemainingMs: null
                }
            }
        ]
    })
    return [...inRooms, ...alone.sort(byName)]
}

/**
 * The list kept as it was when the popover opened (R2: "chụp lúc mở, không
 * xếp lại khi đang xem", D-254): those still studying where they were, with
 * what they do now; those who stopped gone; newcomers at the end.
 */
export function keptFriends(order: readonly string[], now: readonly StudyingFriend[]): StudyingFriend[] {
    const byId = new Map(now.map((friend) => [friend.user.id, friend]))
    const kept = order.flatMap((id) => byId.get(id) ?? [])
    const known = new Set(order)
    return [...kept, ...now.filter((friend) => !known.has(friend.user.id))]
}
