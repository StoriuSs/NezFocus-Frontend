import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import { leavingRequest } from '@/lib/before-sign-out'
import type { Call, CallJoin, MyCall } from '../types'

/** GET /me/call: the call I make or am in, and the ones ringing to me (D-245); read as the app opens and on a reload. */
export async function fetchMyCall(): Promise<MyCall> {
    const response = await api.get<ApiEnvelope<MyCall>>('/me/call')
    return response.data.data
}

/**
 * POST /dms/{id}/calls (`@Idempotent`): calls the other one of a DM, ringing;
 * answered at once when they were calling me in it; `missed` (`busy`) when
 * they are in another call. CANNOT_MESSAGE_USER, CALL_IN_PROGRESS refused.
 */
export async function startCall(dmId: string, video: boolean, idempotencyKey: string): Promise<Call> {
    const response = await api.post<ApiEnvelope<Call>>(
        `/dms/${dmId}/calls`,
        { video },
        { headers: { 'Idempotency-Key': idempotencyKey } }
    )
    return response.data.data
}

/** POST /calls/{id}/accept: answers a call ringing to me; one no longer ringing comes back as it is (D-245). */
export async function acceptCall(callId: string): Promise<Call> {
    const response = await api.post<ApiEnvelope<Call>>(`/calls/${callId}/accept`)
    return response.data.data
}

/** POST /calls/{id}/decline: no inbox item for me (SOCIAL-06). */
export async function declineCall(callId: string): Promise<Call> {
    const response = await api.post<ApiEnvelope<Call>>(`/calls/${callId}/decline`)
    return response.data.data
}

/**
 * POST /calls/{id}/end: Cancel while ringing, End once answered. `onLeave`:
 * sent while signing out (`leavingRequest`, L4-g), as the voice room's leave is.
 */
export async function endCall(callId: string, onLeave = false): Promise<Call> {
    const response = await api.post<ApiEnvelope<Call>>(
        `/calls/${callId}/end`,
        undefined,
        onLeave ? leavingRequest() : undefined
    )
    return response.data.data
}

/** POST /calls/{id}/join: LiveKit's token for the call while it is `active`, also after a reload (D-239, D-246). */
export async function joinCall(callId: string): Promise<CallJoin> {
    const response = await api.post<ApiEnvelope<CallJoin>>(`/calls/${callId}/join`)
    return response.data.data
}
