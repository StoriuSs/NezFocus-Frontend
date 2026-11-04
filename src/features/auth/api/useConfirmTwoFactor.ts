import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from './auth.api'
import { authKeys } from './keys'

/** Finish turning it on, with a code from the app. Answers the recovery codes. */
export function useConfirmTwoFactor() {
    const queryClient = useQueryClient()
    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: authKeys.twoFactorStatus() })
    }

    return useMutation({
        mutationFn: (code: string) => authApi.confirmTwoFactor(code),
        onSuccess: refresh,
        // The form shows what went wrong, field by field: no toast as well.
        meta: { errorToast: false }
    })
}
