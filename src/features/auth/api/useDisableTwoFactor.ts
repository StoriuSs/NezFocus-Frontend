import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiErrorType } from '@/lib/api-error'
import { authApi } from './auth.api'
import { authKeys } from './keys'

/** Turn two-step sign-in off, with a code from the app or a recovery code. */
export function useDisableTwoFactor() {
    const queryClient = useQueryClient()
    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: authKeys.twoFactorStatus() })
    }

    return useMutation({
        mutationFn: (code: string) => authApi.disableTwoFactor(code),
        onSuccess: refresh,
        onError: (error) => {
            // Turned off in another tab: show it as it is.
            if (getApiErrorType(error) === 'AUTH_TWO_FACTOR_NOT_ON') refresh()
        },
        // The form shows what went wrong, field by field: no toast as well.
        meta: { errorToast: false }
    })
}
