import { sendRealtimeSignal } from '@/features/realtime'
import { getApiErrorType, timedOutUntil } from '@/lib/api-error'
import { onBeforeSignOut } from '@/lib/before-sign-out'
import type { DeviceState, LinkEnd, RoomLink } from '@/lib/livekit'
import { leaveVoiceRoom, requestVoiceToken } from '../api/voice.api'
import { useVoiceStore } from '../voice.store'
import { askMicrophone, closeCamera, openCamera, type Device } from './devices'
import { forgetRoom, keepRoom } from './rejoin'

/**
 * This tab's time in a voice room (REQ-VC-01 → VC-03): join, leave, the
 * microphone and camera. Not React: the link outlives every page (the dock follows the
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
/** Each Camera press before joining: an answer from the browser after a later press is stale. */
let cameraAsk = 0

const set = useVoiceStore.setState
const get = useVoiceStore.getState

/** Mic and camera as this tab has them, for the room's list (D-206): sent while in a room. */
export function tellOwnState(): void {
    const { call, mic, camera } = get()
    if (call?.phase !== 'connected') return
    sendRealtimeSignal('voice.self_state', { mic: mic === 'on', camera: camera === 'on' })
}

/** Out of a room: mic and camera off, a browser's refusal kept (the Banner stays until it allows them). */
const devicesOut = (state: ReturnType<typeof get>) => ({
    mic: state.mic === 'blocked' ? ('blocked' as const) : ('off' as const),
    camera: state.camera === 'blocked' ? ('blocked' as const) : ('off' as const)
})

/** The preview's picture stopped, its stream let go (LiveKit has the camera, or it is off). */
function dropPreview(): void {
    closeCamera(get().cameraPreview)
    set({ cameraPreview: null })
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
            ...devicesOut(state),
            modMuted: null,
            // The API's reason, when its word came before LiveKit's, is kept.
            removed:
                end === 'removed'
                    ? {
                          channelId: room.channelId,
                          at: Date.now(),
                          reason: state.removed?.channelId === room.channelId ? state.removed.reason : undefined
                      }
                    : state.removed
        }))
    }
}

/**
 * Joins `room`, the microphone and camera as the preview page left them
 * (REQ-VC-03); `devicesOff` (a reload, D-51) joins with both off. True once
 * in; false when it failed (the store holds why) or another join or a leave
 * came first. The preview's picture stays until LiveKit has the camera.
 */
export async function joinRoom(room: RoomToJoin, options: { devicesOff?: boolean } = {}): Promise<boolean> {
    attempt += 1
    const id = attempt
    const before = link
    link = null
    if (options.devicesOff) {
        dropPreview()
        set((state) => devicesOut(state))
    }
    set({ call: { ...room, phase: 'joining' }, room: null, problem: null, modMuted: null })
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
            livekit.joinRoom(
                token.url,
                token.token,
                { mic: get().mic === 'on', camera: get().camera === 'on' },
                {
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
                }
            ),
            Math.max(deadline - Date.now(), 0),
            (late) => void late.link.leave()
        )
        // Pressed while LiveKit was joining (07 `joining`: Mic and Camera still work): it joined with what was set when it began.
        const micState = await settle(joined.micState, get().mic, joined.link.setMic)
        const cameraState = await settle(joined.cameraState, get().camera, joined.link.setCamera)
        if (id !== attempt) {
            await joined.link.leave()
            return false
        }
        link = joined.link
        stopSignOut ??= onBeforeSignOut(signOutLeave)
        keepRoom({ serverId: room.serverId, channelId: room.channelId })
        dropPreview()
        set({
            call: { ...room, phase: 'connected' },
            room: joined.link.room,
            mic: micState,
            camera: cameraState
        })
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
        // Its preview page gone meanwhile: nothing shows the camera any more, so it is off (07 câu L3b-c).
        if (!get().cameraPreview && get().camera === 'on') set({ camera: 'off' })
        return false
    }
}

/** A device as LiveKit joined with it, switched to the state pressed since, unless the browser refused it. */
async function settle(
    joined: DeviceState,
    wanted: DeviceState,
    apply: (on: boolean) => Promise<DeviceState>
): Promise<DeviceState> {
    if (joined === 'blocked' || wanted === 'blocked' || (joined === 'on') === (wanted === 'on')) return joined
    return apply(wanted === 'on')
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
    set((state) => ({ call: null, room: null, modMuted: null, ...devicesOut(state) }))
    await before?.leave()
    await leaveVoiceRoom().catch(() => undefined)
}

/** Signing out while in a room: out of LiveKit, and off the list with the token still in hand. */
function signOutLeave(): void {
    attempt += 1
    cameraAsk += 1
    const before = link
    link = null
    stopSignOut?.()
    stopSignOut = null
    forgetRoom()
    dropPreview()
    set((state) => ({ call: null, room: null, modMuted: null, ...devicesOut(state) }))
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

/**
 * A moderator muted this account in `channelId` (D-207): LiveKit no longer
 * lets the mic send and drops its track; this lets the device go too, and
 * the page and the room's list say off. Nothing when this tab is not in
 * that room, or its mic is already off.
 */
export async function micTakenAway(channelId: string): Promise<void> {
    if (!link || get().call?.channelId !== channelId || get().mic !== 'on') return
    await link.setMic(false)
    set({ mic: 'off' })
    tellOwnState()
}

/**
 * The Camera button (C-21), in a room or on the preview page: in a room it
 * starts or stops sending the picture; before joining it opens the camera
 * for one's own tile, the browser asking the person on this first press
 * (D-53). Refused: `blocked` (S-MOD-04).
 */
export async function switchCamera(on: boolean): Promise<void> {
    if (link) {
        set({ camera: await link.setCamera(on) })
        tellOwnState()
        return
    }
    dropPreview()
    cameraAsk += 1
    const ask = cameraAsk
    if (!on) {
        set({ camera: 'off' })
        return
    }
    const opened = await openCamera()
    // Pressed again, the page gone, or in a room by now, while the browser was asking: this picture is not wanted.
    if (ask !== cameraAsk || link) {
        closeCamera(opened.stream)
        return
    }
    set({ camera: opened.state, cameraPreview: opened.stream })
}

/**
 * The preview page goes, or may no longer use the camera (07 câu L3b-c):
 * its picture stops, a camera the browser is still asking for is not kept,
 * and the camera is off, the light with it. Joining or in a room, the
 * camera is LiveKit's and stays (a join that then fails turns it off).
 */
export function stopPreviewCamera(): void {
    cameraAsk += 1
    dropPreview()
    // Joining (it fails: off then) or in a room: the camera is LiveKit's.
    if (get().call) return
    if (get().camera === 'on') set({ camera: 'off' })
}

/** The page of a room that refused a join goes, or that room opens to one again: the refusal is no longer news. */
export function forgetProblem(channelId: string): void {
    if (get().problem?.channelId === channelId) set({ problem: null })
}

/** The browser allows the device again (S-MOD-04): the button back to `off`, the device not switched on. */
export function deviceAllowedAgain(device: Device): void {
    if (get()[device] === 'blocked') set({ [device]: 'off' })
}

/** For tests: back to no room. */
export function resetSession(): void {
    attempt += 1
    cameraAsk += 1
    link = null
    stopSignOut?.()
    stopSignOut = null
    closeCamera(get().cameraPreview)
    useVoiceStore.setState({
        call: null,
        room: null,
        mic: 'off',
        camera: 'off',
        cameraPreview: null,
        problem: null,
        removed: null,
        modMuted: null
    })
}
