import api from '@/lib/api'
import type { ApiEnvelope, ApiModel } from '@/lib/api-types'
import type { PinnedMessage } from '../types'

/** GET /channels/{id}/pins (REQ-MSG-07): the latest pinned first, at most 50. */
export async function fetchPins(channelId: string): Promise<PinnedMessage[]> {
    const response = await api.get<ApiEnvelope<ApiModel<'PinListResponseDto'>>>(`/channels/${channelId}/pins`)
    return response.data.data.items
}

/** PUT: MANAGE_MESSAGES pins a message, posting "<who> pinned a message" (REQ-MSG-08); pinned already, nothing changes. */
export async function pinMessage(channelId: string, messageId: string): Promise<void> {
    await api.put(`/channels/${channelId}/pins/${messageId}`)
}

/** DELETE: out of the pins, with no system message (SRS 1.71). */
export async function unpinMessage(channelId: string, messageId: string): Promise<void> {
    await api.delete(`/channels/${channelId}/pins/${messageId}`)
}
