import { lazy } from 'react'
import { RouteObject } from 'react-router-dom'
// Not through index.ts: the router is in the first download, the feature's
// index is not (docs/code-splitting.md).
import { SERVERS_PATHS } from './lib/paths'

const ChannelPage = lazy(() => import('@/features/servers/pages/ChannelPage'))
const ServerSettingsPage = lazy(() => import('@/features/servers/pages/ServerSettingsPage'))
const InvitePage = lazy(() => import('@/features/servers/pages/InvitePage'))

/** An invite (S-SRV-03): a visitor's page, so the router puts it in the AuthShell; signed in, it opens the app. */
export const serversInviteRoutes: RouteObject[] = [{ path: SERVERS_PATHS.invite, element: <InvitePage /> }]

/** A server's channels, for a signed-in user (the router puts them in the AppShell). */
export const serversChannelRoutes: RouteObject[] = [{ path: SERVERS_PATHS.channel, element: <ChannelPage /> }]

/** A server's settings, for a signed-in user (the router puts them in the AppShell). */
export const serversSettingsRoutes: RouteObject[] = [
    { path: SERVERS_PATHS.settings, element: <ServerSettingsPage /> },
    { path: SERVERS_PATHS.roleEdit, element: <ServerSettingsPage /> }
]
