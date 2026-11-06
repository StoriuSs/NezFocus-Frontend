import { lazy } from 'react'
import { RouteObject } from 'react-router-dom'
import { USERS_PATHS } from './lib/paths'

const Profile = lazy(() => import('@/features/users/pages/Profile'))

/** The users feature's pages, for a signed-in user (the router puts them in the AppShell). */
export const usersRoutes: RouteObject[] = [{ path: USERS_PATHS.profile, element: <Profile /> }]
