import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { CreateChannelRequest, LayoutMove, Server, UpdateChannelRequest } from '../types'

/*
 * The channel list's routes (REQ-SRV-02). Each answers with the server as one
 * now sees it, positions and permissions included: put it in the cache with
 * rememberServer, no second request.
 */

interface Created {
    id: string
    server: Server
}

const base = (serverId: string) => `/servers/${serverId}`

/** POST …/categories: at the end of the list. */
export async function createCategory(serverId: string, name: string, idempotencyKey: string): Promise<Created> {
    const response = await api.post<ApiEnvelope<Created>>(
        `${base(serverId)}/categories`,
        { name },
        {
            headers: { 'Idempotency-Key': idempotencyKey }
        }
    )
    return response.data.data
}

export async function renameCategory(serverId: string, categoryId: string, name: string): Promise<Server> {
    const response = await api.patch<ApiEnvelope<Server>>(`${base(serverId)}/categories/${categoryId}`, { name })
    return response.data.data
}

/** Its channels move above the first category. */
export async function deleteCategory(serverId: string, categoryId: string): Promise<Server> {
    const response = await api.delete<ApiEnvelope<Server>>(`${base(serverId)}/categories/${categoryId}`)
    return response.data.data
}

/** POST …/channels: at the end of its group. */
export async function createChannel(
    serverId: string,
    body: CreateChannelRequest,
    idempotencyKey: string
): Promise<Created> {
    const response = await api.post<ApiEnvelope<Created>>(`${base(serverId)}/channels`, body, {
        headers: { 'Idempotency-Key': idempotencyKey }
    })
    return response.data.data
}

/** Only what is sent changes. */
export async function updateChannel(serverId: string, channelId: string, body: UpdateChannelRequest): Promise<Server> {
    const response = await api.patch<ApiEnvelope<Server>>(`${base(serverId)}/channels/${channelId}`, body)
    return response.data.data
}

export async function deleteChannel(serverId: string, channelId: string): Promise<Server> {
    const response = await api.delete<ApiEnvelope<Server>>(`${base(serverId)}/channels/${channelId}`)
    return response.data.data
}

/** PATCH …/channels/order: one drop (D-149). Both ids are sent even when null. */
export async function moveInLayout(serverId: string, move: LayoutMove): Promise<Server> {
    const response = await api.patch<ApiEnvelope<Server>>(`${base(serverId)}/channels/order`, move)
    return response.data.data
}
