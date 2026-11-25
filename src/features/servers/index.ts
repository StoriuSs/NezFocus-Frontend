import { lazy } from 'react'

/**
 * What the rest of the app uses of the servers feature. The dialog and the
 * channel page are loaded lazily from their files.
 */
export { useServers } from './api/useServers'
export { useCreateServerDialog } from './create-server.store'
export { useChannelDialogs } from './channel-dialogs.store'
export { ServerChannelColumn } from './components/channel-list/ServerChannelColumn'
export { MyTasksColumn } from './components/MyTasksColumn'
export { useInboxPlaces } from './hooks/useInboxPlaces'
export { useChatLinks } from './hooks/useChatLinks'
export { useRoomLookup } from './hooks/useRoomLookup'
export { NoServers } from './components/NoServers'
/** The Study page's rooms studying now (08 S-STUDY-01), lazy: it brings the `study` words; shown inside a Suspense. */
export const LiveRooms = lazy(() => import('./components/live-rooms/LiveRooms'))
export { RoomDock } from './components/RoomDock'
export { JoinedSessionCues } from './components/JoinedSessionCues'
export { useVoiceRooms } from './hooks/useVoiceRooms'
export { useJoinedSession } from './hooks/useJoinedSession'
export { useStudyingRoom } from './hooks/useStudyingRoom'
export { ServerIcon } from './components/ServerIcon'
export { ServerMenuItems } from './components/ServerMenuItems'
export { channelGroups, firstTextChannel, type ChannelGroup } from './lib/channel-list'
export { can, type PermissionName } from './lib/permissions'
export { channelPath, serverSettingsPath, SERVERS_PATHS } from './lib/paths'
export { settingsSections, type SettingsSection } from './lib/settings-sections'
export type { Server, ServerCategory, ServerChannel } from './types'
