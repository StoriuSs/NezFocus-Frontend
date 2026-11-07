import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { cancelAvatarRemoval } from '../lib/avatar-removal'
import { userKeys } from './keys'

/**
 * Upload a cropped avatar (S-ME-02). A removal still waiting out its "Undo"
 * is called off: the new picture replaces the old one anyway.
 */
export function useUpdateAvatar() {
    const queryClient = useQueryClient()
    const { t } = useTranslation('users')

    return useIdempotentMutation({
        onMutate: cancelAvatarRemoval,
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
