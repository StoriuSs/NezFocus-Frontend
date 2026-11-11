import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { CreateServerRequest, Server, UpdateServerRequest } from '../types'

/** GET /servers: every server they are in, in the order they joined (C-05). */
export async function fetchServers(): Promise<Server[]> {
    const response = await api.get<ApiEnvelope<{ servers: Server[] }>>('/servers')
    return response.data.data.servers
}

/** POST /servers (S-SRV-01): the new server, as the list shows it. */
export async function createServer(body: CreateServerRequest, idempotencyKey: string): Promise<Server> {
    const response = await api.post<ApiEnvelope<Server>>('/servers', body, {
        headers: { 'Idempotency-Key': idempotencyKey }
    })
    return response.data.data
}

/** POST /servers/{id}/icon: a square picture, cropped already. Answers with its URL. */
export async function uploadServerIcon(serverId: string, icon: Blob, idempotencyKey: string): Promise<string> {
    const formData = new FormData()
    formData.append('icon', icon, 'icon.jpg')
    // No Content-Type: the browser sets it, with the boundary.
    const response = await api.post<ApiEnvelope<{ iconUrl: string }>>(`/servers/${serverId}/icon`, formData, {
        headers: { 'Idempotency-Key': idempotencyKey }
    })
    return response.data.data.iconUrl
}

/** PATCH /servers/{id} (S-SET-01): name and welcome channel (null: "Send none"). */
export async function updateServer(serverId: string, body: UpdateServerRequest): Promise<Server> {
    const response = await api.patch<ApiEnvelope<Server>>(`/servers/${serverId}`, body)
    return response.data.data
}

/** DELETE /servers/{id}/icon: back to the initials. */
export async function removeServerIcon(serverId: string): Promise<void> {
    await api.delete(`/servers/${serverId}/icon`)
}

/** DELETE /servers/{id}/members/me (S-SRV-04): the owner is refused (OWNER_CANNOT_LEAVE), and hands it over first. */
export async function leaveServer(serverId: string): Promise<void> {
    await api.delete(`/servers/${serverId}/members/me`)
}

/** DELETE /servers/{id} (S-SET-07, owner): the name typed again, compared without case or accents. */
export async function deleteServer(serverId: string, name: string): Promise<void> {
    await api.delete(`/servers/${serverId}`, { data: { name } })
}

/**
 * POST /servers/{id}/transfer (S-SET-07, owner): the new owner and one's own
 * password (wrong: AUTH_CURRENT_PASSWORD_INVALID, counted as when changing it).
 */
export async function transferOwnership(serverId: string, userId: string, password: string): Promise<void> {
    await api.post(`/servers/${serverId}/transfer`, { userId, password })
}
