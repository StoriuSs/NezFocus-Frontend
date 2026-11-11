import type { SettingsSection } from './settings-sections'

/**
 * The servers feature's pages' paths, in one place (04 › URL, S-SRV-03):
 * the patterns `routes.tsx` declares. A link or a redirect builds its path
 * with the functions below, which follow these patterns.
 */
export const SERVERS_PATHS = {
    /** A server's channel; without one, the page opens the first text channel. */
    channel: '/channels/:serverId/:channelId?',
    /** The server settings; without a section, the first one they see. */
    settings: '/servers/:serverId/settings/:section?',
    /**
     * A page of the server settings with an id after it: under `roles`, that
     * role's editor (S-SET-02 `edit-role`); any other section ignores the id.
     */
    roleEdit: '/servers/:serverId/settings/:section/:roleId',
    /** An invite link (S-SRV-03): a visitor's page in the AuthShell. */
    invite: '/invite/:code'
} as const

/** `/channels/{server}[/{channel}]`. */
export const channelPath = (serverId: string, channelId?: string) =>
    `/channels/${serverId}${channelId ? `/${channelId}` : ''}`

/** `/servers/{id}/settings[/{section}]`. */
export const serverSettingsPath = (serverId: string, section?: SettingsSection) =>
    `/servers/${serverId}/settings${section ? `/${section}` : ''}`

/** `/servers/{id}/settings/roles/{role}`. */
export const roleEditPath = (serverId: string, roleId: string) => `${serverSettingsPath(serverId, 'roles')}/${roleId}`

/** `/invite/{code}`. */
export const invitePath = (code: string) => `/invite/${code}`

/** Whether a page is one of this server's: a channel of it or its settings. */
export const isServerPath = (pathname: string, serverId: string) =>
    pathname === channelPath(serverId) ||
    pathname.startsWith(`${channelPath(serverId)}/`) ||
    pathname === serverSettingsPath(serverId) ||
    pathname.startsWith(`${serverSettingsPath(serverId)}/`)
