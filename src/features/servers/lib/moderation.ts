import { can } from './permissions'
import { holdsAllOf, roleLock } from './roles'
import type { Role, Server, ServerMember } from '../types'

/*
 * What the Members page (S-SET-03) offers on each row. The backend decides
 * (REQ-ROLE-04, D-145); this only hides what it would refuse.
 */

/** The six lengths of a timeout, 1 hour chosen first (04 Q8). */
export const TIMEOUT_SECONDS = [60, 300, 600, 3600, 86_400, 604_800] as const
export type TimeoutSeconds = (typeof TIMEOUT_SECONDS)[number]
export const DEFAULT_TIMEOUT: TimeoutSeconds = 3600
/** The longest reason for a kick, ban or timeout. */
export const REASON_MAX_LENGTH = 512

type RankedRole = Pick<Server['roles'][number], 'id' | 'position' | 'administrator'>

/** A member's rank: the owner above all, else their highest role (0: none). */
export function rankOf(member: Pick<ServerMember, 'isOwner' | 'roleIds'>, roles: RankedRole[]): number {
    if (member.isOwner) return Number.POSITIVE_INFINITY
    const held = new Set(member.roleIds)
    return roles.reduce((top, role) => (held.has(role.id) ? Math.max(top, role.position) : top), 0)
}

/** Whether a timeout still runs at `now`. */
export const isTimedOut = (member: Pick<ServerMember, 'timeoutUntil'>, now: Date) =>
    member.timeoutUntil !== null && member.timeoutUntil !== undefined && new Date(member.timeoutUntil) > now

export interface RowActions {
    /** "Tạm khóa"; while one runs, "Đổi thời hạn tạm khóa". */
    timeout: boolean
    /** "Gỡ tạm khóa", while one runs. */
    endTimeout: boolean
    kick: boolean
    ban: boolean
    /**
     * "Transfer ownership", the owner's, set apart at the end (Q15): not to
     * someone timed out (D-91). An account waiting to be deleted is not known
     * here (D-161): the API refuses it, and the password step says so.
     */
    transfer: boolean
}

/**
 * The ⋯ menu of a row (04 › Menu ⋯): each item needs its own permission, and
 * only on someone ranked below them, never on themselves or the owner. No
 * timeout for someone holding ADMINISTRATOR, who keeps every permission (D-147).
 */
export function rowActions(
    server: Pick<Server, 'isOwner' | 'topRolePosition' | 'permissions' | 'roles'>,
    member: ServerMember,
    now: Date
): RowActions {
    const below = isBelow(server, member)
    const admin = holdsAdministrator(server, member)
    const moderates = below && can(server.permissions, 'MODERATE_MEMBERS')
    const timedOut = isTimedOut(member, now)
    return {
        timeout: moderates && !admin,
        endTimeout: moderates && timedOut,
        kick: below && can(server.permissions, 'KICK_MEMBERS'),
        ban: below && can(server.permissions, 'BAN_MEMBERS'),
        transfer: server.isOwner && !member.isOwner && !timedOut
    }
}

/**
 * Why a kick, ban or timeout already open can no longer be done, as the
 * person now is (04 SET-EDGE `target-outranked`): they came to rank level
 * with or above them, or, for a timeout, to hold Administrator (D-147).
 * Null: nothing stops it here; the backend still decides.
 */
export function blockedOn(
    server: Pick<Server, 'isOwner' | 'topRolePosition' | 'roles'>,
    member: Pick<ServerMember, 'isOwner' | 'roleIds'>,
    kind: 'timeout' | 'kick' | 'ban'
): Blocked {
    if (!isBelow(server, member)) return 'outranked'
    if (kind === 'timeout' && holdsAdministrator(server, member)) return 'admin'
    return null
}

/** What already stops a moderation dialog (blockedOn); null: nothing. */
export type Blocked = 'outranked' | 'admin' | null

/**
 * Whether the member ranks below them: their own rank is never above itself
 * and the owner's is infinite, so no one acts on themselves or the owner.
 */
function isBelow(
    server: Pick<Server, 'isOwner' | 'topRolePosition' | 'roles'>,
    member: Pick<ServerMember, 'isOwner' | 'roleIds'>
): boolean {
    const mine = server.isOwner ? Number.POSITIVE_INFINITY : server.topRolePosition
    return mine > rankOf(member, server.roles)
}

/** Whether the member holds a role with Administrator (D-147: never timed out). */
function holdsAdministrator(server: Pick<Server, 'roles'>, member: Pick<ServerMember, 'roleIds'>): boolean {
    const held = new Set(member.roleIds)
    return server.roles.some((role) => role.administrator && held.has(role.id))
}

/** Whether the row has a ⋯ at all (04: only with at least one action). */
export const hasActions = (actions: RowActions) =>
    actions.timeout || actions.endTimeout || actions.kick || actions.ban || actions.transfer

/**
 * The roles "+" lists for a member (04 › "+"): below their own highest and
 * whose every bit they hold (D-148), on themselves or someone ranked below.
 * Empty: no "+".
 */
export function assignableRoles(
    server: Pick<Server, 'isOwner' | 'topRolePosition' | 'permissions' | 'roles'>,
    myId: string,
    member: ServerMember,
    roles: Role[]
): Role[] {
    if (!can(server.permissions, 'MANAGE_ROLES')) return []
    const mine = server.isOwner ? Number.POSITIVE_INFINITY : server.topRolePosition
    if (member.userId !== myId && mine <= rankOf(member, server.roles)) return []
    return roles.filter(
        (role) => !role.isEveryone && roleLock(server, role) === null && holdsAllOf(server.permissions, role)
    )
}

/** The member's roles as Tags, highest first (04 › Tag). */
export function heldRoles<T extends { id: string; position: number }>(
    member: Pick<ServerMember, 'roleIds'>,
    roles: T[]
) {
    const held = new Set(member.roleIds)
    return roles.filter((role) => held.has(role.id)).sort((a, b) => b.position - a.position)
}

/**
 * The page buttons of C-40: every page up to 7, else the first, the last, the
 * current one with its neighbours, and `gap` where pages are left out
 * ("1 2 3 4 5 … 14").
 */
export function pageButtons(current: number, total: number): (number | 'gap')[] {
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
    const start = Math.max(2, Math.min(current - 1, total - 4))
    const end = Math.min(total - 1, Math.max(current + 1, 5))
    const middle = Array.from({ length: end - start + 1 }, (_, index) => start + index)
    return [1, ...(start > 2 ? ['gap' as const] : []), ...middle, ...(end < total - 1 ? ['gap' as const] : []), total]
}

/** A day as the tables show it: "01/10/2026". */
export const tableDate = (at: Date, language: string, timeZone?: string) =>
    new Intl.DateTimeFormat(language, { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(at)
