import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import { leavingRequest } from '@/lib/before-sign-out'
import type { VoiceToken } from '../types'

/**
 * POST /voice/token (REQ-VC-01): a token for the room, if one may join it;
 * being in another room puts one out of it first (VC-02). Not idempotent: a
 * retry is another token.
 */
export async function requestVoiceToken(channelId: string): Promise<VoiceToken> {
    const response = await api.post<ApiEnvelope<VoiceToken>>('/voice/token', { channelId })
    return response.data.data
}

/**
 * POST /voice/leave: off LiveKit and the room's list at once, without waiting
 * for its webhook. Only when one presses Leave or signs out: as the page
 * closes or reloads LiveKit hears it itself, and this would put out the
 * connection a reload makes (M4 L2). `onLeave`: sent while signing out
 * (`leavingRequest`), as the avatar's removal is.
 */
export async function leaveVoiceRoom(onLeave = false): Promise<void> {
    await api.post('/voice/leave', undefined, onLeave ? leavingRequest() : undefined)
}
