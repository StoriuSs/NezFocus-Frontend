import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import { tokenNow } from '@/lib/before-sign-out'
import type { UserProfile } from '@/features/users/types'

/**
 * GET /users/me. The one request for the profile: useProfile's query runs it,
 * and the auth store runs it at sign-in to fill that same query's cache.
 */
export async function fetchProfile(): Promise<UserProfile> {
    const response = await api.get<ApiEnvelope<UserProfile>>('/users/me')
    return response.data.data
}

/**
 * DELETE /users/me/avatar (D-72). `onLeave`: sent as the tab closes or signs
 * out, with `keepalive` so the browser finishes it after the page is gone,
 * and with the token in memory as it is (`tokenNow`): there is no time to
 * refresh it, and signing out forgets it right after.
 */
export async function removeAvatar(onLeave = false): Promise<void> {
    await api.delete('/users/me/avatar', onLeave ? leavingRequest(tokenNow()) : undefined)
}

function leavingRequest(token: string | undefined) {
    const keepalive = { adapter: 'fetch' as const, fetchOptions: { keepalive: true } }
    return token ? { ...keepalive, skipAuth: true, headers: { Authorization: `Bearer ${token}` } } : keepalive
}
