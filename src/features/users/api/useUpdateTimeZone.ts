import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import { toast } from 'sonner'
import '@/i18n/settings'
import { tellOtherTabs } from '../lib/settings-sync'
import { userKeys } from './keys'
import { updateSettings } from './settings.api'

/** The API refused because the zone changed under 24 hours ago, in this tab or another (REQ-AUTH-08). */
function isZoneLocked(error: unknown): boolean {
    if (!axios.isAxiosError(error) || error.response?.status !== 429) return false
    return (error.response.data as { data?: { reason?: unknown } } | undefined)?.data?.reason === 'timezone'
}

/**
 * Change the account's time zone (S-ME-04 `timezone-confirm`). Not
 * optimistic, unlike the other settings: the API may refuse it for 24 hours,
 * so the page shows the new zone only once it is saved. Refused because it
 * changed from another tab meanwhile: the settings are read again, and the
 * page shows the lock instead of a toast (10-settings › Edge case). Any
 * other failure: a toast with "Try again", which sends the same zone.
 */
export function useUpdateTimeZone() {
    const queryClient = useQueryClient()
    const { t } = useTranslation('settings')

    const mutation = useMutation({
        mutationFn: (timezone: string) => updateSettings({ timezone }),
        // Says it itself: the lock on the page, or its own toast with "Try again".
        meta: { errorToast: false },
        onSuccess: (saved) => {
            queryClient.setQueryData(userKeys.settings(), saved)
            tellOtherTabs(saved)
        },
        onError: (error, timezone) => {
            if (isZoneLocked(error)) {
                void queryClient.invalidateQueries({ queryKey: userKeys.settings() })
                return
            }
            toast.error(t('toasts.notSaved'), {
                action: { label: t('toasts.retry'), onClick: () => mutation.mutate(timezone) }
            })
        }
    })
    return mutation
}
