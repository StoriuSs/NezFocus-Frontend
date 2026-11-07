import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { httpError } from '@/test/helpers'
import { signOutReasonOf } from '@/features/auth/lib/sign-out-reason'

const authState = {
    isAuthenticated: true,
    getToken: vi.fn<() => Promise<string | undefined>>(),
    refreshToken: vi.fn<() => Promise<string | undefined>>(),
    logout: vi.fn(),
    accountIncomplete: vi.fn()
}

const { default: api, connectApiSession } = await import('@/lib/api')

// As the auth feature's apiSession does, over a state the test controls.
connectApiSession({
    isSignedIn: () => authState.isAuthenticated,
    getToken: () => authState.getToken(),
    refreshToken: () => authState.refreshToken(),
    ended: (error, why) => authState.logout(why === 'account-disabled' ? 'account-disabled' : signOutReasonOf(error)),
    accountIncomplete: () => authState.accountIncomplete()
})

/** Replaces the network: a different answer for each request in turn (the last one repeats). */
function respondInTurn(...answers: [number, unknown][]) {
    const seen: InternalAxiosRequestConfig[] = []
    const adapter: AxiosAdapter = async (config) => {
        const [status, data] = answers[Math.min(seen.length, answers.length - 1)]!
        seen.push({ ...config, headers: config.headers.concat() } as InternalAxiosRequestConfig)
        if (status >= 400) throw httpError(status, data, { config })
        return { status, statusText: '', headers: {}, config, data }
    }
    api.defaults.adapter = adapter
    return seen
}

const refusal = (status: number, type: string, data?: unknown): [number, unknown] => [
    status,
    { meta: { code: String(status), type, message: '' }, data }
]

describe('api client', () => {
    beforeEach(() => {
        authState.isAuthenticated = true
        authState.getToken.mockReset().mockResolvedValue('token-123')
        authState.refreshToken.mockReset()
        authState.logout.mockReset()
        authState.accountIncomplete.mockReset()
    })

    it('attaches the bearer token when there is one, and nothing for anonymous visitors', async () => {
        const seen = respondInTurn([200, {}])
        await api.get('/a')
        authState.getToken.mockResolvedValue(undefined)
        await api.get('/b')

        expect(seen[0]!.headers.Authorization).toBe('Bearer token-123')
        expect(seen[1]!.headers.Authorization).toBeUndefined()
    })

    it('refreshes a refused access token once and retries with the new one, never twice', async () => {
        const seen = respondInTurn(refusal(401, 'AUTH_TOKEN_EXPIRED'), [200, { data: { ok: true } }])
        authState.refreshToken.mockResolvedValue('token-new')

        const response = await api.patch('/users/me', { displayName: 'A' })

        expect(response.data).toEqual({ data: { ok: true } })
        expect(seen).toHaveLength(2)
        expect(seen[1]!.headers.Authorization).toBe('Bearer token-new')
        // The retried body is the same request, not converted twice.
        expect(JSON.parse(seen[1]!.data)).toEqual({ display_name: 'A' })
        expect(authState.logout).not.toHaveBeenCalled()

        // Refused again after the refresh: no loop, the session is over.
        authState.refreshToken.mockClear()
        const again = respondInTurn(refusal(401, 'AUTH_TOKEN_EXPIRED'))
        await expect(api.get('/users/me')).rejects.toThrow()
        expect(again).toHaveLength(2)
        expect(authState.refreshToken).toHaveBeenCalledTimes(1)
        expect(authState.logout).toHaveBeenCalledExactlyOnceWith('session-expired')
    })

    it('signs out only when the session really ended, with the reason the API gave', async () => {
        // A dependency down, or a page this user may not see: the session is fine.
        respondInTurn(refusal(503, 'SERVICE_UNAVAILABLE_ERROR'))
        await expect(api.get('/users/me')).rejects.toThrow()
        respondInTurn(refusal(403, 'AUTH_FORBIDDEN'))
        await expect(api.get('/admin')).rejects.toThrow()
        expect(authState.logout).not.toHaveBeenCalled()

        // The account disabled: over.
        respondInTurn(refusal(403, 'AUTH_ACCOUNT_DISABLED'))
        await expect(api.get('/users/me')).rejects.toThrow()
        expect(authState.logout).toHaveBeenLastCalledWith('account-disabled')

        // A revoked session whose cookie has nothing newer either: over, and the
        // refresh has signed out with the reason it gave (auth.store).
        authState.refreshToken.mockResolvedValue(undefined)
        respondInTurn(refusal(401, 'AUTH_TOKEN_REVOKED', { reason: 'password_changed' }))
        await expect(api.get('/users/me')).rejects.toThrow()
        expect(authState.refreshToken).toHaveBeenCalledOnce()
    })

    it('takes up a newer session of this browser when its own was ended: a reset in another tab (D-74)', async () => {
        // The other tab reset the password with a code: every earlier session
        // ended, and the shared cookie now holds the one it started.
        const seen = respondInTurn(refusal(401, 'AUTH_TOKEN_REVOKED', { reason: 'password_reset' }), [200, {}])
        authState.refreshToken.mockResolvedValue('token-of-the-new-session')

        await api.get('/auth/sessions')

        expect(seen[1]!.headers.Authorization).toBe('Bearer token-of-the-new-session')
        // Signing out here would also end the new session, through the cookie.
        expect(authState.logout).not.toHaveBeenCalled()
    })

    it('opens "complete your account" when the API says the account is incomplete, keeping the session', async () => {
        respondInTurn(refusal(403, 'ACCOUNT_INCOMPLETE'))
        await expect(api.patch('/users/me', {})).rejects.toThrow()
        expect(authState.accountIncomplete).toHaveBeenCalledOnce()
        expect(authState.logout).not.toHaveBeenCalled()

        // Any other 403 is the caller's to show.
        respondInTurn(refusal(403, 'AUTH_FORBIDDEN'))
        await expect(api.get('/admin')).rejects.toThrow()
        expect(authState.accountIncomplete).toHaveBeenCalledOnce()
    })

    it('sends no bearer token to the auth routes, and treats their 401 as an answer, not a lost session', async () => {
        const seen = respondInTurn(refusal(401, 'AUTH_INVALID_CREDENTIALS'))

        await expect(api.post('/auth/login', {}, { skipAuth: true })).rejects.toThrow()

        expect(seen[0]!.headers.Authorization).toBeUndefined()
        expect(authState.getToken).not.toHaveBeenCalled()
        expect(authState.refreshToken).not.toHaveBeenCalled()
        expect(authState.logout).not.toHaveBeenCalled()
    })
})
