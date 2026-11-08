import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/i18n'
import { mockAuthStore } from '@/test/helpers'

const authState = {
    deletesAt: '2026-11-22T09:30:00.000Z' as string | null,
    restoreAccount: vi.fn(),
    setRestoreAside: vi.fn()
}
const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })

vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))
vi.mock('sonner', () => ({ toast }))

const { default: PendingDeletionDialog } = await import('@/features/auth/components/PendingDeletionDialog')

const dialog = () => screen.findByRole('dialog', { name: 'Your account is waiting to be deleted' })

// 01-auth › S-AUTH-03 `pending-deletion`; REQ-AUTH-09, D-141
describe('the restore dialog', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('en')
    })

    beforeEach(() => {
        authState.restoreAccount.mockReset()
        authState.setRestoreAside.mockReset()
        toast.success.mockReset()
    })

    it('restores the account and says so', async () => {
        authState.restoreAccount.mockResolvedValue(undefined)
        render(<PendingDeletionDialog />)
        await dialog()

        await userEvent.click(screen.getByRole('button', { name: 'Restore account' }))

        expect(authState.restoreAccount).toHaveBeenCalledOnce()
        expect(toast.success).toHaveBeenCalledWith('Account restored')
        expect(authState.setRestoreAside).not.toHaveBeenCalled()
    })

    it('"Not now" and Esc set it aside: the session just opened ends', async () => {
        render(<PendingDeletionDialog />)
        await dialog()

        await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
        await userEvent.keyboard('{Escape}')

        expect(authState.setRestoreAside).toHaveBeenCalledTimes(2)
    })

    it('does not sign out on Esc while the restore is on its way', async () => {
        authState.restoreAccount.mockReturnValue(new Promise(() => undefined))
        render(<PendingDeletionDialog />)
        await dialog()

        await userEvent.click(screen.getByRole('button', { name: 'Restore account' }))
        await userEvent.keyboard('{Escape}')

        expect(authState.setRestoreAside).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Not now' })).toBeDisabled()
    })
})
