import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import { mockAuthStore, queryWrapper } from '@/test/helpers'

const fetchProfile = vi.fn()
const authApi = { sessions: vi.fn() }
// The store's copy from sign-in, empty: the page must not depend on it.
const authState = { user: null, logout: vi.fn(), startSession: vi.fn() }

vi.mock('@/features/auth/api/auth.api', () => ({ authApi }))
vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))
vi.mock('@/features/users/api/users.api', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    fetchProfile: () => fetchProfile()
}))

const { default: Settings } = await import('@/features/auth/pages/Settings')

const PROFILE = {
    id: 'user-1',
    email: 'jane.doe@example.test',
    username: 'harbour_seven',
    roles: ['user'],
    completed: true,
    deletesAt: null
}

function renderPage() {
    render(
        <MemoryRouter>
            <Settings />
        </MemoryRouter>,
        { wrapper: queryWrapper() }
    )
}

// 10-settings › S-ME-03
describe('the account page', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('en')
    })

    beforeEach(() => {
        fetchProfile.mockReset()
        authApi.sessions.mockResolvedValue({ sessions: [] })
    })

    it('shows the address, "Change password" and "Delete account" from the profile', async () => {
        fetchProfile.mockResolvedValue(PROFILE)
        renderPage()

        expect(await screen.findByText('jane.doe@example.test')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument()
    })

    it('says when the profile could not be read, and reads it again on request', async () => {
        fetchProfile.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(PROFILE)
        renderPage()

        expect(await screen.findByText('Your profile could not be loaded.')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

        expect(await screen.findByText('jane.doe@example.test')).toBeInTheDocument()
        expect(screen.queryByText('Your profile could not be loaded.')).not.toBeInTheDocument()
    })
})
