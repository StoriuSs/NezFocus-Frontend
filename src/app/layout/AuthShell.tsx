import { lazy, Suspense, useEffect } from 'react'
import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { LogoLockup } from '@/components/brand/Logo'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LanguageToggle } from '@/components/LanguageToggle'
import { PageLoader } from '@/components/PageLoader'
import { Button } from '@/components/ui/button'
import { AUTH_PATHS, useAuthStore } from '@/features/auth'
import { BrandPanel } from './BrandPanel'

// Only on a page reached from an invite: kept out of the first download.
const PendingInviteBanner = lazy(() => import('@/features/servers/components/invites/PendingInviteBanner'))

/**
 * The layout of every page outside the app (C-34): signing up, the code,
 * signing in, a new password, finishing the account. Only the 400-wide form
 * block changes from step to step, so a flow of several pages stands still.
 *
 * From 1024: two halves, the form column and the brand panel. Below: the
 * form column alone. The form block is centred vertically while it fits and
 * anchored at the top when longer; then only the middle scrolls, the logo and
 * the language switch stay put.
 */
export default function AuthShell() {
    const { t } = useTranslation()
    const { pathname } = useLocation()
    const [params] = useSearchParams()
    // An invite waiting through signing up or in (01 › Lời mời đang chờ).
    const invite = params.get('invite')
    const { reset: resetQueryErrors } = useQueryErrorResetBoundary()
    const logout = useAuthStore((state) => state.logout)
    // "Complete your account" may be for the wrong account: a way out (S-ONB-01).
    const signOutHere = pathname === AUTH_PATHS.welcome

    // Most visitors here are about to sign in: fetch the app's frame and its
    // home page once the browser is idle, so signing in does not wait for
    // them. The same modules as the router's lazy routes, so the same files.
    useEffect(() => {
        const load = () => {
            void import('@/app/layout/app-shell/AppShell')
            void import('@/pages/Study')
        }
        if ('requestIdleCallback' in window) {
            const id = window.requestIdleCallback(load)
            return () => window.cancelIdleCallback(id)
        }
        const timer = setTimeout(load, 1000)
        return () => clearTimeout(timer)
    }, [])

    return (
        <div className='flex h-dvh bg-bg'>
            {/* basis-1/2 like the panel's: two equal halves from 1024; alone (narrower), it grows to the full width. */}
            <div className='flex min-w-0 flex-1 basis-1/2 flex-col'>
                <header className='shrink-0 p-6 lg:p-8'>
                    <Link
                        to='/'
                        aria-label={t('authShell.home')}
                        className='inline-flex rounded-input transition-opacity duration-micro hover:opacity-80'
                    >
                        <LogoLockup />
                    </Link>
                </header>
                <main className='flex min-h-0 flex-1 flex-col overflow-y-auto px-4'>
                    <div className='mx-auto my-auto w-full max-w-[400px] py-6'>
                        <ErrorBoundary key={pathname} onReset={resetQueryErrors}>
                            {invite ? (
                                <Suspense fallback={null}>
                                    <PendingInviteBanner code={invite} finishing={pathname === AUTH_PATHS.welcome} />
                                </Suspense>
                            ) : null}
                            <Suspense fallback={<PageLoader className='min-h-40' />}>
                                <Outlet />
                            </Suspense>
                        </ErrorBoundary>
                    </div>
                </main>
                <footer className='flex shrink-0 items-center justify-between gap-2 px-3 pb-4 lg:px-5 lg:pb-6'>
                    <LanguageToggle />
                    {signOutHere ? (
                        <Button variant='text' size='sm' onClick={() => logout()}>
                            {t('authShell.signOut')}
                        </Button>
                    ) : null}
                </footer>
            </div>
            <BrandPanel className='hidden lg:block' />
        </div>
    )
}
