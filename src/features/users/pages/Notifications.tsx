import { useTranslation } from 'react-i18next'
import { Play } from 'lucide-react'
import '@/i18n/settings'
import { ShellPage } from '@/components/shell/ShellPage'
import { SettingsGroup } from '@/components/settings/SettingsRow'
import { SwitchRow } from '@/components/settings/SwitchRow'
import { Button } from '@/components/ui/button'
import { playPhaseSound } from '@/lib/phase-sound'
import { useUpdateSettings } from '@/features/users/api/useUpdateSettings'
import { SettingsLoader } from '@/features/users/components/SettingsLoader'
import type { UserSettings } from '@/features/users/types'

/**
 * Notifications (S-ME-06): the phase change sound and "Play sample". The
 * browser notifications group comes with M7 (D-131, NOTIF-04); the switch
 * only saves until study sessions arrive in M5.
 */
export default function Notifications() {
    const { t } = useTranslation()
    return (
        <ShellPage title={t('shell.settings.notifications')}>
            <SettingsLoader>{(settings) => <NotificationsContent settings={settings} />}</SettingsLoader>
        </ShellPage>
    )
}

function NotificationsContent({ settings }: { settings: UserSettings }) {
    const { t } = useTranslation('settings')
    const update = useUpdateSettings()

    return (
        <div className='max-w-[720px] space-y-8 p-6 lg:p-8'>
            <SettingsGroup id='study-sessions' title={t('notifications.studySessions')}>
                <SwitchRow
                    label={t('notifications.phaseSound')}
                    description={t('notifications.phaseSoundHint')}
                    checked={settings.phaseSound}
                    onCheckedChange={(phaseSound) => update.mutate({ phaseSound })}
                />
                {/* Plays even with the switch off: it is how you hear what you would turn on. */}
                <Button variant='text' size='sm' className='-ml-3' onClick={playPhaseSound}>
                    <Play aria-hidden='true' />
                    {t('notifications.playSample')}
                </Button>
            </SettingsGroup>
        </div>
    )
}
