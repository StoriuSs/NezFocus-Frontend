import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type {
    AuthOptions,
    RecoveryCodes,
    SignInMethods,
    TokenResponse,
    TwoFactorSetUp,
    TwoFactorStatus
} from '@/features/auth/types'

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

/**
 * Signing in (login, verify-email, reset-password) answers with tokens, or,
 * when the account has two-step sign-in on, with a 403
 * AUTH_TWO_FACTOR_REQUIRED carrying a challenge: see authFormError() in
 * form-errors.ts, and the two-step page that finishes it.
 *
 * `turnstileToken` is the Turnstile widget's answer, sent when the API asks
 * for one (useTurnstile.tsx); left out otherwise.
 */
export const authApi = {
    async login(email: string, password: string, turnstileToken?: string): Promise<TokenResponse> {
        const response = await api.post<ApiEnvelope<TokenResponse>>(
            '/auth/login',
            { email, password, turnstileToken },
            auth
        )
        return response.data.data
    },

    async register(email: string, password: string, turnstileToken?: string): Promise<void> {
        await api.post('/auth/register', { email, password, turnstileToken }, auth)
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

    async forgotPassword(email: string, turnstileToken?: string): Promise<void> {
        await api.post('/auth/forgot-password', { email, turnstileToken }, auth)
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

    /**
     * The second step of signing in: a code from the authenticator app, or a
     * recovery code. `challenge` came with the first step's 403; after Google
     * it is in a cookie instead, and left out here.
     */
    async completeTwoFactor(code: string, challenge?: string): Promise<TokenResponse> {
        const response = await api.post<ApiEnvelope<TokenResponse>>('/auth/login/2fa', { code, challenge }, auth)
        return response.data.data
    },

    /**
     * What the sign-in pages need from the API's configuration: the other
     * providers (`google`), to offer as buttons, and Turnstile's site key, or
     * null when Turnstile is off.
     */
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
     * code for an account without one, and a two-step code when that is on.
     * Every session ends, this one included.
     */
    async deleteAccount(proof: { password?: string; code?: string; twoFactorCode?: string }): Promise<void> {
        await api.post('/auth/account/delete', proof, { withCredentials: true })
    },

    async twoFactorStatus(): Promise<TwoFactorStatus> {
        const response = await api.get<ApiEnvelope<TwoFactorStatus>>('/auth/2fa')
        return response.data.data
    },

    /** A new secret for the authenticator app. Not asked for at sign-in until confirmed. */
    async setUpTwoFactor(): Promise<TwoFactorSetUp> {
        const response = await api.post<ApiEnvelope<TwoFactorSetUp>>('/auth/2fa/setup')
        return response.data.data
    },

    /** Turns two-step sign-in on with a code from the app. Resolves with the recovery codes, shown this once. */
    async confirmTwoFactor(code: string): Promise<string[]> {
        const response = await api.post<ApiEnvelope<RecoveryCodes>>('/auth/2fa/confirm', {
            code
        })
        return response.data.data.recoveryCodes
    },

    /** New recovery codes, with a code from the app: the old ones stop working. Resolves with the new ones, shown this once. */
    async replaceRecoveryCodes(code: string): Promise<string[]> {
        const response = await api.post<ApiEnvelope<RecoveryCodes>>('/auth/2fa/recovery-codes', {
            code
        })
        return response.data.data.recoveryCodes
    },

    /** Turns it off, with a code from the app or a recovery code. */
    async disableTwoFactor(code: string): Promise<void> {
        await api.post('/auth/2fa/disable', { code })
    }
}
