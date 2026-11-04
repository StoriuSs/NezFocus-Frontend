import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import '@/i18n'
import { mockAuthStore } from '@/test/helpers'

const authState = { isAuthenticated: false, isSigningOut: false }

vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))

const { ProtectedRoute, GuestOnlyRoute } = await import('@/features/auth/components/ProtectedRoute')

function renderAt(path: string) {
    const router = createMemoryRouter(
        [
            { path: '/', element: <p>Home</p> },
            {
                path: '/sign-in',
                element: (
                    <GuestOnlyRoute>
                        <p>Sign-in form</p>
                    </GuestOnlyRoute>
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

describe('route guards', () => {
    beforeEach(() => {
        authState.isAuthenticated = false
        authState.isSigningOut = false
    })

    it('sends a signed-out visitor to sign in, with the whole address to come back to', async () => {
        const router = renderAt('/profile?tab=avatar#top')

        expect(await screen.findByText('Sign-in form')).toBeInTheDocument()
        expect(screen.queryByText('Profile')).not.toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/sign-in')
        expect(new URLSearchParams(router.state.location.search).get('redirect')).toBe('/profile?tab=avatar#top')
    })

    it('sends a signed-in user on from sign-in, but never to another site', async () => {
        authState.isAuthenticated = true
        renderAt('/sign-in?redirect=https%3A%2F%2Fevil.example%2F')
        expect(await screen.findByText('Home')).toBeInTheDocument()
    })
})
