import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() })
vi.mock('sonner', () => ({ toast }))

const { announceSignOut, sessionEndedOf } = await import('@/features/auth/lib/sign-out-notice')

describe('saying why a session ended', () => {
    beforeEach(() => {
        for (const fn of [toast, toast.success, toast.error, toast.info]) fn.mockReset()
    })

    it('leaves a session that ended by itself or elsewhere to the sign-in page’s banner (D-65)', () => {
        for (const reason of [
            'password-changed',
            'signed-out-everywhere',
            'security',
            'session-expired',
            'signed-out'
        ] as const) {
            announceSignOut(reason)
        }
        expect([toast, toast.success, toast.error, toast.info].every((fn) => fn.mock.calls.length === 0)).toBe(true)
    })

    it('words an expiry and a session ended from another device alike', () => {
        expect(sessionEndedOf('session-expired')).toBe('ended')
        expect(sessionEndedOf('signed-out')).toBe('ended')
        expect(sessionEndedOf('password-changed')).toBe('password-changed')
        expect(sessionEndedOf('you-signed-out-everywhere')).toBeNull()
        expect(sessionEndedOf(null)).toBeNull()
    })

    it('toasts what the person did themselves, and a disabled account as an error', () => {
        announceSignOut('you-signed-out-everywhere')
        announceSignOut('account-disabled')
        expect(toast.success).toHaveBeenCalledTimes(1)
        expect(toast.error).toHaveBeenCalledTimes(1)
    })
})
