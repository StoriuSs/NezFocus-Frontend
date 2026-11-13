import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import i18n from '@/i18n'
import { mockAuthStore, queryWrapper } from '@/test/helpers'

const authApi = { deleteAccount: vi.fn(), forgotPassword: vi.fn() }
const authState = { user: { email: 'ada@example.test' }, logout: vi.fn() }

vi.mock('@/features/auth/api/auth.api', () => ({ authApi }))
vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))

const { DeleteAccountSection } = await import('@/features/auth/components/DeleteAccountSection')
const { connectServerOwnership } = await import('@/features/auth/lib/server-ownership')

/** What the servers feature answers through the port (the AppShell connects the real one). */
const ownership = { owned: vi.fn(), showBlocked: vi.fn() }
connectServerOwnership(ownership)
const OT = { id: 'ot', name: 'Ôn thi Giải tích 2', memberCount: 13 }

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
        for (const fn of [...Object.values(authApi), ...Object.values(ownership), authState.logout]) fn.mockReset()
        ownership.owned.mockResolvedValue({ blocking: [], alone: [] })
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

    describe('the servers they own (REQ-AUTH-09, D-76, D-121)', () => {
        it('with others in one, says to hand it over first, before any password', async () => {
            ownership.owned.mockResolvedValue({ blocking: [OT], alone: [] })
            render(<DeleteAccountSection email='ada@example.test' username='ada' />, { wrapper: queryWrapper() })

            await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))

            await waitFor(() => expect(ownership.showBlocked).toHaveBeenCalledWith([OT], expect.anything()))
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })

        it('waits for the check, the button turning and keeping the focus; a second press asks nothing more', async () => {
            ownership.owned.mockReturnValue(new Promise(() => {}))
            render(<DeleteAccountSection email='ada@example.test' username='ada' />, { wrapper: queryWrapper() })
            const open = screen.getByRole('button', { name: 'Delete account' })

            open.focus()
            await userEvent.keyboard('{Enter}')
            await userEvent.click(open)

            expect(open).toHaveAttribute('aria-disabled', 'true')
            expect(open).toHaveFocus()
            expect(ownership.owned).toHaveBeenCalledTimes(1)
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })

        it('lets go of the button when the check breaks', async () => {
            ownership.owned.mockRejectedValue(new Error('bug'))
            render(<DeleteAccountSection email='ada@example.test' username='ada' />, { wrapper: queryWrapper() })
            const open = screen.getByRole('button', { name: 'Delete account' })

            await userEvent.click(open)

            await waitFor(() => expect(open).not.toHaveAttribute('aria-disabled', 'true'))
            expect(open).toBeEnabled()
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })

        it('drops the answer once the page is gone', async () => {
            let answer: (owned: unknown) => void = () => {}
            ownership.owned.mockReturnValue(new Promise((resolve) => (answer = resolve)))
            const { unmount } = render(<DeleteAccountSection email='ada@example.test' username='ada' />, {
                wrapper: queryWrapper()
            })
            await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))

            unmount()
            answer({ blocking: [OT], alone: [] })
            await new Promise((resolve) => setTimeout(resolve, 0))

            expect(ownership.showBlocked).not.toHaveBeenCalled()
        })

        it('names the servers only they are in, which go with the account', async () => {
            ownership.owned.mockResolvedValue({
                blocking: [],
                alone: [
                    { id: 'gt', name: 'CLB Guitar PTIT', memberCount: 1 },
                    { id: 'nd', name: 'Nháp', memberCount: 1 }
                ]
            })
            const dialog = await openDialog()

            expect(dialog).toHaveTextContent(
                'The servers only you are in are deleted with your account: CLB Guitar PTIT, Nháp. Their invite links stop working now.'
            )
            expect(within(dialog).getByText('CLB Guitar PTIT, Nháp').tagName).toBe('STRONG')
        })

        it('says it of one server in the singular', async () => {
            ownership.owned.mockResolvedValue({
                blocking: [],
                alone: [{ id: 'gt', name: 'CLB Guitar PTIT', memberCount: 1 }]
            })
            const dialog = await openDialog()

            expect(dialog).toHaveTextContent(
                'The server only you are in is deleted with your account: CLB Guitar PTIT. Its invite links stop working now.'
            )
        })

        it('says it of one server in the singular in Vietnamese too, which i18next counts as one form', async () => {
            await i18n.changeLanguage('vi')
            ownership.owned.mockResolvedValue({
                blocking: [],
                alone: [{ id: 'gt', name: 'CLB Guitar PTIT', memberCount: 1 }]
            })
            render(<DeleteAccountSection email='ada@example.test' username='ada' />, { wrapper: queryWrapper() })
            await userEvent.click(screen.getByRole('button', { name: 'Xóa tài khoản' }))
            const dialog = await screen.findByRole('dialog', { name: 'Xóa tài khoản?' })

            expect(dialog).toHaveTextContent('Link mời của server đó dừng ngay từ bây giờ.')
        })

        it('says nothing of servers when none goes with it', async () => {
            const dialog = await openDialog()
            expect(dialog).not.toHaveTextContent('servers only you are in')
        })

        it('gives way to the handover list when the API finds one with others in it', async () => {
            authApi.deleteAccount.mockRejectedValue(apiError(409, 'OWNERSHIP_TRANSFER_REQUIRED', {}, { servers: [OT] }))
            const dialog = await openDialog()

            await userEvent.type(within(dialog).getByLabelText('Password'), 'Harbour-Lantern-42')
            await userEvent.click(submit(dialog))

            await waitFor(() => expect(ownership.showBlocked).toHaveBeenCalledWith([OT], expect.anything()))
            expect(screen.queryByRole('dialog', { name: 'Delete your account?' })).not.toBeInTheDocument()
            expect(authState.logout).not.toHaveBeenCalled()
        })

        it('keeps the dialog, with the usual message, when the refusal names no server', async () => {
            authApi.deleteAccount.mockRejectedValue(apiError(409, 'OWNERSHIP_TRANSFER_REQUIRED', {}, {}))
            const dialog = await openDialog()

            await userEvent.type(within(dialog).getByLabelText('Password'), 'Harbour-Lantern-42')
            await userEvent.click(submit(dialog))

            await waitFor(() => expect(submit(dialog)).toBeEnabled())
            expect(dialog).toBeInTheDocument()
            expect(ownership.showBlocked).not.toHaveBeenCalled()
        })
    })
})
