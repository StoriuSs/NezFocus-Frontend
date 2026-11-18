import { create } from 'zustand'
import type { Room } from 'livekit-client'
import type { DeviceState } from '@/lib/livekit'

/** Joining (the button `loading`), in the room, or LiveKit trying again (C-09 `+reconnecting`). */
export type CallPhase = 'joining' | 'connected' | 'reconnecting'

/** The room this tab is in, or joining (VC-02: one per account; another tab's is not this one). */
export interface Call {
    serverId: string
    channelId: string
    name: string
    phase: CallPhase
}

interface VoiceState {
    call: Call | null
    /** The LiveKit room while in one, for the room page's hooks. */
    room: Room | null
    /** This tab's microphone: asked for on the preview page, kept into the room (REQ-VC-03). */
    mic: DeviceState
    /** This tab's camera: turned on on the preview page, kept into the room (REQ-VC-03, D-53). */
    camera: DeviceState
    /** The camera's picture on the preview page, before joining (one's own tile, mirrored). */
    cameraPreview: MediaStream | null
    /**
     * The last join that failed: why, for that room's page (`join-error`,
     * `forbidden`); a timeout says until when (ISO), from the API's answer.
     * Forgotten when that page goes, or the room opens to one again.
     */
    problem: { channelId: string; kind: 'network' | 'refused'; until?: string } | null
    /** Put out of a room by the server just now, for the Toast saying where one went (07 câu L3-b). */
    removed: { channelId: string; at: number } | null
}

/**
 * This tab's voice: which room it is in, its microphone and camera, the last join's
 * problem. Client state only (state-management.md): who is in each room is
 * server data, in the servers' list (D-205). Written by the session
 * (lib/session.ts), read with a selector.
 */
export const useVoiceStore = create<VoiceState>(() => ({
    call: null,
    room: null,
    mic: 'off',
    camera: 'off',
    cameraPreview: null,
    problem: null,
    removed: null
}))
