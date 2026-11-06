import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import i18n from '@/i18n'
import { recordCodeSent } from '@/features/auth/lib/code-sent'
import { apiError, mockAuthStore, queryWrapper } from '@/test/helpers'
import { expectNoA11yViolations } from '@/test/a11y'

const authApi = {
    sendEmailCode: vi.fn(),
    verifyEmailCode: vi.fn(),
    options: vi.fn()
}
const authState = {
    isAuthenticated: false,
    isComplete: true,
    isSigningOut: false,
    user: null as null | { email: string },
    signIn: vi.fn(),
    startSession: vi.fn(),
    resumeFromCookie: vi.fn(),
    logout: vi.fn()
}
/** No other providers: what most tests run with. */
const OFF = { providers: [] as string[] }
const TOKENS = { accessToken: 'access', tokenType: 'Bearer' as const, expiresIn: 900 }
const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() })

vi.mock('@/features/auth/api/auth.api', () => ({ authApi }))
vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/config/env', () => ({ env: { VITE_API_URL: 'http://api.test/api/v1' } }))

const { authRoutes } = await import('@/features/auth/routes')
// The routes load each page lazily. Load them all now, so the first test to
// open a page does not spend its findBy timeout (1 s) transforming modules.
await Promise.all(
    ['SignIn', 'Register', 'Verify', 'OAuthCallback'].map((page) => import(`@/features/auth/pages/${page}.tsx`))
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
            ...authRoutes.filter((route) => route.path !== '/welcome'),
            { path: '/welcome', element: <p>Complete your account</p> }
        ],
        { initialEntries: [state ? { pathname, search, state } : path] }
    )
    render(<RouterProvider router={router} />, { wrapper: queryWrapper() })
    return router
}

const where = (router: ReturnType<typeof renderAt>) =>
    `${router.state.location.pathname}${router.state.location.search}`
const handedOver = (router: ReturnType<typeof renderAt>) => router.state.location.state

const codeField = () => screen.findByLabelText('6-digit one-time code')

describe('the auth pages', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        for (const fn of [
            ...Object.values(authApi),
            authState.signIn,
            authState.startSession,
            authState.resumeFromCookie,
            authState.logout,
            toast,
            toast.success
        ]) {
            fn.mockReset()
        }
        authState.isAuthenticated = false
        authState.isComplete = true
        authState.user = null
        authApi.options.mockResolvedValue(OFF)
        sessionStorage.clear()
    })

    describe('accessibility', () => {
        it.each(['/login', '/register'])('%s has no critical or serious problems', async (path) => {
            renderAt(path)
            await screen.findByLabelText('Email')
            await expectNoA11yViolations()
        })

        it('/verify has no critical or serious problems', async () => {
            renderAt('/verify', { email: 'an.nguyen@gmail.com', from: 'register' })
            await codeField()
            await expectNoA11yViolations()
        })
    })

    describe('sign in', () => {
        it('signs in with the address and password, then goes where the visitor was heading', async () => {
            authState.signIn.mockResolvedValue(undefined)
            const router = renderAt('/login?next=%2Fprofile')

            await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.test')
            await userEvent.type(screen.getByLabelText('Password'), 'Harbour-Lantern-42')
            await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

            expect(authState.signIn).toHaveBeenCalledWith('ada@example.test', 'Harbour-Lantern-42')
            await waitFor(() => expect(where(router)).toBe('/profile'))
        })

        it('sends an incomplete account to "complete your account", keeping where it was heading', async () => {
            authState.signIn.mockImplementation(async () => {
                authState.isComplete = false
            })
            const router = renderAt('/login?next=%2Fprofile')

            await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.test')
            await userEvent.type(screen.getByLabelText('Password'), 'Harbour-Lantern-42')
            await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

            await waitFor(() => expect(where(router)).toBe('/welcome?next=%2Fprofile'))
        })

        it('says how long to wait once too many sign-ins for the address failed', async () => {
            authState.signIn.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', {
                    headers: { 'retry-after': '900' },
                    data: { reason: 'sign_ins' }
                })
            )
            renderAt('/login')

            await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.test')
            await userEvent.type(screen.getByLabelText('Password'), 'Harbour-Lantern-42')
            await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Too many failed sign-ins for this address. Try again in 15 minutes, or choose a new password.'
            )
        })
    })

    describe('create an account (S-AUTH-01)', () => {
        it('sends a code and moves on, keeping next and invite, with the address out of the URL', async () => {
            authApi.sendEmailCode.mockResolvedValue(undefined)
            const router = renderAt('/register?next=%2Fprofile&invite=abc')

            await userEvent.type(await screen.findByLabelText('Email'), ' an.nguyen@gmail.com ')
            await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

            await waitFor(() => expect(where(router)).toBe('/verify?next=%2Fprofile&invite=abc'))
            expect(authApi.sendEmailCode).toHaveBeenCalledWith('an.nguyen@gmail.com')
            expect(handedOver(router)).toEqual({ email: 'an.nguyen@gmail.com', from: 'register' })
        })

        it('does not email again within the minute: the code already sent still works (D-67)', async () => {
            recordCodeSent('sign-in', 'an.nguyen@gmail.com')
            const router = renderAt('/register')

            await userEvent.type(await screen.findByLabelText('Email'), 'An.Nguyen@gmail.com')
            await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

            await waitFor(() => expect(where(router)).toBe('/verify'))
            expect(authApi.sendEmailCode).not.toHaveBeenCalled()
        })

        it('says what is wrong with the address, and says it again in the language switched to', async () => {
            renderAt('/register')
            const email = await screen.findByLabelText('Email')

            await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
            expect(await screen.findByText('Enter your email')).toBeInTheDocument()

            await userEvent.type(email, 'an.nguyen@gmail')
            await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
            expect(await screen.findByText("That email doesn't look right")).toBeInTheDocument()

            // The message already on screen follows the switch at the foot of the page (L8).
            await i18n.changeLanguage('vi')
            expect(await screen.findByText('Email chưa đúng định dạng')).toBeInTheDocument()
            expect(authApi.sendEmailCode).not.toHaveBeenCalled()
        })

        it('waits out the hourly limit of the address, but another address may go on (D-67)', async () => {
            authApi.sendEmailCode.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': '2280' }, data: { reason: 'emails' } })
            )
            renderAt('/register')
            const email = await screen.findByLabelText('Email')

            await userEvent.type(email, 'an.nguyen@gmail.com')
            await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

            expect(await screen.findByRole('status')).toHaveTextContent(
                "We've sent several codes to this email in the past hour. Try again in 38 minutes."
            )
            expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

            await userEvent.type(email, 'x')
            expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
        })

        it('keeps the network limit whatever the address, and says other people count', async () => {
            authApi.sendEmailCode.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': '60' }, data: { reason: 'network' } })
            )
            renderAt('/register')
            const email = await screen.findByLabelText('Email')

            await userEvent.type(email, 'an.nguyen@gmail.com')
            await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
            expect(await screen.findByRole('status')).toHaveTextContent('other people')

            await userEvent.type(email, 'x')
            expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
        })
    })

    describe('enter the code (S-AUTH-02)', () => {
        const FROM_REGISTER = { email: 'an.nguyen@gmail.com', from: 'register' }

        it('goes to "Create account" when opened without an address (a new tab)', async () => {
            const router = renderAt('/verify?invite=abc')
            await waitFor(() => expect(where(router)).toBe('/register?invite=abc'))
        })

        it('sends the code by itself at the sixth digit, then a new account completes it first', async () => {
            const account = { created: true, completed: false }
            authApi.verifyEmailCode.mockResolvedValue({ ...TOKENS, account })
            const router = renderAt('/verify?next=%2Fprofile', FROM_REGISTER)

            await userEvent.type(await codeField(), '482913')

            await waitFor(() => expect(where(router)).toBe('/welcome?next=%2Fprofile'))
            expect(authApi.verifyEmailCode).toHaveBeenCalledWith('an.nguyen@gmail.com', '482913')
            expect(authState.startSession).toHaveBeenCalledWith(TOKENS, account)
            expect(toast).not.toHaveBeenCalled()
        })

        it('fills all six from a pasted code with a space in it', async () => {
            authApi.verifyEmailCode.mockResolvedValue({ ...TOKENS, account: { created: false, completed: true } })
            renderAt('/verify', FROM_REGISTER)

            const field = await codeField()
            await userEvent.click(field)
            await userEvent.paste('482 913')

            await waitFor(() => expect(authApi.verifyEmailCode).toHaveBeenCalledWith('an.nguyen@gmail.com', '482913'))
        })

        it('says so when "Create account" found an account already there', async () => {
            authApi.verifyEmailCode.mockResolvedValue({ ...TOKENS, account: { created: false, completed: true } })
            const router = renderAt('/verify', FROM_REGISTER)

            await userEvent.type(await codeField(), '482913')

            await waitFor(() => expect(where(router)).toBe('/study'))
            expect(toast).toHaveBeenCalledWith('You already have an account with this email, so you are signed in')
        })

        it('marks a wrong code, and the first digit typed starts again from an empty row', async () => {
            authApi.verifyEmailCode.mockRejectedValue(apiError(400, 'AUTH_CODE_INVALID'))
            renderAt('/verify', FROM_REGISTER)
            const field = await codeField()

            await userEvent.type(field, '482931')

            expect(await screen.findByRole('alert')).toHaveTextContent(
                'That code is wrong. Use the code in the newest email.'
            )
            expect(authState.startSession).not.toHaveBeenCalled()
            await waitFor(() => expect(field).toHaveFocus())
            await userEvent.keyboard('4')
            expect(field).toHaveValue('4')
            expect(screen.queryByRole('alert')).toBeNull()
        })

        it('turns the button into "Send a new code" once the code has died, and sends one', async () => {
            authApi.verifyEmailCode.mockRejectedValue(apiError(400, 'AUTH_CODE_EXPIRED'))
            authApi.sendEmailCode.mockResolvedValue(undefined)
            renderAt('/verify', FROM_REGISTER)

            await userEvent.type(await codeField(), '482913')
            expect(await screen.findByRole('alert')).toHaveTextContent('Send a new code to continue.')
            expect(await codeField()).toBeDisabled()

            await userEvent.click(screen.getByRole('button', { name: 'Send a new code' }))

            expect(authApi.sendEmailCode).toHaveBeenCalledWith('an.nguyen@gmail.com')
            expect(toast).toHaveBeenCalledWith('A new code is on its way to an.nguyen@gmail.com', expect.anything())
            await waitFor(async () => expect(await codeField()).toBeEnabled())
            expect(screen.getByText(/Send again in/)).toHaveTextContent('Send again in 60 s')
        })

        it('stops all typing while the network has made too many wrong codes, and says why', async () => {
            authApi.verifyEmailCode.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', {
                    headers: { 'retry-after': '2460' },
                    data: { reason: 'network' }
                })
            )
            renderAt('/verify', FROM_REGISTER)

            await userEvent.type(await codeField(), '482931')

            expect(await screen.findByRole('status')).toHaveTextContent(
                "Too many wrong codes from your network in the past hour. Try again in 41 minutes. On a shared network, like a computer lab, other people's wrong codes count too."
            )
            expect(await codeField()).toBeDisabled()
            expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
            expect(screen.queryByText("Didn't get the code?")).toBeNull()
            // Signing in with the password still works.
            expect(screen.getByRole('button', { name: 'Sign in with password' })).toBeEnabled()
        })

        it('counts down from when the code really went out, then offers to send again', async () => {
            recordCodeSent('sign-in', 'an.nguyen@gmail.com', Date.now() - 18_000)
            renderAt('/verify', FROM_REGISTER)

            expect(await screen.findByText(/Send again in/)).toHaveTextContent('Send again in 42 s')

            sessionStorage.clear()
        })

        it('keeps the code in hand usable when sending again is refused, and says why', async () => {
            authApi.sendEmailCode.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': '2280' }, data: { reason: 'emails' } })
            )
            renderAt('/verify', FROM_REGISTER)

            await userEvent.click(await screen.findByRole('button', { name: 'Send again' }))

            expect(await screen.findByRole('status')).toHaveTextContent(
                "We've sent several codes to this email in the past hour. Send again in 38 minutes, or sign in with your password."
            )
            expect(screen.getByRole('button', { name: 'Send again' })).toBeDisabled()
            expect(await codeField()).toBeEnabled()
        })

        it('goes back to the page that sent the code, with the address still there', async () => {
            const router = renderAt('/verify?invite=abc', { email: 'an.nguyen@gmail.com', from: 'login' })

            await userEvent.click(await screen.findByRole('button', { name: 'Back' }))

            await waitFor(() => expect(where(router)).toBe('/login?invite=abc'))
            expect(handedOver(router)).toEqual({ email: 'an.nguyen@gmail.com' })
        })

        it('offers the password instead, with the address filled in', async () => {
            const router = renderAt('/verify?next=%2Fprofile', FROM_REGISTER)

            await userEvent.click(await screen.findByRole('button', { name: 'Sign in with password' }))

            await waitFor(() => expect(where(router)).toBe('/login?next=%2Fprofile&method=password'))
            expect(handedOver(router)).toEqual({ email: 'an.nguyen@gmail.com' })
        })
    })

    describe('signing in with Google', () => {
        it('does not follow a return address to another site', async () => {
            authState.resumeFromCookie.mockResolvedValue(true)
            const router = renderAt('/auth/callback?redirect=https%3A%2F%2Fevil.example%2F')
            await waitFor(() => expect(where(router)).toBe('/study'))
            expect(authState.resumeFromCookie).toHaveBeenCalledTimes(1)
        })

        it('sends an account made by Google to "complete your account", saying it came through Google', async () => {
            authState.resumeFromCookie.mockImplementation(async () => {
                authState.isComplete = false
                return true
            })
            const router = renderAt('/auth/callback?redirect=%2Fprofile')
            await waitFor(() => expect(where(router)).toBe('/welcome?next=%2Fprofile'))
            expect(handedOver(router)).toEqual({ via: 'google' })
        })
    })
})
