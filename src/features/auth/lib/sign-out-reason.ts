import axios from 'axios'

/**
 * Why the session ended, shown once after the redirect back to the app.
 * Ended elsewhere (the API says which): `password-changed`,
 * `signed-out-everywhere` ("Sign out the other devices" on another device,
 * D-75), `signed-out`, `security`, `account-disabled`, or `session-expired`
 * for an expiry, a sign-out from the list of sessions, or no reason.
 * `account-deleted`: the account waits to be deleted (D-141), asked here or
 * on another device; `account-disabled`: it is deleted.
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
        // Asked to be deleted, so it can still be restored: the answer says
        // until when. Without a date, it is deleted.
        case 'account_deleted':
            return deletesAtOf(error) ? 'account-deleted' : 'account-disabled'
        // Signed out from the list of sessions: worded like an expiry (D-65).
        case 'revoked':
        default:
            return 'session-expired'
    }
}

/** When the account goes, from a refused refresh of an account waiting to be deleted (`data.deletes_at`, D-141). */
export function deletesAtOf(error: unknown): string | undefined {
    const data = axios.isAxiosError(error)
        ? (error.response?.data as { data?: { deletesAt?: unknown } } | undefined)?.data
        : undefined
    return typeof data?.deletesAt === 'string' ? data.deletesAt : undefined
}
