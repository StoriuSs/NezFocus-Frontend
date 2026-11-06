import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageLoader } from '@/components/PageLoader'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/features/auth/auth.store'
import { afterSignIn, AUTH_PATHS, safeNext, signInPath, withFlow } from '@/features/auth/lib/paths'
import { AuthCard } from '@/features/auth/components/AuthCard'

/**
 * Renders its children only for a signed-in user whose account is complete.
 * Anyone else is sent to sign in and brought back to the page they asked for
 * — a deep link to /profile used to land on the home page instead, and
 * sign-in then returned there. An incomplete account goes to "complete your
 * account" first, keeping the page for afterwards (01-auth.md › Điều hướng).
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const isComplete = useAuthStore((state) => state.isComplete)
    const isSigningOut = useAuthStore((state) => state.isSigningOut)
    const { pathname, search, hash } = useLocation()

    if (isAuthenticated && !isComplete) {
        return (
            <Navigate
                to={withFlow(AUTH_PATHS.welcome, new URLSearchParams({ next: `${pathname}${search}${hash}` }))}
                replace
            />
        )
    }
    if (isAuthenticated) return <>{children}</>
    // Signing out reloads the app (at sign-in or at home, auth.store.ts's
    // logout); don't bounce through the sign-in page on the way.
    if (isSigningOut) return <PageLoader />
    return <Navigate to={signInPath(`${pathname}${search}${hash}`)} replace />
}

/**
 * "Complete your account" (S-ONB-01): only for a signed-in account that has
 * not done it. A visitor goes to sign in first; a completed account goes on
 * to `?next=`, or home.
 */
export function IncompleteOnlyRoute({ children }: { children: React.ReactNode }) {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const isComplete = useAuthStore((state) => state.isComplete)
    const isSigningOut = useAuthStore((state) => state.isSigningOut)
    const { search } = useLocation()

    if (isAuthenticated && !isComplete) return <>{children}</>
    if (isAuthenticated) return <Navigate to={safeNext(new URLSearchParams(search).get('next'))} replace />
    if (isSigningOut) return <PageLoader />
    return <Navigate to={withFlow(AUTH_PATHS.signIn, search)} replace />
}

/**
 * The sign-in pages, for someone not signed in. A signed-in user is sent on
 * (01-auth.md › Điều hướng): to "complete your account" if it is not done,
 * else to `?next=` if it is a page on this site, otherwise home.
 *
 * `explainIfSignedIn`: for the pages emails link to ("Choose a new password"):
 * opened while signed in, the page says so and offers Settings, or signing
 * out and carrying on, rather than silently going home. Signing in on the
 * page itself (a reset signs in) still moves on as usual.
 */
export function GuestOnlyRoute({
    children,
    explainIfSignedIn = false
}: {
    children: React.ReactNode
    explainIfSignedIn?: boolean
}) {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const isComplete = useAuthStore((state) => state.isComplete)
    const [signedInOnArrival] = useState(isAuthenticated)
    const { search } = useLocation()

    if (!isAuthenticated) return <>{children}</>
    if (explainIfSignedIn && signedInOnArrival) return <SignedInNotice />
    // Signed in on this page: the app's code may still be loading, so show
    // that something is happening rather than an empty form column.
    return (
        <>
            <PageLoader className='min-h-40' />
            <Navigate to={afterSignIn({ completed: isComplete }, search)} replace />
        </>
    )
}

function SignedInNotice() {
    const { t } = useTranslation('auth')
    const email = useAuthStore((state) => state.user?.email)
    const logout = useAuthStore((state) => state.logout)
    const { pathname, search } = useLocation()

    return (
        <AuthCard title={t('signedIn.title')} subtitle={email ? t('signedIn.as', { email }) : undefined}>
            <div className='space-y-4'>
                <p className='text-sm text-muted-foreground'>{t('signedIn.forgotPassword')}</p>
                <div className='flex flex-wrap gap-2'>
                    <Button asChild>
                        <Link to={AUTH_PATHS.settings}>{t('signedIn.settings')}</Link>
                    </Button>
                    <Button variant='outline' onClick={() => logout(undefined, `${pathname}${search}`)}>
                        {t('signedIn.signOut')}
                    </Button>
                </div>
            </div>
        </AuthCard>
    )
}
