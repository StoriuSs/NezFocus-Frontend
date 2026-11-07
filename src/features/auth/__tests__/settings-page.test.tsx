import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import { mockAuthStore, queryWrapper } from '@/test/helpers'

const authApi = {
    changePassword: vi.fn(),
    sessions: vi.fn().mockResolvedValue({ sessions: [] })
}
const authState = {
    user: { email: 'jane.doe@example.test', username: 'harbour_seven' },
    logout: vi.fn()
}
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }

vi.mock('@/features/auth/api/auth.api', () => ({ authApi }))
vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))
vi.mock('sonner', () => ({ toast }))

const { default: Settings } = await import('@/features/auth/pages/Settings')

const conditionsInError = () => document.querySelectorAll('li[data-state="error"]')

async function renderSettings() {
    render(
        <MemoryRouter>
            <Settings />
        </MemoryRouter>,
        { wrapper: queryWrapper() }
    )
    return screen.findByLabelText('New password')
}

describe('changing the password in settings', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('en')
    })

    beforeEach(() => {
        vi.clearAllMocks()
        authApi.changePassword.mockResolvedValue(undefined)
    })

    it('marks the unmet conditions once sent, and clears them as the password gets fixed', async () => {
        const user = userEvent.setup()
        const newPassword = await renderSettings()

        await user.click(screen.getByRole('button', { name: 'Change password' }))
        await waitFor(() => expect(conditionsInError()).toHaveLength(5))

        await user.type(newPassword, 'Harbour-Lantern-42')
        await waitFor(() => expect(conditionsInError()).toHaveLength(0))
    })

    it('leaves the emptied form calm after a change that worked', async () => {
        const user = userEvent.setup()
        const newPassword = await renderSettings()

        await user.type(screen.getByLabelText('Current password'), 'Old-Password-1')
        await user.type(newPassword, 'Harbour-Lantern-42')
        await user.type(screen.getByLabelText('Confirm password'), 'Harbour-Lantern-42')
        await user.click(screen.getByRole('button', { name: 'Change password' }))

        await waitFor(() => expect(toast.success).toHaveBeenCalled())
        expect(newPassword).toHaveValue('')
        expect(conditionsInError()).toHaveLength(0)
    })

    it('names the username in the field when the new password is the username (D-66)', async () => {
        const user = userEvent.setup()
        const newPassword = await renderSettings()

        await user.type(screen.getByLabelText('Current password'), 'Old-Password-1')
        await user.type(newPassword, 'Harbour_Seven1')
        await user.type(screen.getByLabelText('Confirm password'), 'Harbour_Seven1')
        await user.click(screen.getByRole('button', { name: 'Change password' }))

        expect(await screen.findByText('Don’t use your username as your password')).toBeInTheDocument()
        expect(authApi.changePassword).not.toHaveBeenCalled()
    })
})
