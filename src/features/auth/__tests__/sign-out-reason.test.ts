import { describe, expect, it } from 'vitest'
import { AxiosError, type AxiosResponse } from 'axios'
import { deletesAtOf, signOutReasonOf } from '@/features/auth/lib/sign-out-reason'

const refusedWith = (reason?: string, deletesAt?: string) =>
    new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 401,
        data: { data: reason ? { reason, ...(deletesAt ? { deletesAt } : {}) } : null }
    } as AxiosResponse)

describe('why the API says a session ended', () => {
    it('names what another device did (D-65, D-75)', () => {
        expect(signOutReasonOf(refusedWith('signed_out_everywhere'))).toBe('signed-out-everywhere')
        expect(signOutReasonOf(refusedWith('password_changed'))).toBe('password-changed')
        expect(signOutReasonOf(refusedWith('security'))).toBe('security')
    })

    it('words a sign-out from the list of sessions like an expiry: the plain sentence', () => {
        expect(signOutReasonOf(refusedWith('revoked'))).toBe('session-expired')
        expect(signOutReasonOf(refusedWith('expired'))).toBe('session-expired')
        expect(signOutReasonOf(refusedWith())).toBe('session-expired')
    })

    it('tells an account waiting to be deleted, which says until when, from a deleted one (D-141)', () => {
        const waiting = refusedWith('account_deleted', '2026-10-29T14:47:00.000Z')
        expect(signOutReasonOf(waiting)).toBe('account-deleted')
        expect(deletesAtOf(waiting)).toBe('2026-10-29T14:47:00.000Z')
        expect(signOutReasonOf(refusedWith('account_deleted'))).toBe('account-disabled')
        expect(deletesAtOf(refusedWith('password_changed'))).toBeUndefined()
    })
})
