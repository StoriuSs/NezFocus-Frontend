import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/i18n'
import { apiError, queryWrapper } from '@/test/helpers'

const api = { get: vi.fn(), patch: vi.fn(), post: vi.fn() }
vi.mock('@/lib/api', () => ({ default: api }))
// Deleting the account is auth's, and tested there.
vi.mock('@/features/auth', () => ({ DeleteAccountDialog: () => null }))

const { default: Profile } = await import('@/features/users/pages/Profile')

const profile = { id: 'user-1', email: 'ada@example.test', username: 'ada', displayName: 'Ada', roles: ['user'] }

describe('editing the profile', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        api.get.mockReset()
        api.patch.mockReset()
        api.get.mockResolvedValue({ data: { data: profile } })
    })

    const openAndSave = async (displayName: string) => {
        render(<Profile />, { wrapper: queryWrapper() })
        await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
        const dialog = await screen.findByRole('dialog', { name: 'Edit Profile' })
        const field = screen.getByLabelText('Display Name')
        await userEvent.clear(field)
        await userEvent.type(field, displayName)
        await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        return dialog
    }

    it('saves and closes the dialog', async () => {
        api.patch.mockResolvedValue({ data: { data: null } })

        await openAndSave('Ada Lovelace')

        expect(api.patch).toHaveBeenCalledWith(
            '/users/me',
            { displayName: 'Ada Lovelace', bio: '' },
            expect.objectContaining({ headers: { 'Idempotency-Key': expect.any(String) } })
        )
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('keeps the dialog, and what was typed, when the save fails', async () => {
        api.patch.mockRejectedValue(apiError(503, 'SERVICE_UNAVAILABLE_ERROR'))

        const dialog = await openAndSave('Ada Lovelace')

        await waitFor(() => expect(api.patch).toHaveBeenCalled())
        expect(dialog).toBeInTheDocument()
        expect(screen.getByLabelText('Display Name')).toHaveValue('Ada Lovelace')
    })
})
