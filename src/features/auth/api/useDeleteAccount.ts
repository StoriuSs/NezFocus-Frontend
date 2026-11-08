import { useMutation } from '@tanstack/react-query'
import { authApi } from './auth.api'

/**
 * Ask to delete the account, confirmed with its password: every account has
 * one (D-130). Resolves to when it goes (D-141).
 */
export function useDeleteAccount() {
    return useMutation({
        mutationFn: (password: string) => authApi.deleteAccount(password),
        // The form shows what went wrong, field by field: no toast as well.
        meta: { errorToast: false }
    })
}
