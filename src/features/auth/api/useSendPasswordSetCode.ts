import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiErrorType } from '@/lib/api-error'
import { authApi } from './auth.api'
import { authKeys } from './keys'

/** Email the code for setting a first password (an account made with Google). */
export function useSendPasswordSetCode() {
    const queryClient = useQueryClient()
    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: authKeys.signInMethods() })
    }

    return useMutation({
        mutationFn: () => authApi.sendPasswordSetCode(),
        onError: (error) => {
            // Set in another tab meanwhile: show the page as it is now.
            if (getApiErrorType(error) === 'AUTH_PASSWORD_ALREADY_SET') refresh()
        },
        // The form shows what went wrong, field by field: no toast as well.
        meta: { errorToast: false }
    })
}
