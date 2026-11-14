import api from '@/lib/api'
import type { ApiEnvelope, ApiModel } from '@/lib/api-types'
import type { ReadState } from '../types'

/** GET /me/read-states (REQ-MSG-09): every text channel the reader may view, with how far they have read it. */
export async function fetchReadStates(): Promise<ReadState[]> {
    const response = await api.get<ApiEnvelope<ApiModel<'ReadStateListResponseDto'>>>('/me/read-states')
    return response.data.data.items
}

/**
 * POST /channels/{id}/ack (D-46, D-173): read up to a message seen, or with
 * none, the channel's newest ("Mark as read"). The mark only moves forward;
 * the channel's state comes back.
 */
export async function ackChannel(channelId: string, messageId: string | null): Promise<ReadState> {
    const response = await api.post<ApiEnvelope<ReadState>>(
        `/channels/${channelId}/ack`,
        messageId ? { messageId } : {}
    )
    return response.data.data
}
