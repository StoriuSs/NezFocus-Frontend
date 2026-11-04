import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiErrorType } from '@/lib/api-error'
import { authApi } from './auth.api'
import { authKeys } from './keys'

/** Set a first password, with the emailed code. */
export function useSetPassword() {
    const queryClient = useQueryClient()
    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: authKeys.signInMethods() })
    }

    return useMutation({
        mutationFn: ({ code, newPassword }: { code: string; newPassword: string }) =>
            authApi.setPassword(code, newPassword),
        onSuccess: refresh,
        onError: (error) => {
            // Set in another tab meanwhile: show the page as it is now.
            if (getApiErrorType(error) === 'AUTH_PASSWORD_ALREADY_SET') refresh()
        },
        // The form shows what went wrong, field by field: no toast as well.
        meta: { errorToast: false }
    })
}
