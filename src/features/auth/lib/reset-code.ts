import { authApi } from '@/features/auth/api/auth.api'
import { recordCodeSent, resendAllowedAt } from './code-sent'
import { requestFailure, type RequestFailure } from './form-problem'

/**
 * "Forgot password?" in a dialog that asks for the password (Change password,
 * Delete account): email a reset code, for the code way (D-74). A code sent
 * under a minute ago is still good, so none is sent (L11). Resolves to what
 * went wrong, for the code form to say, or null.
 */
export async function sendResetCode(email: string): Promise<RequestFailure | null> {
    if (resendAllowedAt('password-reset', email)) return null
    try {
        await authApi.forgotPassword(email)
        recordCodeSent('password-reset', email)
        return null
    } catch (error) {
        return requestFailure(error)
    }
}
