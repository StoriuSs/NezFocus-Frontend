import { toast } from 'sonner'
import i18n from '@/i18n'
import type { SignOutReason } from './sign-out-reason'

/**
 * A session that ended by itself or elsewhere: said by a banner on the
 * sign-in page, which is where it lands (S-AUTH-03 `session-revoked`, D-65,
 * D-75). `ended` covers an expired session and one ended from another device;
 * `account-deleted`, an account waiting to be deleted (S-AUTH-03
 * `account-deleted`, D-141), whose banner says until when.
 */
export type SessionEnded = 'password-changed' | 'signed-out-everywhere' | 'security' | 'ended' | 'account-deleted'

/** The banner for a reason, or null when the reason is said by a toast instead. */
export function sessionEndedOf(reason: SignOutReason | null): SessionEnded | null {
    switch (reason) {
        case 'password-changed':
        case 'signed-out-everywhere':
        case 'security':
        case 'account-deleted':
            return reason
        case 'session-expired':
        case 'signed-out':
            return 'ended'
        default:
            return null
    }
}

/** Is this reason the sign-in page's to say, in its banner. */
export const isSessionEnded = (reason: SignOutReason): boolean => sessionEndedOf(reason) !== null

/**
 * Says why the session ended, once the app has reloaded after it, for the
 * reason the sign-in page does not: an error for a deleted account. The rest
 * are left for the sign-in page's banner.
 */
export function announceSignOut(reason: SignOutReason | null): void {
    if (reason === 'account-disabled') toast.error(i18n.t('api:AUTH_ACCOUNT_DISABLED'))
}
