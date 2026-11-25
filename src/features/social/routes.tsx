import { lazy } from 'react'
import { RouteObject } from 'react-router-dom'
// Not through index.ts: the router is in the first download, the feature's
// index is not (docs/code-splitting.md).
import { SOCIAL_PATHS } from './lib/paths'

const Friends = lazy(() => import('@/features/social/pages/Friends'))
const DirectMessage = lazy(() => import('@/features/social/pages/DirectMessage'))

/**
 * The Friends page (S-DM-02) and a DM (S-DM-03, a link to one of its
 * messages too), for a signed-in user (the router puts them in the
 * AppShell, with the messages column).
 */
export const socialRoutes: RouteObject[] = [
    { path: SOCIAL_PATHS.friends, element: <Friends /> },
    { path: SOCIAL_PATHS.dm, element: <DirectMessage /> },
    { path: SOCIAL_PATHS.dmMessage, element: <DirectMessage /> }
]
