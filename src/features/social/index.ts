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
export { relationshipsQuery, useBlockedIds, useIncomingRequestCount, useRelationships } from './api/useRelationships'
export { useAcceptFriendRequest, useRemoveRelationship } from './api/useRelationshipActions'
export { useDms } from './api/useDms'
export { useMessagePerson } from './api/useDmActions'
export { DmList } from './components/DmList'
export { connectChatLinks, type ChatLinks } from './lib/chat-links'
/** Someone's study activity (C-30, D-252): its line in a row, its block in a profile; their room through `RoomLookup`. */
export { ActivityBlock, ActivityLine } from './components/ActivityLine'
export { activityShown, type Activity } from './lib/activity-line'
export { connectRoomLookup, type RoomLookup, type SeenRoom } from './lib/room-lookup'
export { messagesPlace, rememberMessagesPlace } from './lib/messages-place'
export { dmPath, friendsPath, isMessagesPath, messagesPlaceOf, SOCIAL_PATHS } from './lib/paths'
export type { ActivityUpdated, FriendsTab, Relationship } from './types'
