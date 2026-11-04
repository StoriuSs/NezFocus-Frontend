import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiErrorType } from '@/lib/api-error'
import { authApi } from './auth.api'
import { authKeys } from './keys'

/** Email the code that confirms deleting an account with no password. */
export function useSendAccountDeletionCode() {
    const queryClient = useQueryClient()
    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: authKeys.signInMethods() })
    }

    return useMutation({
        mutationFn: () => authApi.sendAccountDeletionCode(),
        onError: (error) => {
            // The account has a password after all (set in another tab): ask for it.
            if (getApiErrorType(error) === 'AUTH_USE_PASSWORD') refresh()
        },
        // The form shows what went wrong, field by field: no toast as well.
        meta: { errorToast: false }
    })
}
