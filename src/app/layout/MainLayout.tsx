import { Suspense } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { Zap, LogOut, User, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { PageLoader } from '@/components/PageLoader'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAuthStore } from '@/features/auth/auth.store'
import { AUTH_PATHS, isSignInFlowPage, signInPath } from '@/features/auth/lib/paths'
import { useProfile } from '@/features/users/api/useProfile'
import { useAvatarErrorRefresh } from '@/features/users/hooks/useAvatarErrorRefresh'
import { USERS_PATHS } from '@/features/users'
import { siteConfig } from '@/config/site'

export default function MainLayout() {
    const logout = useAuthStore((state) => state.logout)
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const authUser = useAuthStore((state) => state.user)
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const { reset: resetQueryErrors } = useQueryErrorResetBoundary()
    const { t } = useTranslation()

    // Fresh profile data including avatar and display name — the same query
    // (and cache entry) the Profile page and username prompt use.
    const { data: profile } = useProfile(isAuthenticated)

    // The profile query; until it loads, the store's copy (from /users/me at
    // sign-in). Without a display name, the username stands in.
    const displayName = profile?.displayName || authUser?.username
    const username = profile?.username || authUser?.username
    const avatarUrl = profile?.avatarUrl
    const refreshAvatar = useAvatarErrorRefresh(avatarUrl)
    const userInitials = displayName?.slice(0, 2).toUpperCase() || 'U'

    const handleLogout = () => {
        toast.info(t('toasts.loggingOut'))
        logout()
    }

    return (
        <div className='flex min-h-screen flex-col bg-background font-sans antialiased'>
            <header className='sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
                <div className='container flex h-14 items-center justify-between'>
                    <Link to='/' className='flex items-center gap-2 font-bold transition-colors hover:text-primary'>
                        <Zap className='h-6 w-6 text-primary fill-primary/20' />
                        <span className='hidden sm:inline-block'>{siteConfig.shortName}</span>
                    </Link>

                    <nav className='flex items-center gap-2'>
                        <LanguageSwitcher />
                        <ThemeSwitcher />

                        <Button asChild variant='ghost' size='sm' className='text-muted-foreground hover:text-primary'>
                            <Link to='/form'>{t('nav.formExample')}</Link>
                        </Button>

                        {isAuthenticated ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant='ghost'
                                        className='relative h-8 w-8 rounded-full'
                                        aria-label={t('nav.accountMenu')}
                                    >
                                        <Avatar className='h-8 w-8 transition-opacity hover:opacity-80'>
                                            <AvatarImage
                                                src={avatarUrl ?? undefined}
                                                alt={displayName}
                                                onLoadingStatusChange={(status) =>
                                                    status === 'error' && refreshAvatar()
                                                }
                                                className='object-cover'
                                            />
                                            <AvatarFallback className='bg-primary/10 text-primary font-bold'>
                                                {userInitials}
                                            </AvatarFallback>
                                        </Avatar>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className='w-56' align='end' forceMount>
                                    <DropdownMenuLabel className='font-normal'>
                                        <div className='flex flex-col space-y-1'>
                                            <p className='text-sm font-medium leading-none'>{displayName}</p>
                                            <p className='text-xs leading-none text-muted-foreground'>@{username}</p>
                                        </div>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => navigate(USERS_PATHS.profile)}
                                        className='cursor-pointer'
                                    >
                                        <User className='mr-2 h-4 w-4' />
                                        <span>{t('nav.profile')}</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => navigate(AUTH_PATHS.settings)}
                                        className='cursor-pointer'
                                    >
                                        <Settings className='mr-2 h-4 w-4' />
                                        <span>{t('nav.settings')}</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={handleLogout}
                                        className='cursor-pointer text-destructive focus:text-destructive'
                                    >
                                        <LogOut className='mr-2 h-4 w-4' />
                                        <span>{t('buttons.logout')}</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <Button asChild size='sm' className='font-semibold'>
                                {/* Back to this page after signing in, unless it is the home
                                    page or one of the sign-in pages themselves. */}
                                <Link
                                    to={
                                        pathname === '/' || isSignInFlowPage(pathname)
                                            ? AUTH_PATHS.signIn
                                            : signInPath(pathname)
                                    }
                                >
                                    {t('buttons.signIn')}
                                </Link>
                            </Button>
                        )}
                    </nav>
                </div>
            </header>
            <main className='flex-1'>
                {/* The boundary sits inside the layout so a page crash keeps the
                    header usable, and is keyed by path so navigating away clears it. */}
                <ErrorBoundary key={pathname} onReset={resetQueryErrors}>
                    <Suspense fallback={<PageLoader />}>
                        <Outlet />
                    </Suspense>
                </ErrorBoundary>
            </main>
        </div>
    )
}
