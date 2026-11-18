import { sendRealtimeSignal } from '@/features/realtime'
import { getApiErrorType, timedOutUntil } from '@/lib/api-error'
import { onBeforeSignOut } from '@/lib/before-sign-out'
import type { LinkEnd, RoomLink } from '@/lib/livekit'
import { leaveVoiceRoom, requestVoiceToken } from '../api/voice.api'
import { useVoiceStore } from '../voice.store'
import { askMicrophone } from './devices'
import { forgetRoom, keepRoom } from './rejoin'

/**
 * This tab's time in a voice room (REQ-VC-01 → VC-03): join, leave, the
 * microphone. Not React: the link outlives every page (the dock follows the
 * person around the app), so it lives here, and the store says where it is.
 *
 * One room a tab (VC-02): joining another leaves this one first; the API
 * also puts the account out of any room it is in elsewhere before giving the
 * token. A join that takes longer than JOIN_MS is `join-error` (07); one
 * that answers after it, or after the person left meanwhile, is left at once.
 */

/** The longest a join may take before the page says it failed (07 `joining` → `join-error`). */
export const JOIN_MS = 10_000

/** A room to join, as the page knows it. */
export interface RoomToJoin {
    serverId: string
    channelId: string
    name: string
}

let link: RoomLink | null = null
/** Each join and leave: a join answered after a later one is stale. */
let attempt = 0
let stopSignOut: (() => void) | null = null

const set = useVoiceStore.setState
const get = useVoiceStore.getState

/** Mic and camera as this tab has them, for the room's list (D-206): sent while in a room. */
export function tellOwnState(): void {
    const { call, mic } = get()
    if (call?.phase !== 'connected') return
    sendRealtimeSignal('voice.self_state', { mic: mic === 'on', camera: false })
}

class TooLong extends Error {}

/** `promise`, or a TooLong once `ms` pass; one answered later goes to `late`. */
function within<T>(promise: Promise<T>, ms: number, late: (value: T) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let over = false
        const timer = setTimeout(() => {
            over = true
            reject(new TooLong())
        }, ms)
        promise.then(
            (value) => {
                clearTimeout(timer)
                if (over) late(value)
                else resolve(value)
            },
            (error: unknown) => {
                clearTimeout(timer)
                if (!over) reject(error)
            }
        )
    })
}

/** The API refused the token (no CONNECT, timed out, the room gone): the page says why from what it holds. */
const REFUSED = new Set(['FORBIDDEN_ERROR', 'MEMBER_TIMED_OUT', 'NOT_FOUND_ERROR'])

function ended(id: number, room: RoomToJoin) {
    return (end: LinkEnd) => {
        if (id !== attempt) return
        link = null
        stopSignOut?.()
        stopSignOut = null
        // Ended by this tab without a Leave: the page going (LiveKit leaves on pagehide). A reload joins again.
        if (end !== 'left') forgetRoom()
        set((state) => ({
            call: null,
            room: null,
            mic: state.mic === 'blocked' ? 'blocked' : 'off',
            removed: end === 'removed' ? { channelId: room.channelId, at: Date.now() } : state.removed
        }))
    }
}

/**
 * Joins `room`, the microphone as the preview page left it (REQ-VC-03).
 * True once in; false when it failed (the store holds why) or another join or
 * a leave came first.
 */
export async function joinRoom(room: RoomToJoin, options: { micOff?: boolean } = {}): Promise<boolean> {
    attempt += 1
    const id = attempt
    const before = link
    link = null
    if (options.micOff && get().mic === 'on') set({ mic: 'off' })
    set({ call: { ...room, phase: 'joining' }, room: null, problem: null })
    const deadline = Date.now() + JOIN_MS
    try {
        if (before) {
            // Out of the old room whatever comes of this join: a reload does not take one back there.
            forgetRoom()
            stopSignOut?.()
            stopSignOut = null
            await before.leave()
        }
        const token = await within(requestVoiceToken(room.channelId), JOIN_MS, () => undefined)
        const livekit = await import('@/lib/livekit')
        const joined = await within(
            livekit.joinRoom(token.url, token.token, get().mic === 'on', {
                onEnd: ended(id, room),
                onReconnecting: () => {
                    if (id === attempt)
                        set((state) => ({ call: state.call && { ...state.call, phase: 'reconnecting' } }))
                },
                onReconnected: () => {
                    if (id !== attempt) return
                    set((state) => ({ call: state.call && { ...state.call, phase: 'connected' } }))
                    tellOwnState()
                }
            }),
            Math.max(deadline - Date.now(), 0),
            (late) => void late.link.leave()
        )
        if (id !== attempt) {
            await joined.link.leave()
            return false
        }
        link = joined.link
        stopSignOut ??= onBeforeSignOut(signOutLeave)
        keepRoom({ serverId: room.serverId, channelId: room.channelId })
        set({ call: { ...room, phase: 'connected' }, room: joined.link.room, mic: joined.micState })
        tellOwnState()
        return true
    } catch (error) {
        if (id !== attempt) return false
        const type = error instanceof TooLong ? undefined : getApiErrorType(error)
        const until = timedOutUntil(error)?.toISOString()
        set({
            call: null,
            room: null,
            problem: {
                channelId: room.channelId,
                kind: type && REFUSED.has(type) ? 'refused' : 'network',
                ...(until ? { until } : {})
            }
        })
        return false
    }
}

/**
 * Leaves the room this tab is in or joining, at once on the page, and asks
 * the API to take one off its list without waiting for LiveKit (C-21 Rời
 * phòng: no question asked). A failed ask changes nothing for the person:
 * LiveKit tells the API soon anyway.
 */
export async function leaveRoom(): Promise<void> {
    attempt += 1
    const before = link
    link = null
    stopSignOut?.()
    stopSignOut = null
    forgetRoom()
    set((state) => ({ call: null, room: null, mic: state.mic === 'blocked' ? 'blocked' : 'off' }))
    await before?.leave()
    await leaveVoiceRoom().catch(() => undefined)
}

/** Signing out while in a room: out of LiveKit, and off the list with the token still in hand. */
function signOutLeave(): void {
    attempt += 1
    const before = link
    link = null
    stopSignOut?.()
    stopSignOut = null
    forgetRoom()
    set({ call: null, room: null })
    void before?.leave()
    void leaveVoiceRoom(true).catch(() => undefined)
}

/**
 * The Mic button (C-21), in a room or on the preview page: in a room it
 * switches the sound sent; before joining it only asks the browser, which
 * asks the person on this first press (D-36). Refused: `blocked` (S-MOD-04).
 */
export async function switchMic(on: boolean): Promise<void> {
    const state = link ? await link.setMic(on) : on ? await askMicrophone() : 'off'
    set({ mic: state })
    tellOwnState()
}

/** The page of a room that refused a join goes, or that room opens to one again: the refusal is no longer news. */
export function forgetProblem(channelId: string): void {
    if (get().problem?.channelId === channelId) set({ problem: null })
}

/** The browser allows the microphone again (S-MOD-04): the button back to `off`, the mic not switched on. */
export function micAllowedAgain(): void {
    if (get().mic === 'blocked') set({ mic: 'off' })
}

/** For tests: back to no room. */
export function resetSession(): void {
    attempt += 1
    link = null
    stopSignOut?.()
    stopSignOut = null
    useVoiceStore.setState({ call: null, room: null, mic: 'off', problem: null, removed: null })
}
