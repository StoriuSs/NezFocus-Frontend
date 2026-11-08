import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import { currentLanguage } from '@/i18n'
import type { AccountCompletion, AuthOptions, EmailCodeSignIn, SessionList, TokenResponse } from '@/features/auth/types'
import { untilSignedOut } from '@/features/auth/lib/sign-out-in-flight'

/**
 * The API's auth routes (the backend's docs/auth/api-reference.md).
 *
 * `skipAuth`: no bearer token, and their own 401s are answers, not a sign the
 * session ended — a wrong password is a 401 too (src/lib/api.ts).
 * `withCredentials`: the refresh cookie crosses origins (the app and the API
 * are on different ports in development, different hosts in production), and
 * the browser only sends it, or stores the one a response sets, with this.
 *
 * Every request that makes the API send an email carries the language on
 * screen, so the email reads like the page that asked for it (D-132).
 *
 * The requests that set the refresh cookie wait for a sign-out still on its
 * way, whose answer would clear the new cookie (sign-out-in-flight.ts).
 */
const auth = { skipAuth: true, withCredentials: true } as const

export const authApi = {
    async login(email: string, password: string): Promise<TokenResponse> {
        await untilSignedOut()
        const response = await api.post<ApiEnvelope<TokenResponse>>('/auth/login', { email, password }, auth)
        return response.data.data
    },

    /**
     * Email a sign-in code (D-59, D-60): the first step of creating an
     * account and of signing in with a code. The API answers the same whether
     * the address has an account or not.
     */
    async sendEmailCode(email: string): Promise<void> {
        await api.post('/auth/email-code', { email, language: currentLanguage() }, auth)
    },

    /**
     * Sign in with the emailed code: tokens and the refresh cookie, and
     * whether the account was made just now and has done "complete your
     * account" (D-61).
     */
    async verifyEmailCode(email: string, code: string): Promise<EmailCodeSignIn> {
        await untilSignedOut()
        const response = await api.post<ApiEnvelope<EmailCodeSignIn>>('/auth/email-code/verify', { email, code }, auth)
        return response.data.data
    },

    /**
     * The "complete your account" step (S-ONB-01). Signed in: the access
     * token in use keeps working afterwards, now for the whole app.
     */
    async completeAccount(form: Omit<AccountCompletion, 'language'>): Promise<void> {
        await api.post('/auth/complete-account', { ...form, language: currentLanguage() })
    },

    async forgotPassword(email: string): Promise<void> {
        await api.post('/auth/forgot-password', { email, language: currentLanguage() }, auth)
    },

    /** Ends every earlier session, then signs in here: tokens, and a new refresh cookie. */
    async resetPassword(email: string, code: string, password: string): Promise<TokenResponse> {
        await untilSignedOut()
        const response = await api.post<ApiEnvelope<TokenResponse>>(
            '/auth/reset-password',
            { email, code, password, language: currentLanguage() },
            auth
        )
        return response.data.data
    },

    /** The other sign-in providers the API is configured for (`google`), to offer as buttons. */
    async options(): Promise<AuthOptions> {
        const response = await api.get<ApiEnvelope<AuthOptions>>('/auth/options', auth)
        return response.data.data
    },

    /** A new access token for the cookie. Rejects with a 401 when the session is over. */
    async refresh(): Promise<TokenResponse> {
        await untilSignedOut()
        const response = await api.post<ApiEnvelope<TokenResponse>>('/auth/refresh', undefined, auth)
        return response.data.data
    },

    /** Ends the cookie's session and clears the cookie. Always succeeds on the API's side. */
    async logout(): Promise<void> {
        await api.post('/auth/logout', undefined, { ...auth, timeout: 5_000 })
    },

    // Signed-in routes: an ordinary request with the bearer token.

    /** The signed-in devices: this one first, then by latest use (D-75). */
    async sessions(): Promise<SessionList> {
        const response = await api.get<ApiEnvelope<SessionList>>('/auth/sessions')
        return response.data.data
    },

    /** Sign out one device. The same answer if it had already ended. */
    async revokeSession(id: string): Promise<void> {
        await api.delete(`/auth/sessions/${encodeURIComponent(id)}`)
    },

    /** "Sign out the other devices": every session but this one ends. Resolves to how many ended. */
    async revokeOtherSessions(): Promise<number> {
        const response = await api.delete<ApiEnvelope<{ revoked: number }>>('/auth/sessions')
        return response.data.data.revoked
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
        await api.post('/auth/change-password', { currentPassword, newPassword, language: currentLanguage() })
    },

    /**
     * Ask to delete this account, confirmed with its password: it goes 14 days
     * later unless restored (D-141). Every session ends, this one included.
     * Resolves to when it goes (ISO 8601).
     */
    async deleteAccount(password: string): Promise<string> {
        const response = await api.post<ApiEnvelope<{ deletesAt: string }>>(
            '/auth/account/delete',
            { password, language: currentLanguage() },
            { withCredentials: true }
        )
        return response.data.data.deletesAt
    },

    /** Take back the request to delete this account: right after signing in to it (D-141). */
    async restoreAccount(): Promise<void> {
        await api.post('/auth/account/restore')
    }
}
