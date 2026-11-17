import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { MarkNotificationsReadRequest, NotificationList } from '../types'

/** Items a page (06 S-NOTI-01 › Phân trang). */
export const INBOX_PAGE = 30

/**
 * GET /me/notifications: the newest items, or those after `before` (the
 * oldest one held), of the channels one views now, with the unread count.
 */
export async function fetchNotifications(before: string | null): Promise<NotificationList> {
    const response = await api.get<ApiEnvelope<NotificationList>>('/me/notifications', {
        params: { limit: INBOX_PAGE, ...(before ? { before } : {}) }
    })
    return response.data.data
}

/**
 * POST /me/notifications/read: `{ ids }` or `{ all: true, beforeId }`; the
 * unread count after. Marking twice changes nothing, so no Idempotency-Key.
 */
export async function markNotificationsRead(body: MarkNotificationsReadRequest): Promise<number> {
    const response = await api.post<ApiEnvelope<{ unreadCount: number }>>('/me/notifications/read', body)
    return response.data.data.unreadCount
}
