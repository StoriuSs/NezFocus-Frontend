import axios from 'axios'
import { getApiErrorType, NETWORK_ERROR, retryAfterSeconds } from '@/lib/api-error'

/** The longest note a request by username may carry (REQ-SOCIAL-01). */
export const NOTE_MAX = 150

/**
 * A username as typed, the way the API knows it (S-DM-02 › Thêm bạn): no
 * spaces around it, one "@" in front dropped, lower case.
 */
export const normalizedUsername = (typed: string): string => typed.trim().replace(/^@/, '').toLowerCase()

/**
 * What the Add friend dialog says under the username field (S-DM-02 ›
 * Thêm bạn › Lỗi); `failed` is left to the query client's Toast. One answer
 * for whoever cannot be asked (D-23): blocked or not is never told.
 */
export type AddFriendProblem =
    | { kind: 'empty' }
    | { kind: 'own' }
    | { kind: 'notFound' }
    | { kind: 'cannot' }
    | { kind: 'dailyLimit' }
    | { kind: 'lookupLimit'; waitSeconds: number }
    | { kind: 'pending' }
    | { kind: 'alreadyFriends' }
    | { kind: 'offline' }
    | { kind: 'failed' }

/** The error's `data.reason` (camelCased by src/lib/api.ts): which limit was reached. */
function reasonOf(error: unknown): unknown {
    if (!axios.isAxiosError(error)) return undefined
    return (error.response?.data as { data?: { reason?: unknown } } | undefined)?.data?.reason
}

/** The problem a failed look-up or request is, for the field (`failed`: anything else). */
export function addFriendProblem(error: unknown): AddFriendProblem {
    switch (getApiErrorType(error)) {
        case 'NOT_FOUND_ERROR':
            return { kind: 'notFound' }
        case 'CANNOT_MESSAGE_USER':
            return { kind: 'cannot' }
        case 'FRIEND_REQUEST_PENDING':
            return { kind: 'pending' }
        case 'ALREADY_FRIENDS':
            return { kind: 'alreadyFriends' }
        case 'RATE_LIMIT_EXCEEDED':
            return reasonOf(error) === 'user_lookup'
                ? { kind: 'lookupLimit', waitSeconds: retryAfterSeconds(error) ?? 60 }
                : { kind: 'dailyLimit' }
        case NETWORK_ERROR:
            return { kind: 'offline' }
        default:
            return { kind: 'failed' }
    }
}
