import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import '@/i18n'
import { mockAuthStore } from '@/test/helpers'

const authState = {
    isAuthenticated: false,
    isComplete: true,
    isSigningOut: false,
    isLoadingAccount: false,
    deletesAt: null as string | null,
    user: { email: 'ada@example.test' },
    logout: vi.fn(),
    restoreAccount: vi.fn(),
    setRestoreAside: vi.fn()
}

vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))

const { ProtectedRoute, GuestOnlyRoute, IncompleteOnlyRoute } =
    await import('@/features/auth/components/ProtectedRoute')

function renderAt(path: string) {
    const router = createMemoryRouter(
        [
            { path: '/', element: <p>Home</p> },
            { path: '/study', element: <p>Study</p> },
            {
                path: '/login',
                element: (
                    <GuestOnlyRoute>
                        <p>Sign-in form</p>
                    </GuestOnlyRoute>
                )
            },
            {
                path: '/reset-password',
                element: (
                    <GuestOnlyRoute explainIfSignedIn>
                        <p>New password form</p>
                    </GuestOnlyRoute>
                )
            },
            {
                path: '/welcome',
                element: (
                    <IncompleteOnlyRoute>
                        <p>Complete your account</p>
                    </IncompleteOnlyRoute>
                )
            },
            {
                element: (
                    <ProtectedRoute>
                        <Outlet />
                    </ProtectedRoute>
                ),
                children: [{ path: '/profile', element: <p>Profile</p> }]
            }
        ],
        { initialEntries: [path] }
    )
    render(<RouterProvider router={router} />)
    return router
}

const query = (router: ReturnType<typeof renderAt>) => new URLSearchParams(router.state.location.search)

describe('route guards', () => {
    beforeEach(() => {
        authState.isAuthenticated = false
        authState.isComplete = true
        authState.isSigningOut = false
        authState.isLoadingAccount = false
        authState.deletesAt = null
    })

    it('sends a signed-out visitor to sign in, with the whole address to come back to', async () => {
        const router = renderAt('/profile?tab=avatar#top')

        expect(await screen.findByText('Sign-in form')).toBeInTheDocument()
        expect(screen.queryByText('Profile')).not.toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/login')
        expect(query(router).get('next')).toBe('/profile?tab=avatar#top')
    })

    it('sends a signed-in user on from sign-in, but never to another site', async () => {
        authState.isAuthenticated = true
        const router = renderAt('/login?next=https%3A%2F%2Fevil.example%2F')
        // To the app's home, the Study page (D-124).
        expect(await screen.findByText('Study')).toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/study')
    })

    it('keeps the sign-in page, form and all, while it finds out whose account just signed in', async () => {
        // An account waiting to be deleted stays on this page, under a dialog:
        // moving on before the profile says so would lose what was typed.
        authState.isAuthenticated = true
        authState.isLoadingAccount = true
        const router = renderAt('/login?method=password')

        expect(await screen.findByText('Sign-in form')).toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/login')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows that something is happening while signing out, instead of bouncing through sign in', async () => {
        authState.isSigningOut = true
        let router = renderAt('/profile')
        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
        expect(screen.queryByText('Sign-in form')).not.toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/profile')

        router = renderAt('/welcome')
        expect(screen.queryByText('Sign-in form')).not.toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/welcome')
    })

    it('says so on a page an email links to when opened signed in, rather than going home', async () => {
        authState.isAuthenticated = true
        const router = renderAt('/reset-password')

        expect(await screen.findByText("You're already signed in")).toBeInTheDocument()
        expect(screen.queryByText('New password form')).not.toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/reset-password')
    })
    describe('an incomplete account (D-61)', () => {
        beforeEach(() => {
            authState.isAuthenticated = true
            authState.isComplete = false
        })

        it('opens "complete your account" instead of any page of the app, keeping the page for after', async () => {
            const router = renderAt('/profile?tab=avatar')

            expect(await screen.findByText('Complete your account')).toBeInTheDocument()
            expect(screen.queryByText('Profile')).not.toBeInTheDocument()
            expect(query(router).get('next')).toBe('/profile?tab=avatar')
        })

        it('goes from sign-in to "complete your account", keeping next and invite', async () => {
            const router = renderAt('/login?next=%2Fprofile&invite=abc')

            expect(await screen.findByText('Complete your account')).toBeInTheDocument()
            expect(query(router).get('next')).toBe('/profile')
            expect(query(router).get('invite')).toBe('abc')
        })
    })

    describe('an account waiting to be deleted (D-141)', () => {
        beforeEach(() => {
            authState.isAuthenticated = true
            authState.deletesAt = '2026-10-29T14:47:00.000Z'
        })

        it('opens sign in instead of any page of the app, keeping the page for after', async () => {
            const router = renderAt('/profile?tab=avatar')

            expect(await screen.findByText('Sign-in form')).toBeInTheDocument()
            expect(screen.queryByText('Profile')).not.toBeInTheDocument()
            expect(query(router).get('next')).toBe('/profile?tab=avatar')
        })

        it('keeps the sign-in page, under the dialog that offers to restore it', async () => {
            const router = renderAt('/login?next=%2Fprofile')

            // The dialog's code loads on demand: allow the first load of it time.
            expect(
                await screen.findByRole('dialog', { name: 'Your account is waiting to be deleted' }, { timeout: 5000 })
            ).toBeVisible()
            expect(screen.getByText('Sign-in form')).toBeInTheDocument()
            expect(router.state.location.pathname).toBe('/login')
        })
    })

    it('sends a visitor from /welcome to sign in, and a completed account on to next', async () => {
        let router = renderAt('/welcome?invite=abc')
        expect(await screen.findByText('Sign-in form')).toBeInTheDocument()
        expect(query(router).get('invite')).toBe('abc')

        authState.isAuthenticated = true
        router = renderAt('/welcome?next=%2Fprofile')
        expect(await screen.findByText('Profile')).toBeInTheDocument()
    })
})
