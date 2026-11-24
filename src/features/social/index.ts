/**
 * What other features and the app may use from social. The AppShell reads
 * the relationships as the app opens (`useRelationships`, kept live by the
 * socket) and lends the block list to the Privacy page; the messages column
 * shows the requests waiting; the inbox answers a request with the same
 * hooks as the Friends page (D-248). Keep page-only modules out: this index
 * is in the AppShell's download.
 */
export { relationshipsQuery, useIncomingRequestCount, useRelationships } from './api/useRelationships'
export { useAcceptFriendRequest, useRemoveRelationship } from './api/useRelationshipActions'
export { friendsPath, isMessagesPath, SOCIAL_PATHS } from './lib/paths'
export type { FriendsTab, Relationship } from './types'
