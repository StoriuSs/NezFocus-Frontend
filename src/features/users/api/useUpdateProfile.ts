import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import type { UpdateProfileRequest } from '@/features/users/types'
import { userKeys } from './keys'

/**
 * Update user profile (displayName, bio).
 * Automatically invalidates profile query and shows toast notifications.
 */
export function useUpdateProfile() {
    const queryClient = useQueryClient()
    const { t } = useTranslation('users')

    return useIdempotentMutation({
        mutationFn: async (values: UpdateProfileRequest, idempotencyKey) => {
            await api.patch('/users/me', values, {
                headers: { 'Idempotency-Key': idempotencyKey }
            })
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: userKeys.profile() })
            toast.success(t('toasts.profileUpdated'))
        }
        // Failures: one toast from the query client's MutationCache.
    })
}
