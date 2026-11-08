import { useTranslation } from 'react-i18next'
import '@/i18n/settings'
import { ShellPage } from '@/components/shell/ShellPage'
import { SettingsGroup } from '@/components/settings/SettingsRow'
import { SwitchRow } from '@/components/settings/SwitchRow'
import { useUpdateSettings } from '@/features/users/api/useUpdateSettings'
import { SettingsLoader } from '@/features/users/components/SettingsLoader'
import type { UserSettings } from '@/features/users/types'

/**
 * Privacy (S-ME-05): who may message you, and who sees you studying (D-79).
 * Each description says what the switch's current position means. The
 * switches only save until direct messages and study activity arrive; the
 * block list row comes with M6 (D-131).
 */
export default function Privacy() {
    const { t } = useTranslation()
    return (
        <ShellPage title={t('shell.settings.privacy')}>
            <SettingsLoader>{(settings) => <PrivacyContent settings={settings} />}</SettingsLoader>
        </ShellPage>
    )
}

function PrivacyContent({ settings }: { settings: UserSettings }) {
    const { t } = useTranslation('settings')
    const update = useUpdateSettings()

    return (
        <div className='max-w-[720px] space-y-8 p-6 lg:p-8'>
            <SettingsGroup id='direct-messages' title={t('privacy.directMessages')}>
                <SwitchRow
                    label={t('privacy.allowServerMembers')}
                    description={t(
                        settings.allowServerMemberMessages
                            ? 'privacy.allowServerMembersOn'
                            : 'privacy.allowServerMembersOff'
                    )}
                    checked={settings.allowServerMemberMessages}
                    onCheckedChange={(allowServerMemberMessages) => update.mutate({ allowServerMemberMessages })}
                />
            </SettingsGroup>

            <SettingsGroup id='activity' title={t('privacy.activity')}>
                <SwitchRow
                    label={t('privacy.showStudyActivity')}
                    description={t(
                        settings.showStudyActivity ? 'privacy.showStudyActivityOn' : 'privacy.showStudyActivityOff'
                    )}
                    checked={settings.showStudyActivity}
                    onCheckedChange={(showStudyActivity) => update.mutate({ showStudyActivity })}
                />
            </SettingsGroup>
        </div>
    )
}
