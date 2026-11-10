import { permissionBit, type PermissionName } from './permissions'
import type { Role, Server, ServerMember } from '../types'

/*
 * What the Roles page (S-SET-02) shows and allows, from what the backend
 * sends: the bits it worked out (D-145) and positions. The backend decides
 * again on its own (REQ-ROLE-02); these only grey out what would be refused.
 */

/** The most roles a server may have, @everyone not counted (REQ-ROLE-01, D-153). */
export const MAX_ROLES = 50
export const ROLE_NAME_MAX_LENGTH = 100

/** The 22 permissions in their groups, in the order of 04 › Nhóm quyền (Q6). */
export type PermissionGroup = 'general' | 'members' | 'messages' | 'rooms' | 'tasks'

export const PERMISSION_GROUPS: { id: PermissionGroup; permissions: PermissionName[] }[] = [
    {
        id: 'general',
        permissions: ['ADMINISTRATOR', 'MANAGE_SERVER', 'MANAGE_ROLES', 'MANAGE_CHANNELS', 'CREATE_INVITE']
    },
    { id: 'members', permissions: ['MODERATE_MEMBERS', 'KICK_MEMBERS', 'BAN_MEMBERS'] },
    {
        id: 'messages',
        permissions: [
            'VIEW_CHANNEL',
            'SEND_MESSAGES',
            'ATTACH_FILES',
            'ADD_REACTIONS',
            'MENTION_EVERYONE',
            'MANAGE_MESSAGES'
        ]
    },
    { id: 'rooms', permissions: ['CONNECT', 'SPEAK', 'VIDEO', 'MUTE_MEMBERS', 'MOVE_MEMBERS', 'MANAGE_STUDY_ROOMS'] },
    { id: 'tasks', permissions: ['CREATE_TASKS', 'MANAGE_TASKS'] }
]

/** The bits with one permission turned on or off, as the decimal string the API takes. */
export function withPermission(bits: string, name: PermissionName, on: boolean): string {
    const value = BigInt(bits)
    return (on ? value | permissionBit(name) : value & ~permissionBit(name)).toString()
}

/** Every bit of `role` is one they hold: needed to hand it out, take it back or delete it (D-148). */
export function holdsAllOf(held: string, role: Pick<Role, 'permissions'>): boolean {
    return (BigInt(role.permissions) & ~BigInt(held)) === 0n
}

/** Every role but @everyone, highest first. */
export const rolesHighestFirst = (roles: Role[]) =>
    roles.filter((role) => !role.isEveryone).sort((a, b) => b.position - a.position || a.id.localeCompare(b.id))

/**
 * Why they may not change this role (04 › hierarchy-blocked): it is their
 * own highest (`mine`) or above it (`above`); null when they may. The owner
 * may change any.
 */
export function roleLock(server: Pick<Server, 'isOwner' | 'topRolePosition'>, role: Role): 'mine' | 'above' | null {
    if (server.isOwner || role.position < server.topRolePosition) return null
    return role.position === server.topRolePosition && !role.isEveryone ? 'mine' : 'above'
}

/** A member's rank: the owner above all, else their highest role (0: none). */
export function memberRank(member: Pick<ServerMember, 'isOwner' | 'roleIds'>, roles: Role[]): number {
    if (member.isOwner) return Number.POSITIVE_INFINITY
    const held = new Set(member.roleIds)
    return roles.reduce((top, role) => (held.has(role.id) ? Math.max(top, role.position) : top), 0)
}

/** Themselves, or someone ranked below them (REQ-ROLE-02, D-153). */
export function mayChangeMember(
    server: Pick<Server, 'isOwner' | 'topRolePosition'>,
    myId: string,
    member: Pick<ServerMember, 'userId' | 'isOwner' | 'roleIds'>,
    roles: Role[]
): boolean {
    if (member.userId === myId) return true
    const mine = server.isOwner ? Number.POSITIVE_INFINITY : server.topRolePosition
    return mine > memberRank(member, roles)
}

/**
 * How many roles at the top a drag may not touch: their own highest and
 * those above it (the owner: none). Nothing may be dropped among them.
 */
export function fixedAtTop(server: Pick<Server, 'isOwner' | 'topRolePosition'>, ordered: Role[]): number {
    if (server.isOwner) return 0
    return ordered.filter((role) => role.position >= server.topRolePosition).length
}

/** `ids` with `id` moved to `index` (counted in the list without it). */
export function moved(ids: string[], id: string, index: number): string[] {
    const rest = ids.filter((other) => other !== id)
    return [...rest.slice(0, index), id, ...rest.slice(index)]
}

/** The roles with the new order's positions (n…1), for the list to show before the answer. */
export function reordered(roles: Role[], order: string[]): Role[] {
    const position = new Map(order.map((id, index) => [id, order.length - index]))
    return roles.map((role) => (role.isEveryone ? role : { ...role, position: position.get(role.id) ?? role.position }))
}

const RESERVED = new Set(['everyone', 'here'])

/** Why a typed role name is refused before asking (Q5), or null; "taken" is the backend's to say. */
export function roleNameProblem(typed: string): 'length' | 'reserved' | null {
    const name = typed.normalize('NFC').trim()
    const length = [...name].length
    if (length < 1 || length > ROLE_NAME_MAX_LENGTH) return 'length'
    if (RESERVED.has(name.toLowerCase().replace(/^@/, '').trim())) return 'reserved'
    return null
}

/** The role already named so (ignoring case, not accents, as D-84), if any. */
export function roleNamed(roles: Role[], typed: string, exceptId?: string): Role | undefined {
    const key = typed.normalize('NFC').trim().toLowerCase()
    return roles.find((role) => role.id !== exceptId && role.name.normalize('NFC').toLowerCase() === key)
}
