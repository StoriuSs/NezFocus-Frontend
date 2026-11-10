import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { Invite, InviteListItem, InvitePreview, InviteSettings, Server } from '../types'

/** POST /servers/{id}/invites (S-SRV-02): their own link again when it may be (D-151), else a new one. */
export async function createInvite(
    serverId: string,
    settings: InviteSettings,
    idempotencyKey: string
): Promise<Invite> {
    const response = await api.post<ApiEnvelope<Invite>>(`/servers/${serverId}/invites`, settings, {
        headers: { 'Idempotency-Key': idempotencyKey }
    })
    return response.data.data
}

/** GET /servers/{id}/invites (S-SET-04, MANAGE_SERVER): the links that still open, newest first. */
export async function fetchInvites(serverId: string): Promise<InviteListItem[]> {
    const response = await api.get<ApiEnvelope<{ invites: InviteListItem[] }>>(`/servers/${serverId}/invites`)
    return response.data.data.invites
}

/** DELETE /invites/{code}: the link stops opening. */
export async function revokeInvite(code: string): Promise<void> {
    await api.delete(`/invites/${encodeURIComponent(code)}`)
}

/** GET /invites/{code} (S-SRV-03), open to anyone; `channel` is the link's `?channel=` (D-150). */
export async function fetchInvitePreview(code: string, channel: string | null): Promise<InvitePreview> {
    const response = await api.get<ApiEnvelope<InvitePreview>>(`/invites/${encodeURIComponent(code)}`, {
        params: channel ? { channel } : undefined
    })
    return response.data.data
}

/** POST /invites/{code}/accept: the server as the list shows it; `joined` false for a member already. */
export async function acceptInvite(code: string): Promise<{ server: Server; joined: boolean }> {
    const response = await api.post<ApiEnvelope<{ server: Server; joined: boolean }>>(
        `/invites/${encodeURIComponent(code)}/accept`
    )
    return response.data.data
}
