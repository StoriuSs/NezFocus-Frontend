import { useMutation } from '@tanstack/react-query'
import { authApi } from './auth.api'

/** Change the password, knowing the current one. Ends every other session. */
export function useChangePassword() {
    return useMutation({
        mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
            authApi.changePassword(currentPassword, newPassword),
        // The form shows what went wrong, field by field: no toast as well.
        meta: { errorToast: false }
    })
}
