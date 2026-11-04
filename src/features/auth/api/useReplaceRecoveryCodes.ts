import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiErrorType } from '@/lib/api-error'
import { authApi } from './auth.api'
import { authKeys } from './keys'

/** New recovery codes, with a code from the app; the earlier ones stop working. */
export function useReplaceRecoveryCodes() {
    const queryClient = useQueryClient()
    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: authKeys.twoFactorStatus() })
    }

    return useMutation({
        mutationFn: (code: string) => authApi.replaceRecoveryCodes(code),
        onSuccess: refresh,
        onError: (error) => {
            // Turned off in another tab: show it as it is.
            if (getApiErrorType(error) === 'AUTH_TWO_FACTOR_NOT_ON') refresh()
        },
        // The form shows what went wrong, field by field: no toast as well.
        meta: { errorToast: false }
    })
}
