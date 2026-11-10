import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FolderPlus, PlusCircle, Settings, UserPlus } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useChannelDialogs } from '../channel-dialogs.store'
import { useInviteDialogs } from '../invite-dialogs.store'
import { serverSettingsPath } from '../lib/paths'
import { can } from '../lib/permissions'
import { settingsSections } from '../lib/settings-sections'
import type { Server } from '../types'

/**
 * Whether the server menu (S-SRV-04) has a row for them. Without one, the
 * server's name is a plain title and right-clicking its picture does nothing.
 */
export function hasServerMenu(server: Server): boolean {
    return (
        can(server.permissions, 'CREATE_INVITE') ||
        settingsSections(server).length > 0 ||
        can(server.permissions, 'MANAGE_CHANNELS')
    )
}

/**
 * The rows of the server menu (S-SRV-04, C-15), shown only to who may use
 * them, never disabled: "Invite people" (CREATE_INVITE, a link without a
 * target, Q6), "Server settings" when a settings page is theirs (04 Q2),
 * "Create channel" and "Create category" (MANAGE_CHANNELS). Leave (L9) joins
 * with its slice. Used by the menu over the
 * channel list and the one on the rail (C-05, right-click).
 */
export function ServerMenuItems({ server }: { server: Server }) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const show = useChannelDialogs((state) => state.show)
    const showInvite = useInviteDialogs((state) => state.showInvite)

    return (
        <>
            {can(server.permissions, 'CREATE_INVITE') ? (
                <DropdownMenuItem onSelect={() => showInvite(server.id)}>
                    <UserPlus aria-hidden='true' />
                    {t('shell.serverMenu.invite')}
                </DropdownMenuItem>
            ) : null}
            {settingsSections(server).length > 0 ? (
                <DropdownMenuItem onSelect={() => navigate(serverSettingsPath(server.id))}>
                    <Settings aria-hidden='true' />
                    {t('shell.serverMenu.settings')}
                </DropdownMenuItem>
            ) : null}
            {can(server.permissions, 'MANAGE_CHANNELS') ? (
                <>
                    <DropdownMenuItem
                        onSelect={() =>
                            show({ kind: 'createChannel', serverId: server.id, categoryId: null, type: 'text' })
                        }
                    >
                        <PlusCircle aria-hidden='true' />
                        {t('shell.serverMenu.createChannel')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => show({ kind: 'createCategory', serverId: server.id })}>
                        <FolderPlus aria-hidden='true' />
                        {t('shell.serverMenu.createCategory')}
                    </DropdownMenuItem>
                </>
            ) : null}
        </>
    )
}
