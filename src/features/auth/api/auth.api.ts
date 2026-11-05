import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { AuthOptions, SignInMethods, TokenResponse } from '@/features/auth/types'

/**
 * The API's auth routes (the API starter's docs/auth/api-reference.md).
 *
 * `skipAuth`: no bearer token, and their own 401s are answers, not a sign the
 * session ended — a wrong password is a 401 too (src/lib/api.ts).
 * `withCredentials`: the refresh cookie crosses origins (the app and the API
 * are on different ports in development, different hosts in production), and
 * the browser only sends it, or stores the one a response sets, with this.
 */
const auth = { skipAuth: true, withCredentials: true } as const

/** Signing in (login, verify-email, reset-password) answers with tokens. */
export const authApi = {
    async login(email: string, password: string): Promise<TokenResponse> {
        const response = await api.post<ApiEnvelope<TokenResponse>>('/auth/login', { email, password }, auth)
        return response.data.data
    },

    async register(email: string, password: string): Promise<void> {
        await api.post('/auth/register', { email, password }, auth)
    },

    /**
     * Confirms the address and signs in: tokens, and the refresh cookie. The
     * password is the one chosen at sign-up: the API asks for it so that
     * someone who signs the address up again cannot have its owner confirm
     * their account.
     */
    async verifyEmail(email: string, code: string, password: string): Promise<TokenResponse> {
        const response = await api.post<ApiEnvelope<TokenResponse>>(
            '/auth/verify-email',
            { email, code, password },
            auth
        )
        return response.data.data
    },

    async resendVerification(email: string): Promise<void> {
        await api.post('/auth/resend-verification', { email }, auth)
    },

    async forgotPassword(email: string): Promise<void> {
        await api.post('/auth/forgot-password', { email }, auth)
    },

    /** Ends every earlier session, then signs in here: tokens, and a new refresh cookie. */
    async resetPassword(email: string, code: string, password: string): Promise<TokenResponse> {
        const response = await api.post<ApiEnvelope<TokenResponse>>(
            '/auth/reset-password',
            { email, code, password },
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
        const response = await api.post<ApiEnvelope<TokenResponse>>('/auth/refresh', undefined, auth)
        return response.data.data
    },

    /** Ends the cookie's session and clears the cookie. Always succeeds on the API's side. */
    async logout(): Promise<void> {
        await api.post('/auth/logout', undefined, { ...auth, timeout: 5_000 })
    },

    // Signed-in routes: an ordinary request with the bearer token. withCredentials
    // because the answer clears the cookie.
    async logoutEverywhere(): Promise<void> {
        await api.post('/auth/logout-all', undefined, { withCredentials: true })
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
        await api.post('/auth/change-password', { currentPassword, newPassword })
    },

    /** How this account signs in: a password, other providers (`google`), or both. */
    async signInMethods(): Promise<SignInMethods> {
        const response = await api.get<ApiEnvelope<SignInMethods>>('/auth/sign-in-methods')
        return response.data.data
    },

    /** For an account without a password (made with Google): email a code to set one. */
    async sendPasswordSetCode(): Promise<void> {
        await api.post('/auth/password/code')
    },

    /** Set a first password with that code. The account keeps Google, and this session. */
    async setPassword(code: string, newPassword: string): Promise<void> {
        await api.post('/auth/password', { code, newPassword })
    },

    /** For deleting an account without a password (made with Google): email a code to confirm with. */
    async sendAccountDeletionCode(): Promise<void> {
        await api.post('/auth/account/delete-code')
    },

    /**
     * Delete this account, with proof it is you: the password, or the emailed
     * code for an account without one. Every session ends, this one included.
     */
    async deleteAccount(proof: { password?: string; code?: string }): Promise<void> {
        await api.post('/auth/account/delete', proof, { withCredentials: true })
    }
}
