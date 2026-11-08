import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/settings'
import { tellOtherTabs } from '../lib/settings-sync'
import type { SettingsChanges, UserSettings } from '../types'
import { userKeys } from './keys'
import { updateSettings } from './settings.api'

/**
 * Save one choice or switch of a settings page (10-settings › Quy ước › Lưu
 * thay đổi): it shows at once and saves in the background. If the save
 * fails, the old value comes back with a toast offering "Try again" (Q15).
 * Once saved, the other tabs follow.
 */
export function useUpdateSettings() {
    const queryClient = useQueryClient()
    const { t } = useTranslation('settings')

    const mutation = useMutation({
        mutationFn: updateSettings,
        // Its own toast below, with "Try again": not the app's generic one too.
        meta: { errorToast: false },
        onMutate: async (changes: SettingsChanges) => {
            await queryClient.cancelQueries({ queryKey: userKeys.settings() })
            const before = queryClient.getQueryData<UserSettings>(userKeys.settings())
            if (before) queryClient.setQueryData<UserSettings>(userKeys.settings(), { ...before, ...changes })
            return { before }
        },
        onSuccess: (saved) => {
            queryClient.setQueryData(userKeys.settings(), saved)
            tellOtherTabs(saved)
        },
        onError: (_error, changes, context) => {
            if (context?.before) queryClient.setQueryData(userKeys.settings(), context.before)
            // Another save may have landed meanwhile: settle on what the server holds.
            void queryClient.invalidateQueries({ queryKey: userKeys.settings() })
            toast.error(t('toasts.notSaved'), {
                action: { label: t('toasts.retry'), onClick: () => mutation.mutate(changes) }
            })
        }
    })
    return mutation
}
