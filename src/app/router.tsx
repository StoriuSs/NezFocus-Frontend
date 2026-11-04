import { lazy } from 'react'
import { createBrowserRouter, Outlet } from 'react-router-dom'

import MainLayout from '@/app/layout/MainLayout'
import { NavigationProgress } from '@/components/NavigationProgress'
import { RouteErrorPage } from '@/components/RouteErrorPage'
import { UsernamePromptWrapper } from '@/features/users/components/UsernamePromptWrapper'

import { publicRoutes } from './public-routes'
import { usersRoutes } from '@/features/users/routes'
import { authRoutes } from '@/features/auth/routes'

// Lazy-loaded fallback for 404
const NotFound = lazy(() => import('@/pages/NotFound'))

// Global root: app-wide widgets that sit outside any layout
function AppRoot() {
    return (
        <>
            <NavigationProgress />
            <UsernamePromptWrapper />
            <Outlet />
        </>
    )
}

/**
 * Error handling is two-tier:
 *  - MainLayout wraps its page outlet in an ErrorBoundary, so a crashing page
 *    shows an error in place while the header and navigation keep working.
 *  - `errorElement` on the root catches whatever escapes that — a crash in the
 *    layout itself — with a standalone full-page screen.
 */
export const router = createBrowserRouter([
    {
        element: <AppRoot />,
        errorElement: <RouteErrorPage />,
        children: [
            {
                element: <MainLayout />,
                children: [...publicRoutes, ...authRoutes, ...usersRoutes, { path: '*', element: <NotFound /> }]
            }
        ]
    }
])
