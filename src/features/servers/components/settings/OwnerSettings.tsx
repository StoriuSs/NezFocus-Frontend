import '@/i18n/servers'
import { useTranslation } from 'react-i18next'
import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsRow'
import { Button } from '@/components/ui/button'
import { useMembershipDialogs } from '../../membership-dialogs.store'
import type { Server } from '../../types'

/**
 * "Owner" at the end of the Overview (04 S-SET-01, Q15), for the owner only:
 * hand the server over, or delete it (S-SET-07). Each opens its dialog.
 */
export function OwnerSettings({ server }: { server: Server }) {
    const { t } = useTranslation('servers')
    const show = useMembershipDialogs((state) => state.show)

    return (
        <SettingsGroup id='server-owner' title={t('settings.overview.owner.title')}>
            <SettingsRow
                label={t('settings.overview.owner.transfer')}
                description={t('settings.overview.owner.transferHint')}
                control={
                    <Button variant='outline' size='sm' onClick={() => show({ kind: 'transfer', serverId: server.id })}>
                        {t('membership.transfer.submit')}
                    </Button>
                }
            />
            <SettingsRow
                label={t('settings.overview.owner.delete')}
                description={t('settings.overview.owner.deleteHint')}
                control={
                    <Button
                        variant='destructive'
                        size='sm'
                        onClick={() => show({ kind: 'delete', serverId: server.id })}
                    >
                        {t('membership.delete.submit')}
                    </Button>
                }
            />
        </SettingsGroup>
    )
}
