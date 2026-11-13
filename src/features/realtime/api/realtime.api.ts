import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { RealtimeTicket } from '../types'

/** POST /realtime/ticket (D-13): a ticket to open one socket with, spendable once within 30 s. */
export async function fetchRealtimeTicket(): Promise<string> {
    const response = await api.post<ApiEnvelope<RealtimeTicket>>('/realtime/ticket')
    return response.data.data.ticket
}
