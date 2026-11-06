import { useMutation } from '@tanstack/react-query'
import { authApi } from './auth.api'

/** Delete the account, confirmed with its password: every account has one (D-130). */
export function useDeleteAccount() {
    return useMutation({
        mutationFn: (password: string) => authApi.deleteAccount(password),
        // The form shows what went wrong, field by field: no toast as well.
        meta: { errorToast: false }
    })
}
