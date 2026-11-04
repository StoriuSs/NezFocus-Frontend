import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { userKeys } from './keys'

/**
 * Upload and update user avatar.
 * Automatically invalidates profile query and shows toast notifications.
 */
export function useUpdateAvatar() {
    const queryClient = useQueryClient()
    const { t } = useTranslation('users')

    return useIdempotentMutation({
        mutationFn: async (blob: Blob, idempotencyKey) => {
            const formData = new FormData()
            formData.append('avatar', blob, 'avatar.jpg')
            // No Content-Type: the browser must set it, including the boundary.
            await api.post('/users/me/avatar', formData, {
                headers: { 'Idempotency-Key': idempotencyKey }
            })
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: userKeys.profile() })
            toast.success(t('toasts.avatarUpdated'))
        },
        // Failures toast from the MutationCache; uncatalogued ones read "Upload failed".
        meta: { errorFallbackKey: 'api:UPLOAD_FAILED' }
    })
}
