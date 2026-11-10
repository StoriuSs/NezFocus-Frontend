import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { MemberPage, Role, UpdateRoleRequest } from '../types'

/** GET /servers/{id}/roles (MANAGE_ROLES): highest first, @everyone last. */
export async function fetchRoles(serverId: string): Promise<Role[]> {
    const response = await api.get<ApiEnvelope<{ roles: Role[] }>>(`/servers/${serverId}/roles`)
    return response.data.data.roles
}

/** POST /servers/{id}/roles: no permissions, right below one's highest role (D-87). */
export async function createRole(serverId: string, name: string, idempotencyKey: string): Promise<string> {
    const response = await api.post<ApiEnvelope<{ roleId: string }>>(
        `/servers/${serverId}/roles`,
        { name },
        { headers: { 'Idempotency-Key': idempotencyKey } }
    )
    return response.data.data.roleId
}

export async function updateRole(serverId: string, roleId: string, body: UpdateRoleRequest): Promise<void> {
    await api.patch(`/servers/${serverId}/roles/${roleId}`, body)
}

export async function deleteRole(serverId: string, roleId: string): Promise<void> {
    await api.delete(`/servers/${serverId}/roles/${roleId}`)
}

/** Both highest first, @everyone left out; a stale `seenOrder` is refused with CONFLICT_ERROR. */
export async function reorderRoles(serverId: string, order: string[], seenOrder: string[]): Promise<void> {
    await api.patch(`/servers/${serverId}/roles/order`, { order, seenOrder })
}

/** All of them or none (D-153). */
export async function grantRole(serverId: string, roleId: string, userIds: string[]): Promise<void> {
    await api.put(`/servers/${serverId}/roles/${roleId}/members`, { userIds })
}

export async function revokeRole(serverId: string, roleId: string, userId: string): Promise<void> {
    await api.delete(`/servers/${serverId}/members/${userId}/roles/${roleId}`)
}

export interface MemberQuery {
    q?: string
    roleId?: string
    page?: number
    limit?: 10 | 50 | 100
}

/** GET /servers/{id}/members (D-152): anyone in the server. */
export async function fetchMembers(serverId: string, query: MemberQuery): Promise<MemberPage> {
    const response = await api.get<ApiEnvelope<MemberPage>>(`/servers/${serverId}/members`, { params: query })
    return response.data.data
}
