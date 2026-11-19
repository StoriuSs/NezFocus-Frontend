import type { RoomAction, RoomPerson, VoiceRoom } from '../types'

/**
 * The items of a moderator's menu on someone in a room (D-207, D-208, 07
 * ROOM-EDGE): "Mute" or, on someone muted, "Unmute" with MUTE_MEMBERS;
 * "Disconnect from room" with MOVE_MEMBERS; only on someone ranked below,
 * never the owner and never oneself (`me`: one's own row may lag one's
 * roles). Empty: no menu at all. The API decides; this only hides what it
 * would refuse.
 */
export function roomActionsOn(
    room: Pick<VoiceRoom, 'canMute' | 'canMove' | 'outranked'>,
    person: Pick<RoomPerson, 'user' | 'modMuted'>,
    me: string | undefined
): RoomAction[] {
    if (person.user.id === me || !room.outranked.has(person.user.id)) return []
    const actions: RoomAction[] = []
    if (room.canMute) actions.push(person.modMuted ? 'unmute' : 'mute')
    if (room.canMove) actions.push('disconnect')
    return actions
}
