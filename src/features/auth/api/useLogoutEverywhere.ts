import { useMutation } from '@tanstack/react-query'
import { authApi } from './auth.api'

/** End every session of this account, this one included. */
export function useLogoutEverywhere() {
    return useMutation({
        mutationFn: () => authApi.logoutEverywhere(),
        // The form shows what went wrong, field by field: no toast as well.
        meta: { errorToast: false }
    })
}
