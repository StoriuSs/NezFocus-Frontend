import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import i18n from '@/i18n'
import { forgetSignUpPassword } from '@/features/auth/lib/sign-up-password'
import { apiError, mockAuthStore, queryWrapper } from '@/test/helpers'

const authApi = {
    register: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    options: vi.fn(),
    completeTwoFactor: vi.fn(),
    twoFactorStatus: vi.fn(),
    disableTwoFactor: vi.fn(),
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
/** Turnstile off, no other providers: what most tests run with. */
const OFF = { providers: [] as string[], turnstileSiteKey: null as string | null }
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
    ['SignIn', 'SignUp', 'VerifyEmail', 'TwoStep', 'Settings', 'OAuthCallback'].map(
        (page) => import(`@/features/auth/pages/${page}.tsx`)
    )
)

/** `state` is what the previous auth page handed over (page-state.ts). */
function renderAt(path: string, state?: Record<string, unknown>) {
    const query = path.indexOf('?')
    const pathname = query < 0 ? path : path.slice(0, query)
    const search = query < 0 ? '' : path.slice(query)
    const router = createMemoryRouter(
        [{ path: '/', element: <p>Home</p> }, { path: '/profile', element: <p>Profile</p> }, ...authRoutes],
        { initialEntries: [state ? { pathname, search, state } : path] }
    )
    render(<RouterProvider router={router} />, { wrapper: queryWrapper() })
    return router
}

const where = (router: ReturnType<typeof renderAt>) =>
    `${router.state.location.pathname}${router.state.location.search}`
const handedOver = (router: ReturnType<typeof renderAt>) => router.state.location.state

/** Cloudflare's widget, stood in for: solved at once, a new token each time it is drawn. */
function fakeTurnstile() {
    let drawn = 0
    const turnstile = {
        render: vi.fn((_container: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => {
            drawn += 1
            options.callback(`token-${drawn}`)
            return `widget-${drawn}`
        }),
        remove: vi.fn()
    }
    window.turnstile = turnstile as unknown as NonNullable<typeof window.turnstile>
    return turnstile
}

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
        authApi.twoFactorStatus.mockResolvedValue({ enabled: false, recoveryCodesLeft: 0 })
        authApi.signInMethods.mockResolvedValue({ password: true, providers: [] })
        delete window.turnstile
        sessionStorage.clear()
        forgetSignUpPassword()
    })

    describe('sign in', () => {
        it('hands the two-step challenge to the code page, and goes on once the code is right', async () => {
            authState.signIn.mockRejectedValue(
                apiError(403, 'AUTH_TWO_FACTOR_REQUIRED', { data: { challenge: 'ch-1' } })
            )
            authApi.completeTwoFactor.mockResolvedValue(TOKENS)
            const router = renderAt('/sign-in?redirect=%2Fprofile')

            await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.test')
            await userEvent.type(screen.getByLabelText('Password'), 'Harbour-Lantern-42')
            await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

            await waitFor(() => expect(where(router)).toBe('/sign-in/two-step?redirect=%2Fprofile'))
            // The challenge travels in the tab's navigation state, not the URL.
            expect(handedOver(router)).toEqual({ challenge: 'ch-1' })
            expect(authState.startSession).not.toHaveBeenCalled()

            await userEvent.type(await screen.findByLabelText('Code from the app'), '123 456')
            await userEvent.click(screen.getByRole('button', { name: 'Verify' }))

            expect(authApi.completeTwoFactor).toHaveBeenCalledWith('123456', 'ch-1')
            expect(authState.startSession).toHaveBeenCalledWith(TOKENS)
            await waitFor(() => expect(where(router)).toBe('/profile'))
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

        it('uses a Turnstile token once: a refused attempt draws a fresh widget for the next', async () => {
            authApi.options.mockResolvedValue({ ...OFF, turnstileSiteKey: 'site-key' })
            authApi.register.mockRejectedValueOnce(apiError(400, 'AUTH_CAPTCHA_FAILED')).mockResolvedValue(undefined)
            const turnstile = fakeTurnstile()
            renderAt('/sign-up')
            await waitFor(() => expect(turnstile.render).toHaveBeenCalled())

            await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.test')
            await userEvent.type(screen.getByLabelText('Password'), 'Harbour-Lantern-42')
            await userEvent.type(screen.getByLabelText('Confirm password'), 'Harbour-Lantern-42')
            await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
            expect(authApi.register).toHaveBeenCalledWith('ada@example.test', 'Harbour-Lantern-42', 'token-1')
            expect(await screen.findByRole('alert')).toHaveTextContent("The security check didn't pass")
            await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(2))
            expect(turnstile.remove).toHaveBeenCalledWith('widget-1')

            await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
            expect(authApi.register).toHaveBeenLastCalledWith('ada@example.test', 'Harbour-Lantern-42', 'token-2')
        })
    })

    describe('two-step sign-in', () => {
        it('says how many tries are left after a wrong code, then how long to wait', async () => {
            authApi.completeTwoFactor
                .mockRejectedValueOnce(apiError(400, 'AUTH_TWO_FACTOR_CODE_INVALID', { data: { attemptsLeft: 2 } }))
                .mockRejectedValueOnce(
                    apiError(429, 'RATE_LIMIT_EXCEEDED', {
                        headers: { 'retry-after': '900' },
                        data: { reason: 'wrong_codes' }
                    })
                )
            renderAt('/sign-in/two-step', { challenge: 'ch-1' })

            await userEvent.type(await screen.findByLabelText('Code from the app'), '111111')
            await userEvent.click(screen.getByRole('button', { name: 'Verify' }))
            expect(await screen.findByRole('alert')).toHaveTextContent("That code isn't right. 2 tries left.")

            await userEvent.type(screen.getByLabelText('Code from the app'), '222222')
            await userEvent.click(screen.getByRole('button', { name: 'Verify' }))
            expect(await screen.findByRole('alert')).toHaveTextContent('Too many wrong codes. Try again in 15 minutes.')
            expect(screen.queryByLabelText('Code from the app')).toBeNull()
        })

        it('needs a code to be turned off', async () => {
            authState.isAuthenticated = true
            authState.user = { email: 'ada@example.test' }
            authApi.twoFactorStatus.mockResolvedValue({ enabled: true, recoveryCodesLeft: 10 })
            authApi.disableTwoFactor.mockResolvedValue(undefined)
            renderAt('/settings')

            const code = await screen.findByLabelText('Code from the app, or a recovery code')
            await userEvent.type(code, 'nope')
            await userEvent.click(screen.getByRole('button', { name: 'Turn off' }))
            expect(await screen.findByText(/Enter the 6 digits from the app, or a recovery code/)).toBeInTheDocument()
            expect(authApi.disableTwoFactor).not.toHaveBeenCalled()

            await userEvent.clear(code)
            await userEvent.type(code, 'K7Q2M-X9HDP')
            await userEvent.click(screen.getByRole('button', { name: 'Turn off' }))
            expect(authApi.disableTwoFactor).toHaveBeenCalledWith('K7Q2M-X9HDP')
        })
    })

    describe('signing in with Google', () => {
        it('does not follow a return address to another site', async () => {
            authState.resumeFromCookie.mockResolvedValue(true)
            const router = renderAt('/auth/callback?redirect=https%3A%2F%2Fevil.example%2F')
            await waitFor(() => expect(where(router)).toBe('/'))
            expect(authState.resumeFromCookie).toHaveBeenCalledTimes(1)
        })
    })
})
