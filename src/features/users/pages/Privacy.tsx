import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import '@/i18n/settings'
import { ShellPage } from '@/components/shell/ShellPage'
import { SettingsGroup } from '@/components/settings/SettingsRow'
import { SwitchRow } from '@/components/settings/SwitchRow'
import { useBlockedCount } from '@/features/users/api/useBlockedCount'
import { useUpdateSettings } from '@/features/users/api/useUpdateSettings'
import { SettingsLoader } from '@/features/users/components/SettingsLoader'
import { connectedBlockList, type BlockList } from '@/features/users/lib/block-list'
import type { UserSettings } from '@/features/users/types'

/**
 * Privacy (S-ME-05): who may message you, who sees you studying (D-79),
 * and the way to the people you blocked (D-131). Each description says what
 * the switch's current position means.
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
    const blockList = connectedBlockList()

    return (
        <div className='max-w-settings space-y-8 p-6 lg:p-8'>
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

            <SettingsGroup id='blocking' title={t('privacy.blocking')}>
                <BlockListRow blockList={blockList} />
            </SettingsGroup>
        </div>
    )
}

/**
 * "Block list · N people ›" (S-ME-05): a row that opens the Blocked tab of
 * the Friends page; the count once the list is read.
 */
function BlockListRow({ blockList }: { blockList: BlockList }) {
    const { t } = useTranslation('settings')
    const count = useBlockedCount(blockList)
    return (
        <Link
            to={blockList.path}
            className='-mx-2 flex min-h-12 items-center gap-2 rounded-input px-2 py-2 transition-colors duration-micro hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        >
            <span className='flex-1 text-body-sm text-text-primary'>{t('privacy.blockList')}</span>
            {count === undefined ? null : (
                <span className='text-body-sm text-text-secondary'>{t('privacy.blockedCount', { count })}</span>
            )}
            <ChevronRight aria-hidden='true' className='size-4 text-text-tertiary' />
        </Link>
    )
}
