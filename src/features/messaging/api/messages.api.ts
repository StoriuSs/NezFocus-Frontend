import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { Message, MessageCursor, MessagePage } from '../types'

/** A page of history (SRS 5.1): oldest first, at most `limit` (1-100). */
export async function fetchMessages(channelId: string, cursor: MessageCursor, limit = 50): Promise<MessagePage> {
    const response = await api.get<ApiEnvelope<MessagePage>>(`/channels/${channelId}/messages`, {
        params: { ...cursor, limit }
    })
    return response.data.data
}

/**
 * POST /channels/{id}/messages (REQ-MSG-01). The same nonce sent again
 * answers with the message already saved (REQ-MSG-10); `replyToId` answers a
 * message of the channel (REQ-MSG-05).
 */
export async function sendMessage(
    channelId: string,
    body: { content: string; nonce: string; replyToId?: string },
    idempotencyKey: string
): Promise<Message> {
    const response = await api.post<ApiEnvelope<Message>>(`/channels/${channelId}/messages`, body, {
        headers: { 'Idempotency-Key': idempotencyKey }
    })
    return response.data.data
}

/** PATCH /messages/{id} (REQ-MSG-05): one's own message, the message as it now is back (D-169). */
export async function editMessage(messageId: string, content: string): Promise<Message> {
    const response = await api.patch<ApiEnvelope<Message>>(`/messages/${messageId}`, { content })
    return response.data.data
}

/** DELETE /messages/{id} (REQ-MSG-05): one's own message, or anyone's with MANAGE_MESSAGES. */
export async function deleteMessage(messageId: string): Promise<void> {
    await api.delete(`/messages/${messageId}`)
}
