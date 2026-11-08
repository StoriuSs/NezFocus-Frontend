import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiError } from '@/test/helpers'

const logout = vi.fn()
vi.mock('@/features/auth/auth.store', () => ({ useAuthStore: { getState: () => ({ logout }) } }))

const { apiSession } = await import('../lib/api-session')

const DELETES_AT = '2026-11-22T09:30:00.000Z'

/** What the API client does when a request says the session is over (src/lib/api.ts). */
describe('the session as the API client sees it', () => {
    beforeEach(() => logout.mockReset())

    it('signs out with the day an account waiting to be deleted goes, for the sign-in banner (D-141)', () => {
        apiSession.ended(
            apiError(401, 'AUTH_REFRESH_FAILED', { data: { reason: 'account_deleted', deletesAt: DELETES_AT } }),
            'refused'
        )

        expect(logout).toHaveBeenCalledExactlyOnceWith('account-deleted', undefined, DELETES_AT)
    })

    it('signs out a deleted account with its own reason', () => {
        apiSession.ended(apiError(403, 'AUTH_ACCOUNT_DISABLED'), 'account-disabled')

        expect(logout).toHaveBeenCalledExactlyOnceWith('account-disabled')
    })
})
