import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import i18n from '@/i18n'
import { recordCodeSent } from '@/features/auth/lib/code-sent'
import { rememberedSignInMethod, rememberSignInMethod } from '@/features/auth/lib/sign-in-method'
import { apiError, mockAuthStore, queryWrapper } from '@/test/helpers'
import { expectNoA11yViolations } from '@/test/a11y'

const authApi = {
    sendEmailCode: vi.fn(),
    verifyEmailCode: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    options: vi.fn()
}
const authState = {
    isAuthenticated: false,
    isComplete: true,
    isSigningOut: false,
    deletesAt: null as string | null,
    user: null as null | { email: string },
    signIn: vi.fn(),
    startSession: vi.fn(),
    resumeFromCookie: vi.fn(),
    logout: vi.fn(),
    peekSignOutReason: vi.fn(),
    takeSignOutReason: vi.fn(),
    peekDeletesAt: vi.fn(),
    restoreAccount: vi.fn(),
    setRestoreAside: vi.fn()
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
    ['SignIn', 'Register', 'Verify', 'ForgotPassword', 'ResetPassword', 'OAuthCallback'].map(
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
            authState.peekSignOutReason,
            authState.takeSignOutReason,
            authState.peekDeletesAt,
            authState.restoreAccount,
            authState.setRestoreAside,
            toast,
            toast.success
        ]) {
            fn.mockReset()
        }
        authState.isAuthenticated = false
        authState.isComplete = true
        authState.deletesAt = null
        authState.user = null
        authApi.options.mockResolvedValue(OFF)
        authState.peekSignOutReason.mockReturnValue(null)
        authState.peekDeletesAt.mockReturnValue(null)
        sessionStorage.clear()
        localStorage.clear()
    })

    describe('accessibility', () => {
        it.each(['/login', '/login?method=password', '/register', '/forgot-password'])(
            '%s has no critical or serious problems',
            async (path) => {
                renderAt(path)
                await screen.findByLabelText('Email')
                await expectNoA11yViolations()
            }
        )

        it('/reset-password has no critical or serious problems', async () => {
            renderAt('/reset-password', { email: 'an.nguyen@gmail.com' })
            await codeField()
            await expectNoA11yViolations()
        })

        it('/verify has no critical or serious problems', async () => {
            renderAt('/verify', { email: 'an.nguyen@gmail.com', from: 'register' })
            await codeField()
            await expectNoA11yViolations()
        })
    })

    describe('sign in (S-AUTH-03)', () => {
        const signInByPassword = async (email = 'ada@example.test', password = 'Harbour-Lantern-42') => {
            await userEvent.type(await screen.findByLabelText('Email'), email)
            await userEvent.type(screen.getByLabelText('Password'), password)
            await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
        }

        it('opens on the code: sends one and moves on to enter it, keeping next and invite (D-60)', async () => {
            authApi.sendEmailCode.mockResolvedValue(undefined)
            const router = renderAt('/login?next=%2Fprofile&invite=abc')

            expect(
                await screen.findByText("Enter your email and we'll send you a one-time code to sign in.")
            ).toBeVisible()
            expect(screen.queryByLabelText('Password')).toBeNull()
            await userEvent.type(screen.getByLabelText('Email'), 'an.nguyen@gmail.com')
            await userEvent.click(screen.getByRole('button', { name: 'Send code' }))

            await waitFor(() => expect(where(router)).toBe('/verify?next=%2Fprofile&invite=abc'))
            expect(authApi.sendEmailCode).toHaveBeenCalledWith('an.nguyen@gmail.com')
            expect(handedOver(router)).toEqual({ email: 'an.nguyen@gmail.com', from: 'login' })
        })

        it('asks for the email to send the code to, in the words of the code way', async () => {
            renderAt('/login')
            await userEvent.click(await screen.findByRole('button', { name: 'Send code' }))
            expect(await screen.findByText('Enter your email to get a code')).toBeVisible()
            expect(authApi.sendEmailCode).not.toHaveBeenCalled()
        })

        it('changes to the password and back, keeping the email typed; the URL keeps the way for a reload', async () => {
            const router = renderAt('/login?next=%2Fprofile')

            await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.test')
            await userEvent.click(screen.getByRole('button', { name: 'Sign in with password' }))

            await waitFor(() => expect(where(router)).toBe('/login?next=%2Fprofile&method=password'))
            expect(screen.getByLabelText('Email')).toHaveValue('ada@example.test')
            await waitFor(() => expect(screen.getByLabelText('Password')).toHaveFocus())

            await userEvent.click(screen.getByRole('button', { name: 'Sign in with a one-time code' }))
            await waitFor(() => expect(where(router)).toBe('/login?next=%2Fprofile'))
            expect(screen.getByLabelText('Email')).toHaveValue('ada@example.test')
        })

        it('signs in with the password, goes where the visitor was heading, and opens on the password next time (D-68)', async () => {
            authState.signIn.mockResolvedValue(undefined)
            const router = renderAt('/login?next=%2Fprofile&method=password')

            await signInByPassword()

            expect(authState.signIn).toHaveBeenCalledWith('ada@example.test', 'Harbour-Lantern-42')
            await waitFor(() => expect(where(router)).toBe('/profile'))
            expect(rememberedSignInMethod()).toBe('password')
        })

        it('opens on the way remembered, and names the code in the URL when changing back to it', async () => {
            rememberSignInMethod('password')
            const router = renderAt('/login')

            expect(await screen.findByLabelText('Password')).toBeVisible()
            await userEvent.click(screen.getByRole('button', { name: 'Sign in with a one-time code' }))
            await waitFor(() => expect(where(router)).toBe('/login?method=code'))
        })

        it('sends an incomplete account to "complete your account", keeping where it was heading', async () => {
            authState.signIn.mockImplementation(async () => {
                authState.isComplete = false
            })
            const router = renderAt('/login?next=%2Fprofile&method=password')

            await signInByPassword()

            await waitFor(() => expect(where(router)).toBe('/welcome?next=%2Fprofile'))
        })

        it('says one thing for a wrong password or an unknown address, and asks for the password again', async () => {
            authState.signIn.mockRejectedValue(apiError(401, 'AUTH_INVALID_CREDENTIALS'))
            renderAt('/login?method=password')

            await signInByPassword()

            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Incorrect email or password. Try again, or sign in with a one-time code.'
            )
            expect(screen.getByLabelText('Email')).toHaveValue('ada@example.test')
            expect(screen.getByLabelText('Password')).toHaveValue('')
            await waitFor(() => expect(screen.getByLabelText('Password')).toHaveFocus())
        })

        it('waits out too many wrong passwords for the address; another address may go on', async () => {
            authState.signIn.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', {
                    headers: { 'retry-after': '900' },
                    data: { reason: 'sign_ins' }
                })
            )
            renderAt('/login?method=password')

            await signInByPassword()

            expect(await screen.findByRole('status')).toHaveTextContent(
                'Too many wrong tries. Try again in 15 minutes, or sign in with a one-time code.'
            )
            expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
            expect(screen.getByRole('button', { name: 'Sign in with a one-time code' })).toBeEnabled()
            await userEvent.type(screen.getByLabelText('Email'), 'x')
            expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
        })

        it('keeps the network limit whatever the address, says other people count, and waits minutes (D-135)', async () => {
            authState.signIn.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': '240' }, data: { reason: 'network' } })
            )
            renderAt('/login?method=password')

            await signInByPassword()

            expect(await screen.findByRole('status')).toHaveTextContent(
                "Too many failed sign-ins from your network. Try again in 4 minutes, or sign in with a one-time code. On a shared network, like a computer lab, other people's tries count too."
            )
            await userEvent.type(screen.getByLabelText('Email'), 'x')
            expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
        })

        it('waits out the hourly limit of code emails for the address, pointing to the password', async () => {
            authApi.sendEmailCode.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': '2280' }, data: { reason: 'emails' } })
            )
            renderAt('/login')

            await userEvent.type(await screen.findByLabelText('Email'), 'an.nguyen@gmail.com')
            await userEvent.click(screen.getByRole('button', { name: 'Send code' }))

            expect(await screen.findByRole('status')).toHaveTextContent(
                "We've sent several codes to this email in the past hour. Try again in 38 minutes, or sign in with your password."
            )
            expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled()
            expect(screen.getByRole('button', { name: 'Sign in with password' })).toBeEnabled()
        })

        it('says a code went out a moment ago from elsewhere, not that many did; another address may go on (D-136)', async () => {
            authApi.sendEmailCode.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', {
                    headers: { 'retry-after': '37' },
                    data: { reason: 'recent_email' }
                })
            )
            renderAt('/login')
            const email = await screen.findByLabelText('Email')

            await userEvent.type(email, 'an.nguyen@gmail.com')
            await userEvent.click(screen.getByRole('button', { name: 'Send code' }))

            expect(await screen.findByRole('status')).toHaveTextContent(
                'We just sent a code to this email. Try again in 37 seconds, or sign in with your password.'
            )
            expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled()
            await userEvent.type(email, 'x')
            expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled()
        })

        it('says why the session ended, once, and opens on the password when it was changed elsewhere (D-65)', async () => {
            authState.peekSignOutReason.mockReturnValue('password-changed')
            renderAt('/login')

            expect(await screen.findByText(/Your password was just changed on another device/)).toBeVisible()
            expect(screen.getByLabelText('Password')).toBeVisible()
            await waitFor(() => expect(authState.takeSignOutReason).toHaveBeenCalledTimes(1))
        })

        it('says until when an account waiting to be deleted can be restored (S-AUTH-03 `account-deleted`, D-141)', async () => {
            authState.peekSignOutReason.mockReturnValue('account-deleted')
            authState.peekDeletesAt.mockReturnValue('2026-11-01T10:00:00.000Z')
            renderAt('/login')

            expect(
                await screen.findByText(/Your account will be deleted for good on 01\/11\/2026 · sign in before then/)
            ).toBeVisible()
            await waitFor(() => expect(authState.takeSignOutReason).toHaveBeenCalledTimes(1))
        })

        it('still says the account waits to be deleted when the day did not come with the sign-out', async () => {
            authState.peekSignOutReason.mockReturnValue('account-deleted')
            renderAt('/login')

            expect(
                await screen.findByText(/Your account is waiting to be deleted · sign in within 14 days/)
            ).toBeVisible()
        })
        it('stops a sign-in to an account waiting to be deleted at the restore dialog, the form as typed', async () => {
            authState.signIn.mockImplementation(async () => {
                authState.isAuthenticated = true
                authState.deletesAt = '2026-10-29T14:47:00.000Z'
            })
            const router = renderAt('/login?next=%2Fprofile&method=password')

            await signInByPassword()

            expect(await screen.findByRole('dialog', { name: 'Your account is waiting to be deleted' })).toBeVisible()
            expect(where(router)).toBe('/login?next=%2Fprofile&method=password')
            expect(handedOver(router)).toEqual({ email: 'ada@example.test' })
        })

        it('says a session closed for safety in its own words', async () => {
            authState.peekSignOutReason.mockReturnValue('security')
            renderAt('/login')

            expect(await screen.findByText(/closed to protect your account/)).toBeVisible()
            expect(screen.queryByLabelText('Password')).toBeNull()
        })

        it('hands the email typed to "forgot password"', async () => {
            const router = renderAt('/login?method=password')

            await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.test')
            await userEvent.click(screen.getByRole('link', { name: 'Forgot password?' }))

            await waitFor(() => expect(where(router)).toBe('/forgot-password'))
            expect(handedOver(router)).toEqual({ email: 'ada@example.test' })
        })
    })

    describe('forgot and reset the password (S-AUTH-04)', () => {
        const ADDRESS = 'an.nguyen@gmail.com'

        it('sends a reset code and moves on, the address out of the URL', async () => {
            authApi.forgotPassword.mockResolvedValue(undefined)
            const router = renderAt('/forgot-password?next=%2Fprofile', { email: ADDRESS })

            expect(await screen.findByLabelText('Email')).toHaveValue(ADDRESS)
            await userEvent.click(screen.getByRole('button', { name: 'Send code' }))

            await waitFor(() => expect(where(router)).toBe('/reset-password?next=%2Fprofile'))
            expect(authApi.forgotPassword).toHaveBeenCalledWith(ADDRESS)
            expect(handedOver(router)).toEqual({ email: ADDRESS })
        })

        it('goes back to sign in by password, the address still there', async () => {
            const router = renderAt('/forgot-password', { email: ADDRESS })

            await userEvent.click(await screen.findByRole('button', { name: 'Back' }))

            await waitFor(() => expect(where(router)).toBe('/login?method=password'))
            expect(handedOver(router)).toEqual({ email: ADDRESS })
        })

        it('goes to step one when opened without an address (a new tab)', async () => {
            const router = renderAt('/reset-password')
            await waitFor(() => expect(where(router)).toBe('/forgot-password'))
        })

        it('says the code comes only if the address has an account, and waits for the button at six digits', async () => {
            authApi.resetPassword.mockResolvedValue(TOKENS)
            authState.startSession.mockResolvedValue(undefined)
            const router = renderAt('/reset-password?next=%2Fprofile', { email: ADDRESS })

            expect(
                await screen.findByText(
                    `If ${ADDRESS} has a NezFocus account, a 6-digit one-time code will arrive in a few minutes.`
                )
            ).toBeVisible()
            await userEvent.type(await codeField(), '482913')
            expect(authApi.resetPassword).not.toHaveBeenCalled()
            await waitFor(() => expect(screen.getByLabelText('New password')).toHaveFocus())

            await userEvent.type(screen.getByLabelText('New password'), 'Harbour-Lantern-42')
            await userEvent.click(screen.getByRole('button', { name: 'Set password' }))

            expect(authApi.resetPassword).toHaveBeenCalledWith(ADDRESS, '482913', 'Harbour-Lantern-42')
            expect(authState.startSession).toHaveBeenCalledWith(TOKENS)
            await waitFor(() => expect(where(router)).toBe('/profile'))
            expect(toast.success).toHaveBeenCalledWith('New password set. Your other devices were signed out.')
        })

        it('keeps the new password when only the code was wrong', async () => {
            authApi.resetPassword.mockRejectedValue(apiError(400, 'AUTH_CODE_INVALID'))
            renderAt('/reset-password', { email: ADDRESS })

            await userEvent.type(await codeField(), '482931')
            await userEvent.type(screen.getByLabelText('New password'), 'Harbour-Lantern-42')
            await userEvent.click(screen.getByRole('button', { name: 'Set password' }))

            expect(await screen.findByRole('alert')).toHaveTextContent('That code is wrong')
            expect(screen.getByLabelText('New password')).toHaveValue('Harbour-Lantern-42')
            await waitFor(() => expect(screen.getByLabelText('6-digit one-time code')).toHaveFocus())
        })

        it('checks the new password before sending anything', async () => {
            renderAt('/reset-password', { email: ADDRESS })

            await userEvent.type(await codeField(), '482913')
            await userEvent.type(screen.getByLabelText('New password'), 'ontap2026')
            await userEvent.click(screen.getByRole('button', { name: 'Set password' }))

            await waitFor(() => expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true'))
            expect(authApi.resetPassword).not.toHaveBeenCalled()
        })

        it('sends again in the same hedged words, never saying the address has an account (NFR-SEC-05)', async () => {
            authApi.forgotPassword.mockResolvedValue(undefined)
            renderAt('/reset-password', { email: ADDRESS })

            await userEvent.click(await screen.findByRole('button', { name: 'Send again' }))

            expect(authApi.forgotPassword).toHaveBeenCalledWith(ADDRESS)
            expect(toast).toHaveBeenCalledWith(
                `If ${ADDRESS} has a NezFocus account, a new one-time code will arrive in a few minutes.`,
                expect.anything()
            )
            expect(await screen.findByText(/Send again in/)).toHaveTextContent('Send again in 60 s')
        })

        it('stops the code while the network has made too many wrong ones, the password kept (D-135)', async () => {
            authApi.resetPassword.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': '240' }, data: { reason: 'network' } })
            )
            renderAt('/reset-password', { email: ADDRESS })

            await userEvent.type(await codeField(), '482931')
            await userEvent.type(screen.getByLabelText('New password'), 'Harbour-Lantern-42')
            await userEvent.click(screen.getByRole('button', { name: 'Set password' }))

            expect(await screen.findByRole('status')).toHaveTextContent(
                'Too many wrong codes from your network. Try again in 4 minutes.'
            )
            expect(screen.getByLabelText('6-digit one-time code')).toBeDisabled()
            expect(screen.getByRole('button', { name: 'Set password' })).toBeDisabled()
            expect(screen.getByLabelText('New password')).toHaveValue('Harbour-Lantern-42')
        })

        it('says a code went out a moment ago, when asking for one or sending again (D-136)', async () => {
            authApi.forgotPassword.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', {
                    headers: { 'retry-after': '37' },
                    data: { reason: 'recent_email' }
                })
            )
            renderAt('/forgot-password', { email: ADDRESS })

            await userEvent.click(await screen.findByRole('button', { name: 'Send code' }))
            expect(await screen.findByRole('status')).toHaveTextContent(
                'We just sent a code to this email. Try again in 37 seconds.'
            )

            cleanup()
            renderAt('/reset-password', { email: ADDRESS })
            await userEvent.click(await screen.findByRole('button', { name: 'Send again' }))
            expect(await screen.findByRole('status')).toHaveTextContent(
                'We just sent a code to this email. Send again in 37 seconds.'
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

        it('says a code went out a moment ago from elsewhere; another address may go on (D-136)', async () => {
            authApi.sendEmailCode.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', {
                    headers: { 'retry-after': '37' },
                    data: { reason: 'recent_email' }
                })
            )
            renderAt('/register')
            const email = await screen.findByLabelText('Email')

            await userEvent.type(email, 'an.nguyen@gmail.com')
            await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

            expect(await screen.findByRole('status')).toHaveTextContent(
                'We just sent a code to this email. Try again in 37 seconds.'
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

        it('makes the sign-in page open on the code next time, once a code signed in (D-68)', async () => {
            rememberSignInMethod('password')
            authApi.verifyEmailCode.mockResolvedValue({ ...TOKENS, account: { created: false, completed: true } })
            const router = renderAt('/verify', { email: 'an.nguyen@gmail.com', from: 'login' })

            await userEvent.type(await codeField(), '482913')

            await waitFor(() => expect(where(router)).toBe('/study'))
            expect(rememberedSignInMethod()).toBe('code')
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
                    headers: { 'retry-after': '240' },
                    data: { reason: 'network' }
                })
            )
            renderAt('/verify', FROM_REGISTER)

            await userEvent.type(await codeField(), '482931')

            expect(await screen.findByRole('status')).toHaveTextContent(
                "Too many wrong codes from your network. Try again in 4 minutes. On a shared network, like a computer lab, other people's wrong codes count too."
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

        it('says a code went out a moment ago when sending again is refused for that (D-136)', async () => {
            authApi.sendEmailCode.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', {
                    headers: { 'retry-after': '37' },
                    data: { reason: 'recent_email' }
                })
            )
            renderAt('/verify', FROM_REGISTER)

            await userEvent.click(await screen.findByRole('button', { name: 'Send again' }))

            expect(await screen.findByRole('status')).toHaveTextContent(
                'We just sent a code to this email. Send again in 37 seconds, or sign in with your password.'
            )
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
