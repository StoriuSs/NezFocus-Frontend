import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import '@/i18n/settings'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/features/users/api/useSettings'
import type { UserSettings } from '@/features/users/types'

/**
 * The account's settings for a settings page. The AppShell loaded them as
 * the app opened, so a page has them at once (S-ME-04 → S-ME-06 have no
 * loading state); this only covers settings that could not be read then.
 */
export function SettingsLoader({ children }: { children: (settings: UserSettings) => ReactNode }) {
    const { t } = useTranslation()
    const { data, error, refetch } = useSettings()

    if (data) return <>{children(data)}</>
    if (!error) return null
    return (
        <div className='flex flex-col items-start gap-4 p-6 lg:p-8'>
            <p className='text-body-sm text-text-secondary'>{t('settings:failedToLoad')}</p>
            <Button variant='outline' size='sm' onClick={() => void refetch()}>
                {t('buttons.tryAgain')}
            </Button>
        </div>
    )
}
