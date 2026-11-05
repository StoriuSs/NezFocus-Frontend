import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiErrorType } from '@/lib/api-error'
import { authApi } from './auth.api'
import { authKeys } from './keys'

/** Delete the account, with the proof it needs (password or code). */
export function useDeleteAccount() {
    const queryClient = useQueryClient()
    const refresh = () => void queryClient.invalidateQueries({ queryKey: authKeys.signInMethods() })

    return useMutation({
        mutationFn: (proof: Parameters<typeof authApi.deleteAccount>[0]) => authApi.deleteAccount(proof),
        onError: (error) => {
            // Asked for proof this page did not know it needed: read again what the account has.
            if (getApiErrorType(error) === 'AUTH_CONFIRMATION_REQUIRED') refresh()
        },
        // The form shows what went wrong, field by field: no toast as well.
        meta: { errorToast: false }
    })
}
