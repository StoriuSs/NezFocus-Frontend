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
