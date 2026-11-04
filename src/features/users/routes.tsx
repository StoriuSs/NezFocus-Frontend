import { lazy } from 'react'
import { Outlet, RouteObject } from 'react-router-dom'
import { ProtectedRoute } from '@/features/auth'
import { USERS_PATHS } from './lib/paths'

const Profile = lazy(() => import('@/features/users/pages/Profile'))

/** The users feature's routes, all behind sign-in. */
export const usersRoutes: RouteObject[] = [
    {
        element: (
            <ProtectedRoute>
                <Outlet />
            </ProtectedRoute>
        ),
        children: [{ path: USERS_PATHS.profile, element: <Profile /> }]
    }
]
