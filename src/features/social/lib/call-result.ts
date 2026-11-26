import type { Call } from '../types'
import { calledMe } from './call-cache'

/**
 * What the call's page says once a call is over (09 S-CALL-01, C-48):
 * refused, the other one busy or not answering, the line lost, never
 * connected, or over.
 */
export type CallResultKind = 'declined' | 'busy' | 'no-answer' | 'dropped' | 'failed' | 'ended'

export interface CallResult {
    kind: CallResultKind
    call: Call
    /** How long it lasted, answered calls only (`ended_at` − `accepted_at`). */
    seconds: number | null
    /** "Gọi lại" · "Đóng" under the words (the outcomes one may want to try again). */
    buttons: boolean
    /** How long the page shows it before it is the DM again: 5 seconds with buttons, 2 without (09 Q4). */
    holdMs: number
}

const WITH_BUTTONS_MS = 5000
const ENDED_MS = 2000

/** How long an answered call lasted, in seconds; null when it never was. */
export function callSeconds(call: Pick<Call, 'acceptedAt' | 'endedAt'>): number | null {
    if (!call.acceptedAt || !call.endedAt) return null
    return Math.max(0, Math.floor((Date.parse(call.endedAt) - Date.parse(call.acceptedAt)) / 1000))
}

/**
 * The result a call over leaves on this tab's call page (09 S-CALL-01 ›
 * Nội dung chữ, D-242, D-255), or none:
 * - my own Cancel, or my own Decline: none, no sound (D-255);
 * - refused (I called): "Cuộc gọi bị từ chối"; missed, I called: busy, no
 *   answer, or cut off by the other side (a block mid-ring): over;
 * - never connected (`failed`): "Không kết nối được";
 * - over: "Cuộc gọi đã kết thúc · 03:15", or "Mất kết nối · 08:41" when
 *   this tab was reconnecting as it ended (D-242: no reason of its own on the wire).
 * Missed to me never shows here: the card closes with a Toast.
 */
export function callResultOf(
    call: Call,
    { cancelledByMe, reconnecting }: { cancelledByMe: boolean; reconnecting: boolean }
): CallResult | null {
    const mine = calledMe(call)
    const kind = ((): CallResultKind | null => {
        switch (call.status) {
            case 'declined':
                return mine ? null : 'declined'
            case 'missed':
                if (mine || cancelledByMe) return null
                return call.endReason === 'busy' ? 'busy' : call.endReason === 'no_answer' ? 'no-answer' : 'ended'
            case 'failed':
                return 'failed'
            case 'ended':
                return reconnecting ? 'dropped' : 'ended'
            default:
                return null
        }
    })()
    if (!kind) return null
    const buttons = kind !== 'ended'
    return { kind, call, seconds: callSeconds(call), buttons, holdMs: buttons ? WITH_BUTTONS_MS : ENDED_MS }
}

/** A call's clock (09 › Số): "03:12", from an hour "1:02:45"; never cut. */
export function callClock(ms: number): string {
    const all = Math.max(0, Math.floor(ms / 1000))
    const hours = Math.floor(all / 3600)
    const minutes = Math.floor((all % 3600) / 60)
    const seconds = all % 60
    const two = (n: number) => String(n).padStart(2, '0')
    return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`
}
