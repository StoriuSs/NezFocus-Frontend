import { describe, expect, it } from 'vitest'
import { AxiosError, type AxiosResponse } from 'axios'
import { signOutReasonOf } from '@/features/auth/lib/sign-out-reason'

const refusedWith = (reason?: string) =>
    new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 401,
        data: { data: reason ? { reason } : null }
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
})
