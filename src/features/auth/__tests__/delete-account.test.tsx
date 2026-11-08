import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import i18n from '@/i18n'
import { mockAuthStore, queryWrapper } from '@/test/helpers'

const authApi = { deleteAccount: vi.fn(), forgotPassword: vi.fn() }
const authState = { user: { email: 'ada@example.test' }, logout: vi.fn() }

vi.mock('@/features/auth/api/auth.api', () => ({ authApi }))
vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))

const { DeleteAccountSection } = await import('@/features/auth/components/DeleteAccountSection')

/** An answer from the API, as axios rejects with it. */
function apiError(status: number, type: string, headers: Record<string, string> = {}, data: unknown = null) {
    const response = {
        status,
        data: { meta: { code: String(status), type, message: '' }, data },
        headers,
        statusText: '',
        config: { headers: new AxiosHeaders() }
    } as AxiosResponse
    return new AxiosError('refused', String(status), response.config, null, response)
}

const NOW = new Date('2026-10-18T14:47:00Z')

async function openDialog() {
    render(<DeleteAccountSection email='ada@example.test' username='ada' />, { wrapper: queryWrapper() })
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    return screen.findByRole('dialog', { name: 'Delete your account?' })
}
const submit = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Delete account' })

// 10-settings › S-ME-03 `delete-confirm`; REQ-AUTH-09, D-141
describe('deleting your account', () => {
    beforeEach(async () => {
        vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
        await i18n.changeLanguage('en')
        for (const fn of [...Object.values(authApi), authState.logout]) fn.mockReset()
        sessionStorage.clear()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('says the day it goes, 14 days from now, and waits for the password', async () => {
        const dialog = await openDialog()

        expect(dialog).toHaveTextContent('deleted for good on 01/11/2026')
        expect(submit(dialog)).toBeDisabled()
        await userEvent.type(within(dialog).getByLabelText('Password'), 'x')
        expect(submit(dialog)).toBeEnabled()
    })

    it('asks to delete it, then signs out with the day the API gave, for the sign-in page to show', async () => {
        authApi.deleteAccount.mockResolvedValue('2026-11-01T14:47:00.000Z')
        const dialog = await openDialog()

        await userEvent.type(within(dialog).getByLabelText('Password'), 'Harbour-Lantern-42')
        await userEvent.click(submit(dialog))

        expect(authApi.deleteAccount).toHaveBeenCalledWith('Harbour-Lantern-42')
        expect(authState.logout).toHaveBeenCalledWith('account-deleted', undefined, '2026-11-01T14:47:00.000Z')
    })

    it('says a wrong password under the field, and keeps the account', async () => {
        authApi.deleteAccount.mockRejectedValue(apiError(400, 'AUTH_CURRENT_PASSWORD_INVALID'))
        const dialog = await openDialog()

        await userEvent.type(within(dialog).getByLabelText('Password'), 'Wrong-Password-1')
        await userEvent.click(submit(dialog))

        expect(await within(dialog).findByText("That password isn't right")).toBeInTheDocument()
        expect(authState.logout).not.toHaveBeenCalled()
    })

    it('waits out five wrong passwords, as changing it does (D-121)', async () => {
        authApi.deleteAccount.mockRejectedValue(
            apiError(429, 'RATE_LIMIT_EXCEEDED', { 'retry-after': '900' }, { reason: 'wrong_password' })
        )
        const dialog = await openDialog()

        await userEvent.type(within(dialog).getByLabelText('Password'), 'Wrong-Password-1')
        await userEvent.click(submit(dialog))

        expect(await within(dialog).findByText(/too many times\. Try again in 15 minutes/)).toBeInTheDocument()
        expect(submit(dialog)).toBeDisabled()
    })

    it('"Forgot password?" sends a code and hands over to the password dialog, whose Back comes here again', async () => {
        authApi.forgotPassword.mockResolvedValue(undefined)
        const dialog = await openDialog()

        await userEvent.click(within(dialog).getByRole('button', { name: 'Forgot password?' }))

        const reset = await screen.findByRole('dialog', { name: 'Choose a new password' })
        expect(authApi.forgotPassword).toHaveBeenCalledWith('ada@example.test')
        expect(screen.queryByRole('dialog', { name: 'Delete your account?' })).not.toBeInTheDocument()

        await userEvent.click(within(reset).getByRole('button', { name: 'Back' }))

        const again = await screen.findByRole('dialog', { name: 'Delete your account?' })
        expect(within(again).getByLabelText('Password')).toHaveValue('')
    })
})
