import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/i18n'
import { mockAuthStore, queryWrapper } from '@/test/helpers'

const authApi = { deleteAccount: vi.fn() }
const authState = { user: { email: 'ada@example.test' }, logout: vi.fn() }

vi.mock('@/features/auth/api/auth.api', () => ({ authApi }))
vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))

const { DeleteAccountDialog } = await import('@/features/auth/components/DeleteAccountDialog')

describe('deleting your account', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        for (const fn of [...Object.values(authApi), authState.logout]) fn.mockReset()
        sessionStorage.clear()
    })

    it('asks for the password before anything happens, then deletes and signs out', async () => {
        authApi.deleteAccount.mockResolvedValue(undefined)
        render(<DeleteAccountDialog />, { wrapper: queryWrapper() })
        await userEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
        await screen.findByRole('dialog', { name: 'Delete your account' })
        const submit = () => screen.getByRole('button', { name: 'Delete my account' })

        const password = await screen.findByLabelText('Password')
        expect(submit()).toBeDisabled()

        await userEvent.type(password, 'Harbour-Lantern-42')
        await userEvent.click(submit())

        expect(authApi.deleteAccount).toHaveBeenCalledWith('Harbour-Lantern-42')
        expect(authState.logout).toHaveBeenCalledWith('account-deleted')
    })
})
