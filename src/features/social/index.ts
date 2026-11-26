/**
 * What other features and the app may use from social. The AppShell reads
 * the relationships and the DMs as the app opens (`useRelationships`,
 * `useDms`, kept live by the socket), lends the block list to the Privacy
 * page and connects how a DM's chat reads links (`connectChatLinks`, D-249);
 * the messages column shows the requests waiting and the DMs (`DmList`); the
 * rail's 💬 goes to the last place of the messages area; the inbox answers a
 * request with the same hooks as the Friends page (D-248) and opens a DM
 * with "Message" (`useMessagePerson`). Keep page-only modules out: this
 * index is in the AppShell's download.
 */
export {
    relationshipsQuery,
    useBlockedIds,
    useFriendIds,
    useIncomingRequestCount,
    useRelationships
} from './api/useRelationships'
export { useAcceptFriendRequest, useRemoveRelationship } from './api/useRelationshipActions'
export { useDms } from './api/useDms'
export { useMessagePerson } from './api/useDmActions'
export { DmList } from './components/DmList'
export { connectChatLinks, type ChatLinks } from './lib/chat-links'
/** Someone's study activity (C-30, D-252): its line in a row, its block in a profile; their room through `RoomLookup`. */
export { ActivityBlock, ActivityLine } from './components/ActivityLine'
export { activityShown, type Activity } from './lib/activity-line'
/** The name someone shows by: their display name, else their username; none once deleted (D-108, D-182). */
export { nameOf } from './lib/friends-list'
export { connectRoomLookup, type RoomLookup, type SeenRoom } from './lib/room-lookup'
/**
 * The profile popover's parts (S-CHAT-05, D-253), drawn by the servers
 * feature: someone's profile, where one stands with them and what one can
 * do about it (the DM's profile panel's row, its questions), their avatar.
 */
export { usePersonProfile } from './api/usePersonProfile'
export { usePersonMoves } from './hooks/usePersonMoves'
export { ProfileActions } from './components/ProfileActions'
export { ConfirmRelationshipDialog, type ConfirmKind } from './components/ConfirmRelationshipDialog'
export { PersonAvatar } from './components/PersonAvatar'
export { relationshipWith } from './lib/dm-profile'
export { isGone } from './lib/dm-chat'
export { messagesPlace, rememberMessagesPlace } from './lib/messages-place'
export { dmPath, friendsPath, isMessagesPath, messagesPlaceOf, SOCIAL_PATHS } from './lib/paths'
/**
 * 1-1 calls (09 S-CALL-01 / 02, D-255): `CallWatch`, mounted once by the
 * AppShell (my calls kept live, the incoming card, the ring, the tab's
 * title, a reload going back in); the call's dock (C-09 `call`), over the
 * Solo's in the list column and the strips. The card and the dock are lazy.
 */
export { CallWatch } from './components/call/CallWatch'
export { CallDockSlot } from './components/call/CallDockSlot'
export type { ActivityUpdated, FriendsTab, PersonProfile, Relationship, SocialPerson } from './types'
