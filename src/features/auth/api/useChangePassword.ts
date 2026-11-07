import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from './auth.api'
import { authKeys } from './keys'

/** Change the password, knowing the current one. Ends every other session. */
export function useChangePassword() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
            authApi.changePassword(currentPassword, newPassword),
        // The other devices are signed out: the list keeps this one only.
        onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.sessions() }),
        // The form shows what went wrong, field by field: no toast as well.
        meta: { errorToast: false }
    })
}
