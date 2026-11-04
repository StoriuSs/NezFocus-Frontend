import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { getApiErrorType } from '@/lib/api-error'
import type { ApiEnvelope } from '@/lib/api-types'
import type { SetUsernameRequest, SetUsernameResponse } from '@/features/users/types'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { userKeys } from './keys'

/**
 * Set username (one-time action for new users).
 * Automatically invalidates profile query and shows toast notifications.
 */
export function useSetUsername() {
    const queryClient = useQueryClient()
    const { t } = useTranslation('users')

    return useIdempotentMutation({
        mutationFn: async (username: string, idempotencyKey) => {
            const response = await api.post<ApiEnvelope<SetUsernameResponse>>(
                '/users/me/username',
                { username } satisfies SetUsernameRequest,
                { headers: { 'Idempotency-Key': idempotencyKey } }
            )
            return response.data.data
        },
        onSuccess: () => {
            toast.success(t('toasts.usernameSet'))
            void queryClient.invalidateQueries({ queryKey: userKeys.profile() })
        },
        onError: (error, username) => {
            const type = getApiErrorType(error)
            // Someone took the name after it was checked: drop the stale
            // "available" answer so the field shows it as taken.
            if (type === 'USERNAME_CONFLICT') {
                queryClient.setQueryData(userKeys.usernameAvailability(username), false)
            }
            // Already set — in another tab, say. The prompt closes once the
            // profile says so; it used to stay open until a reload.
            if (type === 'USERNAME_ALREADY_SET') {
                void queryClient.invalidateQueries({ queryKey: userKeys.profile() })
            }
            // The toast itself comes from the MutationCache.
        }
    })
}
