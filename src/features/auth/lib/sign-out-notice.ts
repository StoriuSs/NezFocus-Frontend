import { toast } from 'sonner'
import i18n from '@/i18n'
import type { SignOutReason } from './sign-out-reason'

/**
 * Says why the session ended, once the app has reloaded after it: an error
 * for a deleted account, good news for what the person did themselves, and
 * information for the rest.
 */
export function announceSignOut(reason: SignOutReason | null): void {
    if (!reason) return
    if (reason === 'account-disabled') toast.error(i18n.t('api:AUTH_ACCOUNT_DISABLED'))
    else if (reason === 'session-expired') toast.info(i18n.t('api:AUTH_TOKEN_EXPIRED'))
    else if (reason === 'you-signed-out-everywhere' || reason === 'account-deleted') {
        toast.success(i18n.t(`auth:signedOut.${reason}`))
    } else toast.info(i18n.t(`auth:signedOut.${reason}`))
}
