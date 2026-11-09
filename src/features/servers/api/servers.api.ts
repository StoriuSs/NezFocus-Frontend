import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { CreateServerRequest, Server } from '../types'

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
