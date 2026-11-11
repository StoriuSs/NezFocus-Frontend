import { useEffect } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/servers'
import { PageLoader } from '@/components/PageLoader'
import { ShellPage } from '@/components/shell/ShellPage'
import { useServers } from '../api/useServers'
import { channelPath, serverSettingsPath } from '../lib/paths'
import { isSettingsSection, settingsSections } from '../lib/settings-sections'
import { InvitesSettings } from '../components/settings/InvitesSettings'
import { BansSettings } from '../components/settings/members/BansSettings'
import { MembersSettings } from '../components/settings/members/MembersSettings'
import { RoleEditor } from '../components/settings/roles/RoleEditor'
import { RolesSettings } from '../components/settings/roles/RolesSettings'
import { ServerIconSetting } from '../components/settings/ServerIconSetting'
import { ServerNameForm } from '../components/settings/ServerNameForm'
import { WelcomeChannelSetting } from '../components/settings/WelcomeChannelSetting'
import { OwnerSettings } from '../components/settings/OwnerSettings'
import type { Server } from '../types'

/** Says why the page moved, once (an id: StrictMode runs effects twice). */
function Lost({ to, message }: { to: string; message: string }) {
    useEffect(() => {
        toast(message, { id: 'server-settings-lost' })
    }, [message])
    return <Navigate to={to} replace />
}

/**
 * The server settings (04 › Khung, S-SET-01 → S-SET-04): `/servers/{id}/settings/{section}`,
 * and one role at `/settings/roles/{roleId}` (S-SET-02 `edit-role`),
 * beside SettingsNav. Without a section, the first page they may open (Q2).
 * A page they may not open (any more) goes to the first one they may, with
 * "You no longer have access to this page"; with none left, back to the
 * server with "…to server settings". A server they are not in: the Study page.
 */
export default function ServerSettingsPage() {
    const { t } = useTranslation()
    const { serverId, section, roleId } = useParams()
    const servers = useServers()

    if (servers.isPending) return <PageLoader className='min-h-0 flex-1' />
    // The page's error boundary offers to try again.
    if (servers.isError) throw servers.error

    const server = servers.data.find((candidate) => candidate.id === serverId)
    if (!server) return <Navigate to='/study' replace />

    const sections = settingsSections(server)
    const first = sections[0]
    if (!first) return <Lost to={channelPath(server.id)} message={t('servers:settings.lost.settings')} />
    if (!section) return <Navigate to={serverSettingsPath(server.id, first)} replace />
    if (!isSettingsSection(section) || !sections.includes(section)) {
        return <Lost to={serverSettingsPath(server.id, first)} message={t('servers:settings.lost.section')} />
    }

    return (
        <ShellPage title={t(`shell.serverSettings.${section}`)} bodyClassName='flex flex-col'>
            {section === 'overview' ? <Overview server={server} /> : null}
            {section === 'roles' && !roleId ? <RolesSettings server={server} /> : null}
            {section === 'roles' && roleId ? <RoleEditor key={roleId} server={server} roleId={roleId} /> : null}
            {section === 'members' ? <MembersSettings server={server} /> : null}
            {section === 'invites' ? <InvitesSettings server={server} /> : null}
            {section === 'bans' ? <BansSettings server={server} /> : null}
        </ShellPage>
    )
}

/** S-SET-01: picture, name (save bar), welcome channel; for the owner, handing over and deleting (Q15). */
function Overview({ server }: { server: Server }) {
    return (
        <div className='flex w-full max-w-settings flex-1 flex-col gap-8 p-6 pb-6 lg:p-8 lg:pb-6'>
            <ServerIconSetting server={server} />
            <ServerNameForm server={server}>
                <WelcomeChannelSetting server={server} />
            </ServerNameForm>
            {server.isOwner ? <OwnerSettings server={server} /> : null}
        </div>
    )
}
