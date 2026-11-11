import axios from 'axios'
import { getApiErrorType } from '@/lib/api-error'
import type { OwnedServers } from '@/features/auth'
import { refusedRule } from './layout-error'
import { channelPath, serverSettingsPath } from './paths'
import { settingsSections } from './settings-sections'
import type { Server, ServerMember } from '../types'

/**
 * The server to open once one is left or deleted (03 S-SRV-04 Q7): the next
 * on the rail, below it, else the one above; null when it was the last.
 */
export function serverAfter(servers: Pick<Server, 'id'>[], goneId: string): string | null {
    const at = servers.findIndex((server) => server.id === goneId)
    if (at === -1) return servers[0]?.id ?? null
    return servers[at + 1]?.id ?? servers[at - 1]?.id ?? null
}

/** Their highest role's name, for the picker's right column (S-SET-07); null with only @everyone. */
export function highestRoleName(server: Pick<Server, 'roles'>, member: Pick<ServerMember, 'roleIds'>): string | null {
    // `server.roles` is highest first.
    return server.roles.find((role) => member.roleIds.includes(role.id))?.name ?? null
}

/**
 * Why a handover was refused for the one chosen, when it is about them
 * (backend domain/membership.ts): their account is waiting to be deleted,
 * they are timed out (D-91), or they left meanwhile. Null for anything else.
 */
export type TransferRefusal = 'pending_deletion' | 'timed_out' | 'gone'

export function transferRefusal(error: unknown): TransferRefusal | null {
    if (getApiErrorType(error) === 'NOT_FOUND_ERROR') return 'gone'
    const rule = refusedRule(error)
    if (rule === 'recipient_pending_deletion') return 'pending_deletion'
    if (rule === 'recipient_timed_out') return 'timed_out'
    return null
}

/**
 * The server a refused request was about, when it was refused as not found
 * (D-143): a request under `/servers/{id}`. NOT_FOUND_ERROR says the same for
 * a gone server and a gone channel, role or member (NFR-SEC-05), so this only
 * says the list is worth reading again; the list decides.
 */
export function notFoundServerId(error: unknown): string | null {
    if (getApiErrorType(error) !== 'NOT_FOUND_ERROR' || !axios.isAxiosError(error)) return null
    return /^\/servers\/([^/?]+)/.exec(error.config?.url ?? '')?.[1] ?? null
}

/**
 * Where a settings page of this server goes once it is handed over (04
 * S-SET-07 `transferred`): the same page while they may still open it, else
 * the first they may (An keeps Trưởng nhóm: Members), else the server itself.
 * Null: stay (not a settings page of it, or one that finds its own way).
 */
export function pageAfterHandover(pathname: string, server: Pick<Server, 'id' | 'permissions'>): string | null {
    const prefix = serverSettingsPath(server.id)
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null
    const section = pathname.slice(prefix.length + 1).split('/')[0]
    if (!section) return null
    const sections = settingsSections(server)
    if (sections.some((open) => open === section)) return null
    return sections[0] ? serverSettingsPath(server.id, sections[0]) : channelPath(server.id)
}

/**
 * The servers one owns, as deleting the account sorts them (10 S-ME-03,
 * REQ-AUTH-09): with others in, to hand over first; only them, deleted with
 * the account (D-121). In the rail's order.
 */
export function ownedServers(servers: Pick<Server, 'id' | 'name' | 'isOwner' | 'memberCount'>[]): OwnedServers {
    const owned = servers
        .filter((server) => server.isOwner)
        .map(({ id, name, memberCount }) => ({ id, name, memberCount }))
    return {
        blocking: owned.filter((server) => server.memberCount > 1),
        alone: owned.filter((server) => server.memberCount <= 1)
    }
}
