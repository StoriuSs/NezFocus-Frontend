import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import i18n from '@/i18n'
import { forgetSignUpPassword } from '@/features/auth/lib/sign-up-password'
import { apiError, mockAuthStore, queryWrapper } from '@/test/helpers'
import { expectNoA11yViolations } from '@/test/a11y'

const authApi = {
    register: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    options: vi.fn(),
    signInMethods: vi.fn()
}
const authState = {
    isAuthenticated: false,
    isSigningOut: false,
    user: null as null | { email: string },
    signIn: vi.fn(),
    startSession: vi.fn(),
    resumeFromCookie: vi.fn(),
    logout: vi.fn()
}
/** No other providers: what most tests run with. */
const OFF = { providers: [] as string[] }
const TOKENS = { accessToken: 'access', tokenType: 'Bearer', expiresIn: 900 }
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }

vi.mock('@/features/auth/api/auth.api', () => ({ authApi }))
vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/config/env', () => ({ env: { VITE_API_URL: 'http://api.test/api/v1' } }))

const { authRoutes } = await import('@/features/auth/routes')
// The routes load each page lazily. Load them all now, so the first test to
// open a page does not spend its findBy timeout (1 s) transforming modules.
await Promise.all(
    ['SignIn', 'SignUp', 'VerifyEmail', 'Settings', 'OAuthCallback'].map(
        (page) => import(`@/features/auth/pages/${page}.tsx`)
    )
)

/** `state` is what the previous auth page handed over (page-state.ts). */
function renderAt(path: string, state?: Record<string, unknown>) {
    const query = path.indexOf('?')
    const pathname = query < 0 ? path : path.slice(0, query)
    const search = query < 0 ? '' : path.slice(query)
    const router = createMemoryRouter(
        [
            { path: '/', element: <p>Home</p> },
            { path: '/study', element: <p>Study</p> },
            { path: '/profile', element: <p>Profile</p> },
            ...authRoutes
        ],
        { initialEntries: [state ? { pathname, search, state } : path] }
    )
    render(<RouterProvider router={router} />, { wrapper: queryWrapper() })
    return router
}

const where = (router: ReturnType<typeof renderAt>) =>
    `${router.state.location.pathname}${router.state.location.search}`
const handedOver = (router: ReturnType<typeof renderAt>) => router.state.location.state

describe('the auth pages', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        for (const fn of [
            ...Object.values(authApi),
            authState.signIn,
            authState.startSession,
            authState.resumeFromCookie,
            authState.logout,
            toast.success,
            toast.error,
            toast.info
        ]) {
            fn.mockReset()
        }
        authState.isAuthenticated = false
        authState.user = null
        authApi.options.mockResolvedValue(OFF)
        authApi.signInMethods.mockResolvedValue({ password: true, providers: [] })
        sessionStorage.clear()
        forgetSignUpPassword()
    })

    describe('accessibility', () => {
        it.each(['/sign-in', '/sign-up'])('%s has no critical or serious problems', async (path) => {
            renderAt(path)
            await screen.findByLabelText('Email')
            await expectNoA11yViolations()
        })
    })

    describe('sign in', () => {
        it('signs in with the address and password, then goes where the visitor was heading', async () => {
            authState.signIn.mockResolvedValue(undefined)
            const router = renderAt('/sign-in?redirect=%2Fprofile')

            await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.test')
            await userEvent.type(screen.getByLabelText('Password'), 'Harbour-Lantern-42')
            await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

            expect(authState.signIn).toHaveBeenCalledWith('ada@example.test', 'Harbour-Lantern-42')
            await waitFor(() => expect(where(router)).toBe('/profile'))
        })

        it('says how long to wait once too many sign-ins for the address failed', async () => {
            authState.signIn.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', {
                    headers: { 'retry-after': '900' },
                    data: { reason: 'sign_ins' }
                })
            )
            renderAt('/sign-in')

            await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.test')
            await userEvent.type(screen.getByLabelText('Password'), 'Harbour-Lantern-42')
            await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Too many failed sign-ins for this address. Try again in 15 minutes, or choose a new password.'
            )
        })

        it('leads an unconfirmed address to the code page, which sends the password with the code', async () => {
            authState.signIn.mockRejectedValue(apiError(403, 'AUTH_EMAIL_NOT_VERIFIED'))
            authApi.verifyEmail.mockResolvedValue(TOKENS)
            const router = renderAt('/sign-in')

            await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.test')
            await userEvent.type(screen.getByLabelText('Password'), 'Harbour-Lantern-42')
            await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

            await waitFor(() => expect(where(router)).toBe('/verify-email'))
            expect(handedOver(router)).toEqual({ email: 'ada@example.test', notice: 'unverified' })

            // The password was right: the confirm page sends it with the code, without asking again.
            const code = await screen.findByLabelText('Code')
            expect(screen.queryByLabelText('Password')).toBeNull()
            await userEvent.type(code, '123456')
            await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
            expect(authApi.verifyEmail).toHaveBeenCalledWith('ada@example.test', '123456', 'Harbour-Lantern-42')
        })
    })

    describe('sign up and confirm the address', () => {
        it('keeps where the visitor was heading, and the password in memory, never in the history entry', async () => {
            authApi.register.mockResolvedValue(undefined)
            authApi.verifyEmail.mockResolvedValue(TOKENS)
            const router = renderAt('/sign-in?redirect=%2Fprofile')

            await userEvent.click(await screen.findByRole('link', { name: 'Create one' }))
            await waitFor(() => expect(where(router)).toBe('/sign-up?redirect=%2Fprofile'))
            // The sign-up form itself, not the sign-in form still shown while it loads.
            await screen.findByLabelText('Confirm password')
            await userEvent.type(screen.getByLabelText('Email'), 'ada@example.test')
            await userEvent.type(screen.getByLabelText('Password'), 'Harbour-Lantern-42')
            await userEvent.type(screen.getByLabelText('Confirm password'), 'Harbour-Lantern-42')
            await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

            await waitFor(() => expect(where(router)).toBe('/verify-email?redirect=%2Fprofile'))
            expect(JSON.stringify(handedOver(router) ?? null)).not.toContain('Harbour')
            await userEvent.type(await screen.findByLabelText('Code'), '123456')
            await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

            await waitFor(() => expect(where(router)).toBe('/profile'))
            expect(authApi.verifyEmail).toHaveBeenCalledWith('ada@example.test', '123456', 'Harbour-Lantern-42')
            expect(JSON.stringify(window.history.state ?? null)).not.toContain('Harbour')
        })

        it('asks for the password after a reload, which forgets it, and will not send without it', async () => {
            renderAt('/verify-email', { email: 'ada@example.test', notice: 'code-sent' })

            expect(await screen.findByText('The password you chose when you signed up.')).toBeInTheDocument()
            await userEvent.type(screen.getByLabelText('Code'), '123456')
            await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

            expect(await screen.findByText('Enter your password')).toBeInTheDocument()
            expect(authApi.verifyEmail).not.toHaveBeenCalled()
        })

        it('says the code or the password is wrong, since the API gives both one answer', async () => {
            authApi.verifyEmail.mockRejectedValue(apiError(400, 'AUTH_CODE_INVALID'))
            renderAt('/verify-email', { email: 'ada@example.test', notice: 'code-sent' })

            await userEvent.type(await screen.findByLabelText('Code'), '123456')
            await userEvent.type(screen.getByLabelText('Password'), 'Harbour-Lantern-42')
            await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

            expect(await screen.findByRole('alert')).toHaveTextContent("That code, or the password, isn't right.")
            expect(authState.startSession).not.toHaveBeenCalled()
        })
    })

    describe('signing in with Google', () => {
        it('does not follow a return address to another site', async () => {
            authState.resumeFromCookie.mockResolvedValue(true)
            const router = renderAt('/auth/callback?redirect=https%3A%2F%2Fevil.example%2F')
            await waitFor(() => expect(where(router)).toBe('/study'))
            expect(authState.resumeFromCookie).toHaveBeenCalledTimes(1)
        })
    })
})
