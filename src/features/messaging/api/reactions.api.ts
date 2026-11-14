import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { Reactors } from '../types'

const path = (messageId: string, emoji: string) => `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`

/** PUT (REQ-MSG-05, SRS 1.71): give the emoji; given already, nothing changes. */
export async function addReaction(messageId: string, emoji: string): Promise<void> {
    await api.put(path(messageId, emoji))
}

/** DELETE: take one's own emoji back; one not given changes nothing. */
export async function removeReaction(messageId: string, emoji: string): Promise<void> {
    await api.delete(path(messageId, emoji))
}

/** GET: the first three people to give it, and how many did (the chip's Tooltip). */
export async function fetchReactors(messageId: string, emoji: string): Promise<Reactors> {
    const response = await api.get<ApiEnvelope<Reactors>>(path(messageId, emoji))
    return response.data.data
}
