import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { Dm, DmList } from '../types'

/** GET /me/dms: my DMs shown in my list (D-244), the latest active first. */
export async function fetchDms(): Promise<Dm[]> {
    const response = await api.get<ApiEnvelope<DmList>>('/me/dms')
    return response.data.data.dms
}

/**
 * POST /me/dms: my DM with someone, open again on my side, or a new one for
 * someone I may message (D-242); none yet and I may not → CANNOT_MESSAGE_USER.
 * `@Idempotent`.
 */
export async function openDm(userId: string, idempotencyKey: string): Promise<Dm> {
    const response = await api.post<ApiEnvelope<Dm>>(
        '/me/dms',
        { userId },
        { headers: { 'Idempotency-Key': idempotencyKey } }
    )
    return response.data.data
}

/** DELETE /me/dms/{id}: closed on my side (D-244), back in my list when a message comes. */
export async function closeDm(dmId: string): Promise<void> {
    await api.delete(`/me/dms/${dmId}`)
}
