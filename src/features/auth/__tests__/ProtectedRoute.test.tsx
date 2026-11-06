import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import '@/i18n'
import { mockAuthStore } from '@/test/helpers'

const authState = { isAuthenticated: false, isComplete: true, isSigningOut: false }

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

    it('sends a visitor from /welcome to sign in, and a completed account on to next', async () => {
        let router = renderAt('/welcome?invite=abc')
        expect(await screen.findByText('Sign-in form')).toBeInTheDocument()
        expect(query(router).get('invite')).toBe('abc')

        authState.isAuthenticated = true
        router = renderAt('/welcome?next=%2Fprofile')
        expect(await screen.findByText('Profile')).toBeInTheDocument()
    })
})
