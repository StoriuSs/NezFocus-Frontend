import { lazy } from 'react'
import { RouteObject } from 'react-router-dom'
import { USERS_PATHS } from './lib/paths'
import type { PreferencesPage } from './pages/Preferences'

const Profile = lazy(() => import('@/features/users/pages/Profile'))
// Appearance, Notifications and Privacy share one chunk (pages/Preferences.tsx).
const Preferences = lazy(() => import('@/features/users/pages/Preferences'))
const PREFERENCES: readonly PreferencesPage[] = ['appearance', 'notifications', 'privacy']

/** The users feature's pages, for a signed-in user (the router puts them in the AppShell). */
export const usersRoutes: RouteObject[] = [
    { path: USERS_PATHS.profile, element: <Profile /> },
    ...PREFERENCES.map((page) => ({ path: USERS_PATHS[page], element: <Preferences page={page} /> }))
]
