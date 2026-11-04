import axios from 'axios'

/**
 * Why the session ended, shown once after the redirect back to the app.
 * Ended elsewhere (the API says which): `password-changed`,
 * `signed-out-everywhere`, `signed-out`, `security`, `account-disabled`, or
 * `session-expired` when it gives no reason. Ended here, by the person:
 * `you-signed-out-everywhere`, `account-deleted`.
 */
export type SignOutReason =
    | 'session-expired'
    | 'account-disabled'
    | 'password-changed'
    | 'signed-out-everywhere'
    | 'signed-out'
    | 'security'
    | 'you-signed-out-everywhere'
    | 'account-deleted'

export const SIGN_OUT_REASONS = new Set<string>([
    'session-expired',
    'account-disabled',
    'password-changed',
    'signed-out-everywhere',
    'signed-out',
    'security',
    'you-signed-out-everywhere',
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
        default:
            return 'session-expired'
    }
}
