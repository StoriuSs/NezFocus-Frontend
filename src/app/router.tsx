import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router-dom'

import { NavigationProgress } from '@/components/NavigationProgress'
import { PageLoader } from '@/components/PageLoader'
import { RouteErrorPage } from '@/components/RouteErrorPage'
import type { ShellHandle } from '@/components/shell/shell-context'
import { useAuthStore } from '@/features/auth/auth.store'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { AUTH_PATHS } from '@/features/auth/lib/paths'
import { authAppRoutes, authRoutes } from '@/features/auth/routes'
import { usersRoutes } from '@/features/users/routes'

// The two layouts load lazily, each with its own pages: a visitor on the
// sign-in page does not download the AppShell, and the reverse.
const AuthShell = lazy(() => import('@/app/layout/AuthShell'))
const AppShell = lazy(() => import('@/app/layout/app-shell/AppShell'))
const ChannelPage = lazy(() => import('@/features/servers/pages/ChannelPage'))
const ServerSettingsPage = lazy(() => import('@/features/servers/pages/ServerSettingsPage'))
const InvitePage = lazy(() => import('@/features/servers/pages/InvitePage'))
const Study = lazy(() => import('@/pages/Study'))
const Legal = lazy(() => import('@/pages/Legal'))
const NotFound = lazy(() => import('@/pages/NotFound'))

// Global root: app-wide widgets that sit outside any layout
function AppRoot() {
    return (
        <>
            <NavigationProgress />
            <Suspense fallback={<PageLoader />}>
                <Outlet />
            </Suspense>
        </>
    )
}

/**
 * `/`: the Study page when signed in (D-124), sign-in otherwise. The public
 * home page takes `/` in M7 (D-127); until then a visitor goes to sign in.
 */
function Home() {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    return <Navigate to={isAuthenticated ? '/study' : AUTH_PATHS.signIn} replace />
}

const column = (name: ShellHandle['column']) => (routes: RouteObject[]) =>
    routes.map((route) => ({ ...route, handle: { column: name } satisfies ShellHandle }))

/**
 * Error handling is two-tier:
 *  - each layout wraps its page outlet in an ErrorBoundary, so a crashing
 *    page shows an error in place while the rail or the logo keep working.
 *  - `errorElement` on the root catches whatever escapes that — a crash in a
 *    layout itself — with a standalone full-page screen.
 */
export const router = createBrowserRouter([
    {
        element: <AppRoot />,
        errorElement: <RouteErrorPage />,
        children: [
            { path: '/', element: <Home /> },
            // The public text pages (S-PUB-02, D-127): for everyone, signed in or not.
            { path: '/terms', element: <Legal document='terms' /> },
            { path: '/privacy', element: <Legal document='privacy' /> },
            // An invite (S-SRV-03): a visitor's page in the AuthShell; signed in, it opens the app.
            { element: <AuthShell />, children: [...authRoutes, { path: '/invite/:code', element: <InvitePage /> }] },
            {
                element: (
                    <ProtectedRoute>
                        <AppShell />
                    </ProtectedRoute>
                ),
                children: [
                    ...column('study')([{ path: '/study', element: <Study /> }]),
                    ...column('server')([{ path: '/channels/:serverId/:channelId?', element: <ChannelPage /> }]),
                    ...column('serverSettings')([
                        { path: '/servers/:serverId/settings/:section?', element: <ServerSettingsPage /> },
                        { path: '/servers/:serverId/settings/:section/:roleId', element: <ServerSettingsPage /> }
                    ]),
                    ...column('settings')([...authAppRoutes, ...usersRoutes])
                ]
            },
            { path: '*', element: <NotFound /> }
        ]
    }
])
