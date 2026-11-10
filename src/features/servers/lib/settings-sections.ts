import { can, type PermissionName } from './permissions'
import { channelGroups } from './channel-list'
import type { Server } from '../types'

/** The pages of the server settings (04 › Khung), in SettingsNav order. */
export type SettingsSection = 'overview' | 'roles' | 'members' | 'invites' | 'bans'

/**
 * Who sees which page (04 S-SET-01 › Mục nào cho ai, Q2): any one of the
 * bits. The owner and Toàn quyền hold every bit already (D-145).
 * `built` is false for a page of a later slice (L7–L8): until then it is
 * neither in the nav nor a reason to show "Server settings".
 */
const SECTIONS: { id: SettingsSection; anyOf: PermissionName[]; built: boolean }[] = [
    { id: 'overview', anyOf: ['MANAGE_SERVER'], built: true },
    { id: 'roles', anyOf: ['MANAGE_ROLES'], built: true },
    { id: 'members', anyOf: ['KICK_MEMBERS', 'BAN_MEMBERS', 'MODERATE_MEMBERS', 'MANAGE_ROLES'], built: false },
    { id: 'invites', anyOf: ['MANAGE_SERVER'], built: true },
    { id: 'bans', anyOf: ['BAN_MEMBERS'], built: false }
]

/** The pages they may open, in order; none: no "Server settings" in the server menu. */
export function settingsSections(server: Pick<Server, 'permissions'>): SettingsSection[] {
    return SECTIONS.filter((section) => section.built && section.anyOf.some((bit) => can(server.permissions, bit))).map(
        (section) => section.id
    )
}

export function isSettingsSection(value: string | undefined): value is SettingsSection {
    return SECTIONS.some((section) => section.id === value)
}

/** `/servers/{id}/settings[/{section}]` (04 › URL); without a section, the first one they see. */
export const serverSettingsPath = (serverId: string, section?: SettingsSection) =>
    `/servers/${serverId}/settings${section ? `/${section}` : ''}`

/** A choice of "Welcome channel" (S-SET-01, Q14). */
export type WelcomeChoice =
    | { kind: 'none' }
    | { kind: 'channel'; id: string; name: string; categoryName: string | null; isPrivate: boolean }
    /** A private channel they do not see is chosen (they only know its id). */
    | { kind: 'hidden'; id: string }

/**
 * "Send none" first, then the text channels in list order (04 Q14), and, when
 * the chosen one is a channel they cannot see, that one last so the field
 * never claims "Send none".
 */
export function welcomeChoices(server: Pick<Server, 'categories' | 'channels' | 'welcomeChannelId'>): WelcomeChoice[] {
    const channels: WelcomeChoice[] = channelGroups(server).flatMap((group) =>
        group.channels
            .filter((channel) => channel.type === 'text')
            .map((channel) => ({
                kind: 'channel' as const,
                id: channel.id,
                name: channel.name,
                categoryName: group.category?.name ?? null,
                isPrivate: channel.isPrivate
            }))
    )
    const chosen = server.welcomeChannelId
    const hidden = chosen && !channels.some((choice) => choice.kind === 'channel' && choice.id === chosen)
    return [{ kind: 'none' }, ...channels, ...(hidden ? [{ kind: 'hidden' as const, id: chosen }] : [])]
}
