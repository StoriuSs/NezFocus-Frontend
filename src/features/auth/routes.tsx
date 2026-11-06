import { lazy } from 'react'
import { RouteObject } from 'react-router-dom'
import { AUTH_PATHS } from '@/features/auth/lib/paths'
import { GuestOnlyRoute } from '@/features/auth/components/ProtectedRoute'

const SignIn = lazy(() => import('@/features/auth/pages/SignIn'))
const SignUp = lazy(() => import('@/features/auth/pages/SignUp'))
const VerifyEmail = lazy(() => import('@/features/auth/pages/VerifyEmail'))
const ForgotPassword = lazy(() => import('@/features/auth/pages/ForgotPassword'))
const ResetPassword = lazy(() => import('@/features/auth/pages/ResetPassword'))
const Settings = lazy(() => import('@/features/auth/pages/Settings'))
const OAuthCallback = lazy(() => import('@/features/auth/pages/OAuthCallback'))

const guestOnly = (element: React.ReactNode) => <GuestOnlyRoute>{element}</GuestOnlyRoute>
/** Pages emails link to: a signed-in reader is told, not bounced home. */
const guestOnlyExplained = (element: React.ReactNode) => <GuestOnlyRoute explainIfSignedIn>{element}</GuestOnlyRoute>

/** The sign-in pages, for visitors (the router puts them in the AuthShell). */
export const authRoutes: RouteObject[] = [
    { path: AUTH_PATHS.signIn, element: guestOnly(<SignIn />) },
    { path: AUTH_PATHS.signUp, element: guestOnly(<SignUp />) },
    { path: AUTH_PATHS.verifyEmail, element: guestOnly(<VerifyEmail />) },
    { path: AUTH_PATHS.forgotPassword, element: guestOnlyExplained(<ForgotPassword />) },
    { path: AUTH_PATHS.resetPassword, element: guestOnlyExplained(<ResetPassword />) },
    // Not guest-only: it is the page that makes the visitor signed in.
    { path: AUTH_PATHS.oauthCallback, element: <OAuthCallback /> }
]

/** The auth feature's pages inside the app, for a signed-in user (the router puts them in the AppShell). */
export const authAppRoutes: RouteObject[] = [{ path: AUTH_PATHS.settings, element: <Settings /> }]
