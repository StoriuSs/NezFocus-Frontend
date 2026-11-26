import { create } from 'zustand'
import type { Room } from 'livekit-client'
import type { DeviceState } from '@/lib/livekit'
import type { CallResult } from './lib/call-result'
import type { Call } from './types'

/**
 * Where this tab is with its call (09 S-CALL-01): ringing out (`calling`),
 * answered and getting the media link (`joining`, "Đang kết nối…"), in it,
 * or LiveKit trying again (`reconnecting`).
 */
export type CallPhase = 'calling' | 'joining' | 'connected' | 'reconnecting'

/** The call this tab made or answered (another tab's is not this one, D-255). */
export interface TabCall {
    call: Call
    phase: CallPhase
}

/** Something to say about a call this tab does not hold, once (`CallWatch` says it, then forgets it). */
export type CallNotice =
    /** A call ringing to me stopped unanswered (the caller cancelled, 45 seconds): "Cuộc gọi nhỡ từ {Tuấn}". */
    | { kind: 'missed'; call: Call }
    /** Answered in another tab of mine: "Đã nghe máy ở tab khác". */
    | { kind: 'answered-elsewhere'; call: Call }

interface CallState {
    current: TabCall | null
    /** This tab's mic in the call: on as one calls or answers (D-106). */
    mic: DeviceState
    /** This tab's camera in the call: on for a video call, as one presses it otherwise. */
    camera: DeviceState
    /** The LiveKit room while in the call, for the call's page. */
    room: Room | null
    /** What the call's page says once it is over, for a few seconds (C-48 › Kết quả). */
    result: CallResult | null
    notice: (CallNotice & { at: number }) | null
}

export const useCallStore = create<CallState>(() => ({
    current: null,
    mic: 'off',
    camera: 'off',
    room: null,
    result: null,
    notice: null
}))
