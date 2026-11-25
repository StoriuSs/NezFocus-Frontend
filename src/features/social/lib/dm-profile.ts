import type { Relationship, RelationshipType } from '../types'
import type { DmStanding } from './dm-chat'

/**
 * Where I stand with someone, from my relationships: `none` when not in
 * them; `null` while they are not read (yet, or the read failed), so no
 * screen offers "Add friend" to a friend in the meantime.
 */
export function relationshipWith(list: Relationship[] | undefined, userId: string): RelationshipType | null {
    if (!list) return null
    return list.find((entry) => entry.user.id === userId)?.type ?? 'none'
}

/**
 * The profile panel's action beside ⋯ (C-50, D-110): a Tag one cannot click
 * ("Bạn bè", "Đã gửi lời mời", "Đã chặn"), or the one real button: "Kết bạn"
 * to someone I have nothing with, "Chấp nhận" to someone who asked me
 * (02 S-CHAT-05 `request-received`, Từ chối in ⋯).
 */
export type ProfileAction = { tag: 'friend' | 'outgoing' | 'blocked' } | { button: 'request' | 'accept' }

export function profileAction(type: RelationshipType): ProfileAction {
    switch (type) {
        case 'friend':
        case 'outgoing':
        case 'blocked':
            return { tag: type }
        case 'incoming':
            return { button: 'accept' }
        default:
            return { button: 'request' }
    }
}

/**
 * What ⋯ undoes after "Sao chép username" (C-50): unfriend, cancel my
 * request, decline theirs or unblock, whichever there is; then "Chặn",
 * except for someone blocked already.
 */
export type ProfileUndo = 'unfriend' | 'cancel' | 'decline' | 'unblock'

export function profileMenu(type: RelationshipType): { undo: ProfileUndo | null; block: boolean } {
    const undo: Record<RelationshipType, ProfileUndo | null> = {
        friend: 'unfriend',
        outgoing: 'cancel',
        incoming: 'decline',
        blocked: 'unblock',
        none: null
    }
    return { undo: undo[type], block: type !== 'blocked' }
}

/**
 * The strip under a DM's Header (S-DM-03 `not-friend`, D-251): only while I
 * may message them and we are not friends: nothing between us, my request,
 * or theirs. Never where the composer is locked or the account is gone (the
 * frame `cannot-message` has none), nor for someone I blocked (their strip
 * takes the composer's place).
 */
export type FriendStripKind = 'none' | 'outgoing' | 'incoming'

export function friendStrip(standing: DmStanding, type: RelationshipType | null): FriendStripKind | null {
    if (standing !== 'open') return null
    return type === 'none' || type === 'outgoing' || type === 'incoming' ? type : null
}
