import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { tellOtherTabs } from '../lib/settings-sync'
import type { ChosenPresence, UserSettings } from '../types'
import { userKeys } from './keys'
import { updateSettings } from './settings.api'

/**
 * Choose a status in one's menu (S-ME-01, REQ-AUTH-07): the ✓ moves at once
 * and it saves in the background; others see it within 2 seconds, through
 * the API's presence. A failed save puts the old one back with "Status not
 * changed" and "Try again" (S-ME-01 › Không áp dụng). Once saved, the
 * other tabs follow.
 *
 * Its own hook, not useUpdateSettings: that one speaks the settings pages'
 * words (their namespace, loaded with them), this one the shell's.
 */
export function useChoosePresence() {
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    const mutation = useMutation({
        mutationFn: (presence: ChosenPresence) => updateSettings({ presence }),
        meta: { errorToast: false },
        onMutate: async (presence) => {
            await queryClient.cancelQueries({ queryKey: userKeys.settings() })
            const before = queryClient.getQueryData<UserSettings>(userKeys.settings())
            if (before) queryClient.setQueryData<UserSettings>(userKeys.settings(), { ...before, presence })
            return { before }
        },
        onSuccess: (saved) => {
            queryClient.setQueryData(userKeys.settings(), saved)
            tellOtherTabs(saved)
        },
        onError: (_error, presence, context) => {
            if (context?.before) queryClient.setQueryData(userKeys.settings(), context.before)
            void queryClient.invalidateQueries({ queryKey: userKeys.settings() })
            toast.error(t('shell.me.statusNotSaved'), {
                action: { label: t('buttons.tryAgain'), onClick: () => mutation.mutate(presence) }
            })
        }
    })
    return mutation
}
