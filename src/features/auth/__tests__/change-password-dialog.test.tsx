import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import { apiError, mockAuthStore, queryWrapper } from '@/test/helpers'

const authApi = {
    changePassword: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    sessions: vi.fn().mockResolvedValue({ sessions: [] })
}
const authState = {
    user: { email: 'jane.doe@example.test', username: 'harbour_seven' },
    startSession: vi.fn(),
    logout: vi.fn()
}
const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() })

vi.mock('@/features/auth/api/auth.api', () => ({ authApi }))
vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))
vi.mock('sonner', () => ({ toast }))
// The account page reads the address and username from the profile query.
vi.mock('@/features/users/api/users.api', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    fetchProfile: () => Promise.resolve({ id: 'user-1', ...authState.user, roles: ['user'], completed: true })
}))

const { default: Settings } = await import('@/features/auth/pages/Settings')

const TOKENS = { accessToken: 'access-of-the-new-session', expiresIn: 900 }
const conditionsInError = () => document.querySelectorAll('li[data-state="error"]')

/** The account page with the dialog opened from the Password row. */
async function openDialog() {
    const user = userEvent.setup()
    render(
        <MemoryRouter>
            <Settings />
        </MemoryRouter>,
        { wrapper: queryWrapper() }
    )
    await user.click(await screen.findByRole('button', { name: 'Change password' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change password' })
    return { user, dialog: within(dialog) }
}

describe('the change password dialog (S-ME-03)', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('en')
    })

    beforeEach(() => {
        vi.clearAllMocks()
        sessionStorage.clear()
        authApi.changePassword.mockResolvedValue(undefined)
        authApi.forgotPassword.mockResolvedValue(undefined)
        authApi.sessions.mockResolvedValue({ sessions: [] })
    })

    it('asks for the current password and one new one, no second copy, focused on the first (01 Q14)', async () => {
        const { dialog } = await openDialog()

        await waitFor(() => expect(dialog.getByLabelText('Current password')).toHaveFocus())
        expect(dialog.getByLabelText('New password')).toBeInTheDocument()
        expect(dialog.queryByLabelText(/confirm/i)).not.toBeInTheDocument()
        expect(dialog.getByText('Other devices will be signed out; this one stays signed in.')).toBeVisible()
    })

    it('marks the unmet conditions once sent, and clears them as the password gets fixed', async () => {
        const { user, dialog } = await openDialog()

        await user.click(dialog.getByRole('button', { name: 'Change password' }))
        await waitFor(() => expect(conditionsInError()).toHaveLength(5))

        await user.type(dialog.getByLabelText('New password'), 'Harbour-Lantern-42')
        await waitFor(() => expect(conditionsInError()).toHaveLength(0))
        expect(authApi.changePassword).not.toHaveBeenCalled()
    })

    it('names the username in the field when the new password is the username (D-66)', async () => {
        const { user, dialog } = await openDialog()

        await user.type(dialog.getByLabelText('Current password'), 'Old-Password-1')
        await user.type(dialog.getByLabelText('New password'), 'Harbour_Seven1')
        await user.click(dialog.getByRole('button', { name: 'Change password' }))

        expect(await dialog.findByText('Don’t use your username as your password')).toBeInTheDocument()
        expect(authApi.changePassword).not.toHaveBeenCalled()
    })

    it('closes after a change that worked, says the other devices were signed out, and reads the list again', async () => {
        const { user, dialog } = await openDialog()
        await waitFor(() => expect(authApi.sessions).toHaveBeenCalledOnce())

        await user.type(dialog.getByLabelText('Current password'), 'Old-Password-1')
        await user.type(dialog.getByLabelText('New password'), 'Harbour-Lantern-42')
        await user.click(dialog.getByRole('button', { name: 'Change password' }))

        expect(authApi.changePassword).toHaveBeenCalledWith('Old-Password-1', 'Harbour-Lantern-42')
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(toast.success).toHaveBeenCalledWith('Password changed. Other devices have been signed out.')
        await waitFor(() => expect(authApi.sessions).toHaveBeenCalledTimes(2))
    })

    it('says under the current password when it is wrong, back in that field, the new one kept', async () => {
        authApi.changePassword.mockRejectedValue(apiError(400, 'AUTH_CURRENT_PASSWORD_INVALID'))
        const { user, dialog } = await openDialog()

        await user.type(dialog.getByLabelText('Current password'), 'Wrong-Password-1')
        await user.type(dialog.getByLabelText('New password'), 'Harbour-Lantern-42')
        await user.click(dialog.getByRole('button', { name: 'Change password' }))

        expect(await dialog.findByText('Your current password is not right')).toBeVisible()
        expect(dialog.getByLabelText('Current password')).toHaveFocus()
        expect(dialog.getByLabelText('New password')).toHaveValue('Harbour-Lantern-42')
        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('waits out five wrong current passwords: says so, and the button stays off (D-73)', async () => {
        authApi.changePassword.mockRejectedValue(
            apiError(429, 'RATE_LIMIT_EXCEEDED', {
                headers: { 'retry-after': '900' },
                data: { reason: 'wrong_password' }
            })
        )
        const { user, dialog } = await openDialog()

        await user.type(dialog.getByLabelText('Current password'), 'Old-Password-1')
        await user.type(dialog.getByLabelText('New password'), 'Harbour-Lantern-42')
        await user.click(dialog.getByRole('button', { name: 'Change password' }))

        expect(
            await dialog.findByText('You entered the wrong current password too many times. Try again in 15 minutes.')
        ).toBeVisible()
        expect(dialog.getByRole('button', { name: 'Change password' })).toBeDisabled()
    })

    describe('forgot the current password (D-74)', () => {
        it('emails a reset code to the account and turns into the code form', async () => {
            const { user, dialog } = await openDialog()

            await user.click(dialog.getByRole('button', { name: 'Forgot password?' }))

            expect(authApi.forgotPassword).toHaveBeenCalledExactlyOnceWith('jane.doe@example.test')
            const codeForm = within(await screen.findByRole('dialog', { name: 'Choose a new password' }))
            expect(codeForm.getByText('We sent a 6-digit one-time code to jane.doe@example.test.')).toBeVisible()
            await waitFor(() => expect(codeForm.getByLabelText('6-digit one-time code')).toHaveFocus())
            expect(codeForm.getByText(/Send again in/)).toBeVisible()
        })

        it('sends no second code while the first is under a minute old, back and forth (L11)', async () => {
            const { user, dialog } = await openDialog()
            await user.click(dialog.getByRole('button', { name: 'Forgot password?' }))
            const codeForm = within(await screen.findByRole('dialog', { name: 'Choose a new password' }))

            await user.click(codeForm.getByRole('button', { name: 'Back' }))
            const again = within(await screen.findByRole('dialog', { name: 'Change password' }))
            await user.click(again.getByRole('button', { name: 'Forgot password?' }))

            await screen.findByRole('dialog', { name: 'Choose a new password' })
            expect(authApi.forgotPassword).toHaveBeenCalledOnce()
        })

        it('sets the password with the code, takes up the session it started, closes, and reads the list again', async () => {
            authApi.resetPassword.mockResolvedValue(TOKENS)
            const { user, dialog } = await openDialog()
            await user.click(dialog.getByRole('button', { name: 'Forgot password?' }))
            const codeForm = within(await screen.findByRole('dialog', { name: 'Choose a new password' }))

            await user.type(codeForm.getByLabelText('6-digit one-time code'), '482913')
            await user.type(codeForm.getByLabelText('New password'), 'Harbour-Lantern-42')
            await user.click(codeForm.getByRole('button', { name: 'Set password' }))

            expect(authApi.resetPassword).toHaveBeenCalledWith('jane.doe@example.test', '482913', 'Harbour-Lantern-42')
            expect(authState.startSession).toHaveBeenCalledWith(TOKENS)
            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
            expect(toast.success).toHaveBeenCalledWith('New password set. Your other devices were signed out.')
            // Every earlier session ended (D-62): the Sessions group reads them again.
            await waitFor(() => expect(authApi.sessions).toHaveBeenCalledTimes(2))
        })

        it('shows why the code could not be sent, in the dialog', async () => {
            authApi.forgotPassword.mockRejectedValue(
                apiError(429, 'RATE_LIMIT_EXCEEDED', { headers: { 'retry-after': '1800' }, data: { reason: 'emails' } })
            )
            const { user, dialog } = await openDialog()

            await user.click(dialog.getByRole('button', { name: 'Forgot password?' }))

            const codeForm = within(await screen.findByRole('dialog', { name: 'Choose a new password' }))
            expect(codeForm.getByRole('status')).toHaveTextContent('30 minutes')
        })
    })
})
