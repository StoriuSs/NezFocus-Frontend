import { lazy } from 'react'
import { RouteObject } from 'react-router-dom'
import { AUTH_PATHS } from '@/features/auth/lib/paths'
import { GuestOnlyRoute, ProtectedRoute } from '@/features/auth/components/ProtectedRoute'

const SignIn = lazy(() => import('@/features/auth/pages/SignIn'))
const SignUp = lazy(() => import('@/features/auth/pages/SignUp'))
const VerifyEmail = lazy(() => import('@/features/auth/pages/VerifyEmail'))
const ForgotPassword = lazy(() => import('@/features/auth/pages/ForgotPassword'))
const ResetPassword = lazy(() => import('@/features/auth/pages/ResetPassword'))
const TwoStep = lazy(() => import('@/features/auth/pages/TwoStep'))
const Settings = lazy(() => import('@/features/auth/pages/Settings'))
const OAuthCallback = lazy(() => import('@/features/auth/pages/OAuthCallback'))

const guestOnly = (element: React.ReactNode) => <GuestOnlyRoute>{element}</GuestOnlyRoute>
/** Pages emails link to: a signed-in reader is told, not bounced home. */
const guestOnlyExplained = (element: React.ReactNode) => <GuestOnlyRoute explainIfSignedIn>{element}</GuestOnlyRoute>

/** The auth feature's routes: the sign-in pages for visitors, and settings for a signed-in user. */
export const authRoutes: RouteObject[] = [
    { path: AUTH_PATHS.signIn, element: guestOnly(<SignIn />) },
    { path: AUTH_PATHS.signUp, element: guestOnly(<SignUp />) },
    { path: AUTH_PATHS.verifyEmail, element: guestOnly(<VerifyEmail />) },
    { path: AUTH_PATHS.forgotPassword, element: guestOnlyExplained(<ForgotPassword />) },
    { path: AUTH_PATHS.resetPassword, element: guestOnlyExplained(<ResetPassword />) },
    { path: AUTH_PATHS.twoStep, element: guestOnly(<TwoStep />) },
    // Not guest-only: it is the page that makes the visitor signed in.
    { path: AUTH_PATHS.oauthCallback, element: <OAuthCallback /> },
    {
        path: AUTH_PATHS.settings,
        element: (
            <ProtectedRoute>
                <Settings />
            </ProtectedRoute>
        )
    }
]
