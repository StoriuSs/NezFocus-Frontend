import { lazy } from 'react'
import { RouteObject } from 'react-router-dom'
import { AUTH_PATHS } from '@/features/auth/lib/paths'
import { GuestOnlyRoute, IncompleteOnlyRoute } from '@/features/auth/components/ProtectedRoute'

const SignIn = lazy(() => import('@/features/auth/pages/SignIn'))
const Register = lazy(() => import('@/features/auth/pages/Register'))
const Verify = lazy(() => import('@/features/auth/pages/Verify'))
const Welcome = lazy(() => import('@/features/auth/pages/Welcome'))
const ForgotPassword = lazy(() => import('@/features/auth/pages/ForgotPassword'))
const ResetPassword = lazy(() => import('@/features/auth/pages/ResetPassword'))
const Settings = lazy(() => import('@/features/auth/pages/Settings'))
const OAuthCallback = lazy(() => import('@/features/auth/pages/OAuthCallback'))

const guestOnly = (element: React.ReactNode) => <GuestOnlyRoute>{element}</GuestOnlyRoute>
/** Pages emails link to: a signed-in reader is told, not bounced home. */
const guestOnlyExplained = (element: React.ReactNode) => <GuestOnlyRoute explainIfSignedIn>{element}</GuestOnlyRoute>

/** The pages outside the app (the router puts them in the AuthShell). */
export const authRoutes: RouteObject[] = [
    { path: AUTH_PATHS.signIn, element: guestOnly(<SignIn />) },
    { path: AUTH_PATHS.register, element: guestOnly(<Register />) },
    { path: AUTH_PATHS.verify, element: guestOnly(<Verify />) },
    // Signed in, not yet complete: the one page such an account may open (D-61).
    {
        path: AUTH_PATHS.welcome,
        element: (
            <IncompleteOnlyRoute>
                <Welcome />
            </IncompleteOnlyRoute>
        )
    },
    { path: AUTH_PATHS.forgotPassword, element: guestOnlyExplained(<ForgotPassword />) },
    { path: AUTH_PATHS.resetPassword, element: guestOnlyExplained(<ResetPassword />) },
    // Not guest-only: it is the page that makes the visitor signed in.
    { path: AUTH_PATHS.oauthCallback, element: <OAuthCallback /> }
]

/** The auth feature's pages inside the app, for a signed-in user (the router puts them in the AppShell). */
export const authAppRoutes: RouteObject[] = [{ path: AUTH_PATHS.settings, element: <Settings /> }]
