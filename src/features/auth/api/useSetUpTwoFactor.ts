import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiErrorType } from '@/lib/api-error'
import { authApi } from './auth.api'
import { authKeys } from './keys'

/** Start turning two-step sign-in on: the secret and QR code to scan. */
export function useSetUpTwoFactor() {
    const queryClient = useQueryClient()
    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: authKeys.twoFactorStatus() })
    }

    return useMutation({
        mutationFn: () => authApi.setUpTwoFactor(),
        onError: (error) => {
            // Turned on in another tab: show it as it is.
            if (getApiErrorType(error) === 'AUTH_TWO_FACTOR_ALREADY_ON') refresh()
        },
        // The form shows what went wrong, field by field: no toast as well.
        meta: { errorToast: false }
    })
}
