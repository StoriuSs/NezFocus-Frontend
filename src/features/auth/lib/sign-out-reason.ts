import axios from 'axios'

/**
 * Why the session ended, shown once after the redirect back to the app.
 * Ended elsewhere (the API says which): `password-changed`,
 * `signed-out-everywhere` ("Sign out the other devices" on another device,
 * D-75), `signed-out`, `security`, `account-disabled`, or `session-expired`
 * for an expiry, a sign-out from the list of sessions, or no reason. Ended
 * here, by the person: `account-deleted`.
 */
export type SignOutReason =
    | 'session-expired'
    | 'account-disabled'
    | 'password-changed'
    | 'signed-out-everywhere'
    | 'signed-out'
    | 'security'
    | 'account-deleted'

export const SIGN_OUT_REASONS = new Set<string>([
    'session-expired',
    'account-disabled',
    'password-changed',
    'signed-out-everywhere',
    'signed-out',
    'security',
    'account-deleted'
])

/**
 * The reason a refused request or refresh gives (the API's `data.reason` on
 * the 401), as a SignOutReason. None, or one this app does not know: expired.
 */
export function signOutReasonOf(error: unknown): SignOutReason {
    const data = axios.isAxiosError(error)
        ? (error.response?.data as { data?: { reason?: unknown } } | undefined)?.data
        : undefined
    switch (data?.reason) {
        case 'password_changed':
            return 'password-changed'
        case 'signed_out_everywhere':
            return 'signed-out-everywhere'
        case 'signed_out':
            return 'signed-out'
        case 'security':
            return 'security'
        case 'account_deleted':
            return 'account-disabled'
        // Signed out from the list of sessions: worded like an expiry (D-65).
        case 'revoked':
        default:
            return 'session-expired'
    }
}
