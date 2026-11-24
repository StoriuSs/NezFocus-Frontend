import { lazy } from 'react'
import { RouteObject } from 'react-router-dom'
// Not through index.ts: the router is in the first download, the feature's
// index is not (docs/code-splitting.md).
import { SOCIAL_PATHS } from './lib/paths'

const Friends = lazy(() => import('@/features/social/pages/Friends'))

/** The Friends page (S-DM-02), for a signed-in user (the router puts it in the AppShell, with the messages column). */
export const socialRoutes: RouteObject[] = [{ path: SOCIAL_PATHS.friends, element: <Friends /> }]
