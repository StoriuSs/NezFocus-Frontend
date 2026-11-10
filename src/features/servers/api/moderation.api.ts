import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { BanPage } from '../types'
import type { PageSize } from './roles.api'

/*
 * Kick, ban, unban and timeout (REQ-ROLE-04, S-SET-03, S-SET-04). The backend
 * decides on rank and permissions; the page only hides what it would refuse.
 */

/** Out of the server, back with a new invite (KICK_MEMBERS). The reason reaches them from M2 on (D-156). */
export async function kickMember(serverId: string, userId: string, reason: string | null): Promise<void> {
    await api.delete(`/servers/${serverId}/members/${userId}`, { data: { reason } })
}

/** One of the six lengths from now, a new length for a running one, or null to end it (MODERATE_MEMBERS). */
export async function timeoutMember(
    serverId: string,
    userId: string,
    timeoutSeconds: number | null,
    reason: string | null
): Promise<void> {
    await api.patch(`/servers/${serverId}/members/${userId}`, { timeoutSeconds, reason })
}

/** Out of the server and kept out (BAN_MEMBERS); only someone in it (D-155). */
export async function banMember(serverId: string, userId: string, reason: string | null): Promise<void> {
    await api.put(`/servers/${serverId}/bans/${userId}`, { reason })
}

export async function unbanMember(serverId: string, userId: string): Promise<void> {
    await api.delete(`/servers/${serverId}/bans/${userId}`)
}

/** GET /servers/{id}/bans: newest first. */
export async function fetchBans(serverId: string, page: number, limit: PageSize): Promise<BanPage> {
    const response = await api.get<ApiEnvelope<BanPage>>(`/servers/${serverId}/bans`, { params: { page, limit } })
    return response.data.data
}
