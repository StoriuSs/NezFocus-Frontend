import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import i18n from '@/i18n'
import { apiError, mockAuthStore, queryWrapper } from '@/test/helpers'
import { expectNoA11yViolations } from '@/test/a11y'

const authApi = { completeAccount: vi.fn() }
const api = { get: vi.fn() }
const authState = {
    isAuthenticated: true,
    isComplete: false,
    isSigningOut: false,
    user: { email: 'an.nguyen@gmail.com' },
    markComplete: vi.fn()
}
/** Usernames someone already has. */
const taken = new Set<string>()

vi.mock('@/features/auth/api/auth.api', () => ({ authApi }))
vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))
vi.mock('@/lib/api', () => ({ default: api }))

const { default: Welcome } = await import('@/features/auth/pages/Welcome')

function renderWelcome(path = '/welcome', state?: Record<string, unknown>, profile: Record<string, unknown> = {}) {
    api.get.mockImplementation(async (url: string) => {
        if (url === '/users/me') {
            return {
                data: {
                    data: { id: 'u1', email: 'an.nguyen@gmail.com', roles: ['user'], completed: false, ...profile }
                }
            }
        }
        const name = decodeURIComponent(url.split('/').pop()!)
        return { data: { data: { available: !taken.has(name) } } }
    })
    const query = path.indexOf('?')
    const router = createMemoryRouter(
        [
            { path: '/welcome', element: <Welcome /> },
            { path: '/study', element: <p>Study</p> },
            { path: '/profile', element: <p>Profile</p> }
        ],
        {
            initialEntries: [
                {
                    pathname: query < 0 ? path : path.slice(0, query),
                    search: query < 0 ? '' : path.slice(query),
                    state
                }
            ]
        }
    )
    render(<RouterProvider router={router} />, { wrapper: queryWrapper() })
    return router
}

const field = (name: string) => screen.findByLabelText(name)
const enter = () => screen.getByRole('button', { name: 'Enter NezFocus' })

/** A form that passes every rule the browser knows. */
async function fillIn({ displayName = 'An', password = 'Ontap2026!' } = {}) {
    await userEvent.type(await field('Display name'), displayName)
    await userEvent.type(screen.getByLabelText('Password'), password)
    await userEvent.click(screen.getByRole('checkbox'))
}

describe('complete your account (S-ONB-01)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        authApi.completeAccount.mockReset()
        authState.markComplete.mockReset()
        api.get.mockReset()
        taken.clear()
    })

    it('has no critical or serious problems', async () => {
        renderWelcome()
        await field('Display name')
        await expectNoA11yViolations()
    })

    it('starts with the username from the email, checked, and the display name focused', async () => {
        renderWelcome()

        expect(await screen.findByText('an.nguyen@gmail.com is confirmed. One more step.')).toBeInTheDocument()
        expect(await field('Display name')).toHaveFocus()
        expect(screen.getByLabelText('Username')).toHaveValue('an.nguyen')
        expect(await screen.findByText('Username is available')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Time zone' })).toHaveTextContent('GMT+7 · Ho Chi Minh')
    })

    it('leaves the username empty, with no error, when the one from the email is taken', async () => {
        taken.add('an.nguyen')
        renderWelcome()

        await waitFor(() => expect(screen.getByLabelText('Username')).toHaveValue(''))
        expect(screen.queryByRole('alert')).toBeNull()
        expect(screen.getByText('2–32 characters: lowercase letters, numbers, _ and .')).toBeInTheDocument()
    })

    it('says a name typed is taken, and lowers what is typed', async () => {
        taken.add('an')
        renderWelcome()
        const username = await field('Username')

        await userEvent.clear(username)
        await userEvent.type(username, 'AN')

        expect(username).toHaveValue('an')
        expect(await screen.findByText('This username is taken. Choose another one.')).toBeInTheDocument()
    })

    it('marks every field left wrong, focuses the first, and follows the language switch', async () => {
        renderWelcome()
        await field('Display name')
        await userEvent.type(screen.getByLabelText('Password'), 'ontap2026')
        await userEvent.click(enter())

        expect(await screen.findByText('Enter a display name')).toBeInTheDocument()
        expect(screen.getByText("The password doesn't meet the conditions yet")).toBeInTheDocument()
        expect(screen.getByText('You need to agree to continue')).toBeInTheDocument()
        expect(screen.getByLabelText('Display name')).toHaveFocus()
        expect(authApi.completeAccount).not.toHaveBeenCalled()

        await i18n.changeLanguage('vi')
        expect(await screen.findByText('Nhập tên hiển thị')).toBeInTheDocument()
        expect(screen.getByText('Bạn cần đồng ý để tiếp tục')).toBeInTheDocument()
    })

    it('warns while Caps Lock is on in the password, without calling it an error', async () => {
        renderWelcome()
        await field('Display name')
        const password = screen.getByLabelText('Password')

        fireEvent.keyDown(password, { key: 'A', modifierCapsLock: true })
        expect(screen.getByText('Caps Lock is on')).toBeInTheDocument()
        expect(screen.queryByRole('alert')).toBeNull()

        fireEvent.keyUp(password, { key: 'CapsLock', modifierCapsLock: false })
        expect(screen.queryByText('Caps Lock is on')).toBeNull()
    })

    it('refuses the username as the password (D-66)', async () => {
        renderWelcome()
        const username = await field('Username')
        await userEvent.clear(username)
        await userEvent.type(username, 'an_study')
        await fillIn({ password: 'an_study' })
        await userEvent.click(enter())

        expect(await screen.findByText('Don’t use your username as your password')).toBeInTheDocument()
        expect(authApi.completeAccount).not.toHaveBeenCalled()
    })

    it('completes the account with every field, then goes where the person was heading', async () => {
        authApi.completeAccount.mockResolvedValue(undefined)
        const router = renderWelcome('/welcome?next=%2Fprofile')
        await screen.findByText('Username is available')
        await fillIn({ displayName: '  An  ' })

        await userEvent.click(enter())

        await waitFor(() => expect(router.state.location.pathname).toBe('/profile'))
        expect(authApi.completeAccount).toHaveBeenCalledWith({
            displayName: 'An',
            username: 'an.nguyen',
            password: 'Ontap2026!',
            timezone: expect.stringMatching(/^Asia\/(Ho_Chi_Minh|Saigon)$/),
            termsAccepted: true
        })
        expect(authState.markComplete).toHaveBeenCalledOnce()
    })

    it('picks a time zone by searching for a city', async () => {
        authApi.completeAccount.mockResolvedValue(undefined)
        renderWelcome()
        await fillIn()

        await userEvent.click(screen.getByRole('button', { name: 'Time zone' }))
        await userEvent.type(screen.getByRole('combobox', { name: 'Search a city or GMT' }), 'tokyo')
        const options = within(screen.getByRole('listbox')).getAllByRole('option')
        expect(options.map((option) => option.textContent)).toEqual(['GMT+9 · Tokyo'])
        await userEvent.keyboard('{Enter}')

        expect(screen.getByRole('button', { name: 'Time zone' })).toHaveTextContent('GMT+9 · Tokyo')
        await userEvent.click(enter())
        await waitFor(() =>
            expect(authApi.completeAccount).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'Asia/Tokyo' }))
        )
    })

    it("offers the browser's zone first, the only row ticked while it is the one chosen", async () => {
        renderWelcome()
        await userEvent.click(await screen.findByRole('button', { name: 'Time zone' }))
        const options = within(screen.getByRole('listbox')).getAllByRole('option')
        expect(options[0]).toHaveTextContent(/^From your browser: GMT\+7 · /)
        expect(options.filter((option) => option.getAttribute('aria-selected') === 'true')).toEqual([options[0]])
    })

    it('shows the time now in the zone chosen, so a wrong pick is easy to spot', async () => {
        // Only the clock is faked: the user events still need real timers.
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-10-18T14:47:00Z'))
        try {
            renderWelcome()
            const zone = await screen.findByRole('button', { name: 'Time zone' })
            expect(zone).toHaveAccessibleDescription('Time there now: 21:47')

            await userEvent.click(zone)
            await userEvent.type(screen.getByRole('combobox', { name: 'Search a city or GMT' }), 'tokyo')
            await userEvent.keyboard('{Enter}')

            expect(screen.getByRole('button', { name: 'Time zone' })).toHaveAccessibleDescription(
                'Time there now: 23:47'
            )
        } finally {
            vi.useRealTimers()
        }
    })

    it('keeps everything typed when the username was taken meanwhile, and says so on the field', async () => {
        authApi.completeAccount.mockRejectedValue(apiError(409, 'USERNAME_CONFLICT'))
        renderWelcome()
        await screen.findByText('Username is available')
        await fillIn()

        await userEvent.click(enter())

        expect(await screen.findByText('Someone just took this username. Choose another one.')).toBeInTheDocument()
        expect(screen.getByLabelText('Username')).toHaveFocus()
        expect(screen.getByLabelText('Display name')).toHaveValue('An')
        expect(screen.getByLabelText('Password')).toHaveValue('Ontap2026!')
        expect(authState.markComplete).not.toHaveBeenCalled()
    })

    it('goes on when another tab completed the account first', async () => {
        authApi.completeAccount.mockRejectedValue(apiError(409, 'ACCOUNT_ALREADY_COMPLETE'))
        const router = renderWelcome()
        await fillIn()

        await userEvent.click(enter())

        await waitFor(() => expect(router.state.location.pathname).toBe('/study'))
        expect(authState.markComplete).toHaveBeenCalledOnce()
    })

    it('fills in the name from Google and moves on to the password', async () => {
        renderWelcome('/welcome', { via: 'google' }, { displayName: 'An Nguyễn' })

        expect(
            await screen.findByText('an.nguyen@gmail.com is confirmed through Google. One more step.')
        ).toBeInTheDocument()
        expect(screen.getByLabelText('Display name')).toHaveValue('An Nguyễn')
        await waitFor(() => expect(screen.getByLabelText('Password')).toHaveFocus())
    })
})
