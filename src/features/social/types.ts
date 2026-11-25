import type { ApiModel } from '@/lib/api-types'

/**
 * A person and where they stand with me (D-237, D-242), as
 * `GET /me/relationships` lists them: `friend`, a request `incoming` or
 * `outgoing`, someone I `blocked`; `none` only in the answer to a change
 * (the person left the list). Presence and the study activity for friends only.
 */
export type Relationship = ApiModel<'RelationshipResponseDto'>
export type RelationshipType = Relationship['type']
/** Who a relationship is with: no username nor name for an account deleted or waiting to be (D-243). */
export type SocialPerson = ApiModel<'SocialPersonResponseDto'>
/** What others see of someone (REQ-AUTH-07): online, away, do not disturb, offline (or hidden). */
export type Presence = NonNullable<Relationship['presence']>
/** Someone looked up by username (D-110): the card of the Add friend dialog. */
export type PersonProfile = ApiModel<'PersonProfileResponseDto'>
export type RelationshipList = ApiModel<'RelationshipListResponseDto'>
export type SendFriendRequest = ApiModel<'SendFriendRequestRequestDto'>

/** The four tabs of the Friends page (S-DM-02), in their order. */
export const FRIENDS_TABS = ['online', 'all', 'pending', 'blocked'] as const
export type FriendsTab = (typeof FRIENDS_TABS)[number]

/** The two lists of the Pending tab (D-110): requests to me, and mine. */
export type PendingSide = 'incoming' | 'outgoing'

/** `relationship.added` / `relationship.updated` (SRS 5.2): the entry as the list shows it. */
export interface RelationshipChanged {
    relationship: Relationship
}

/** `relationship.removed`: whom the list no longer has. */
export interface RelationshipRemoved {
    userId: string
}

/** `presence.updated`: what others now see of someone. */
export interface PresenceUpdated {
    userId: string
    status: Presence
}

/**
 * `activity.updated` (SRS 5.2, D-240): what someone studies now, the same
 * for every viewer; null when they show nothing (hidden, the switch off, in a
 * call, nowhere).
 */
export interface ActivityUpdated {
    userId: string
    activity: Relationship['activity']
}

/**
 * A DM in my list (S-DM-01, D-242, D-244): its channel id (`id`: the
 * messages, pins and reads go through the channel routes), the other one,
 * the last message, whether I may message them now, and their presence and
 * activity where I see them. Unread counts are the read states' (messaging).
 */
export type Dm = ApiModel<'DmResponseDto'>
export type DmLastMessage = ApiModel<'DmLastMessageResponseDto'>
export type DmList = ApiModel<'DmListResponseDto'>

/** `dm.created` (SRS 5.2): a DM I just opened, as my list shows it. */
export interface DmCreated {
    dm: Dm
}

/** `dm.updated`: my side changed (opened again, closed in another tab); `shown`, whether it is in my list now. */
export interface DmUpdated {
    dm: Dm
    shown: boolean
}
