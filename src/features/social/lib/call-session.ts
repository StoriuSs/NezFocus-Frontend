import type { QueryClient } from '@tanstack/react-query'
import { askMicrophone, leaveRoom as leaveVoiceRoom, useVoiceStore } from '@/features/voice'
import { getApiErrorType } from '@/lib/api-error'
import { onBeforeSignOut } from '@/lib/before-sign-out'
import type { DeviceAnswer, DeviceState, LinkEnd, RoomLink } from '@/lib/livekit'
import { acceptCall, declineCall, endCall, joinCall } from '../api/calls.api'
import { socialKeys } from '../api/keys'
import { useCallStore, type CallPhase } from '../call.store'
import type { Call, MyCall } from '../types'
import { NO_CALL, calledMe, isOpenCall, newestOf, stillNews, withCall } from './call-cache'
import { forgetCall, keepCall } from './call-keep'
import { callResultOf } from './call-result'

/**
 * This tab's 1-1 call (REQ-SOCIAL-05, D-255): calling, answering, the media
 * link, hanging up, what each word of the call means here. Not React: the
 * link outlives every page (the dock follows the person around the app), so
 * it lives here, and the store says where it is, as a voice room's
 * (`voice/lib/session.ts`).
 *
 * One media link an account (D-210): the voice room this tab is in is left
 * as a call starts or is answered (09 Q11: no Toast). The call this tab made
 * or answered is kept in its storage (`call-keep.ts`): another tab of the
 * account holds none, and a reload goes back into it (D-255).
 */

let link: RoomLink | null = null
/** Each join and hang-up: a link answered after a later one is stale. */
let attempt = 0
let stopSignOut: (() => void) | null = null
/** The call this tab pressed Cancel or End on: its own Cancel shows no result, plays no sound (D-255). */
let hungUp: string | null = null
let resultTimer: ReturnType<typeof setTimeout> | undefined
/** The furthest word of each call: one behind it is old news (L4a B6). */
const seen = new Map<string, Call>()
/** Each time this tab holds a call: a read of my calls begun before it says nothing of that call. */
let holds = 0
let cache: QueryClient | null = null

const set = useCallStore.setState
const get = useCallStore.getState

/** The query client whose `GET /me/call` the session keeps (`listenForCalls`). */
export function bindCallCache(client: QueryClient): void {
    cache = client
}

/** A device held by another app stays off (S-MOD-04 `device-busy`); refused: blocked. */
const shown = (answer: DeviceAnswer): DeviceState => (answer === 'busy' ? 'off' : answer)

/** This tab holds `call` now, at `phase`: the mic on (D-106), the camera on for a video call. */
function hold(call: Call, phase: CallPhase, camera: boolean): void {
    holds += 1
    clearTimeout(resultTimer)
    keepCall(call.id)
    stopSignOut ??= onBeforeSignOut(signOutEnd)
    set({ current: { call, phase }, mic: 'on', camera: camera ? 'on' : 'off', room: null, result: null })
}

/** Let go of the link, the storage and the sign-out flush (the call over, or never held). */
function letGo(): void {
    attempt += 1
    const before = link
    link = null
    void before?.leave()
    forgetCall()
    stopSignOut?.()
    stopSignOut = null
}

/** The call over for this tab: the link down, the page's result for a few seconds (C-48 › Kết quả). */
function finish(call: Call): void {
    const tab = get().current
    if (!tab || tab.call.id !== call.id) return
    letGo()
    const mine = hungUp === call.id
    hungUp = null
    const result = callResultOf(call, { cancelledByMe: mine, reconnecting: !mine && tab.phase === 'reconnecting' })
    set({ current: null, room: null, mic: 'off', camera: 'off', result })
    if (!result) return
    resultTimer = setTimeout(() => {
        if (get().result === result) set({ result: null })
    }, result.holdMs)
}

/**
 * A word of a call: `call.*`, or a command's answer. My calls in the cache
 * follow it (`withCall`), unless it is old news (B6); then what it means for
 * this tab: its own call answered (the caller joins), or over (`finish`); a
 * call ringing to me answered in another tab, or missed, said once by
 * `CallWatch`.
 */
export function callHeard(call: Call): void {
    if (!stillNews(seen, call)) return
    seen.set(call.id, call)
    const before = cache?.getQueryData<MyCall>(socialKeys.call()) ?? NO_CALL
    cache?.setQueryData<MyCall>(socialKeys.call(), (my) => withCall(my ?? NO_CALL, call))
    // A read still on its way would put back what it had before this word: read again after it.
    if (cache?.getQueryState(socialKeys.call())?.fetchStatus === 'fetching')
        void cache.invalidateQueries({ queryKey: socialKeys.call() })
    const tab = get().current
    if (tab?.call.id === call.id) {
        if (!isOpenCall(call)) return finish(call)
        set({ current: { call, phase: tab.phase } })
        // They answered my call: in.
        if (call.status === 'active' && tab.phase === 'calling') void joinMedia(call)
        return
    }
    if (!calledMe(call) || !before.incoming.some((one) => one.id === call.id)) return
    if (call.status === 'active') set({ notice: { kind: 'answered-elsewhere', call, at: Date.now() } })
    // The caller cancelled, or 45 seconds: missed. Busy (I answered another one) says nothing: I chose.
    else if (call.status === 'missed' && call.endReason !== 'busy')
        set({ notice: { kind: 'missed', call, at: Date.now() } })
}

/** What came of pressing Call or Answer. */
export type CallPress = 'ok' | 'mic-blocked' | 'cannot' | 'in-progress' | 'error'

/** The voice room this tab is in, left as the call starts (D-210; the question first comes with L9c). */
function outOfVoiceRoom(): void {
    if (useVoiceStore.getState().call) void leaveVoiceRoom()
}

/**
 * Calls the other one of a DM (Gọi thoại / Gọi video, "Gọi lại"): the
 * browser asked for the mic first (D-36: refused, no call); then ringing,
 * this tab's call page `calling`; answered at once when they were calling
 * me in it; busy at once as a result. CANNOT_MESSAGE_USER: `cannot` (one
 * line for every reason, D-23). `start` sends `POST /dms/{id}/calls` (a
 * hook's idempotent mutation: one key per press, a retry the same).
 */
export async function placeCall(
    video: boolean,
    start: () => Promise<Call>
): Promise<{ press: CallPress; error?: unknown }> {
    if (get().current) return { press: 'in-progress' }
    if ((await askMicrophone()) === 'blocked') return { press: 'mic-blocked' }
    let call: Call
    try {
        call = await start()
    } catch (error) {
        const type = getApiErrorType(error)
        if (type === 'CANNOT_MESSAGE_USER') return { press: 'cannot' }
        if (type === 'CALL_IN_PROGRESS') return { press: 'in-progress' }
        return { press: 'error', error }
    }
    // Another press won meanwhile (a double click answered twice): that one holds it.
    if (get().current && get().current?.call.id !== call.id) return { press: 'in-progress' }
    // Its own words may have come first (answered, over): the furthest of them counts.
    const latest = newestOf(seen, call)
    // A call that never rang (busy) leaves the voice room as it was.
    if (isOpenCall(latest)) outOfVoiceRoom()
    hold(latest, 'calling', video)
    callHeard(latest)
    return { press: 'ok' }
}

/**
 * Answers a call ringing to me (C-49 Nghe / Nghe có video): held by this tab
 * before the answer comes, so `call.updated` is this tab's; then the media
 * link. No longer ringing (cancelled just now): nothing, its word closes the card.
 */
export async function answerCall(call: Call, video: boolean): Promise<{ press: CallPress; error?: unknown }> {
    if (get().current) return { press: 'in-progress' }
    if ((await askMicrophone()) === 'blocked') return { press: 'mic-blocked' }
    hold(call, 'joining', video)
    let answered: Call
    try {
        answered = newestOf(seen, await acceptCall(call.id))
    } catch (error) {
        letGo()
        set({ current: null, mic: 'off', camera: 'off' })
        const type = getApiErrorType(error)
        return type === 'CANNOT_MESSAGE_USER' ? { press: 'cannot' } : { press: 'error', error }
    }
    if (answered.status === 'active') outOfVoiceRoom()
    callHeard(answered)
    if (answered.status === 'active' && get().current?.call.id === answered.id) void joinMedia(answered)
    return { press: 'ok' }
}

/**
 * Declines a call ringing to me (C-49 Từ chối): the card closes on the
 * answer, no Toast, no inbox item (SOCIAL-06); its other tabs on `call.ended`.
 */
export async function declineIncoming(call: Call): Promise<void> {
    callHeard(await declineCall(call.id))
}

/**
 * Into the call's media (`POST /calls/{id}/join`, LiveKit): the mic and the
 * camera as this tab holds them. No token (over meanwhile): its word ends it
 * here. A link that fails stays "Đang kết nối…": the backend makes the call
 * `failed` after 15 seconds (D-242).
 */
export async function joinMedia(call: Call): Promise<void> {
    attempt += 1
    const id = attempt
    const tab = get().current
    if (!tab || tab.call.id !== call.id) return
    set({ current: { call, phase: 'joining' } })
    try {
        const { media, call: now } = await joinCall(call.id)
        if (id !== attempt) return
        if (!media) return callHeard(now)
        callHeard(now)
        const livekit = await import('@/lib/livekit')
        const joined = await livekit.joinRoom(
            media.url,
            media.token,
            { mic: get().mic === 'on', camera: get().camera === 'on' },
            {
                onEnd: ended(id),
                onReconnecting: () => phaseIf(id, 'reconnecting'),
                onReconnected: () => phaseIf(id, 'connected'),
                onScreenEnded: () => undefined
            }
        )
        if (id !== attempt || get().current?.call.id !== call.id) {
            await joined.link.leave()
            return
        }
        link = joined.link
        set((state) => ({
            current: state.current && { ...state.current, phase: 'connected' },
            room: joined.link.room,
            mic: shown(joined.micState),
            camera: shown(joined.cameraState)
        }))
    } catch {
        // Not reached: the backend's 15 seconds end it as `failed` (D-120).
    }
}

function phaseIf(id: number, phase: CallPhase): void {
    if (id !== attempt) return
    set((state) => ({ current: state.current && { ...state.current, phase } }))
}

/**
 * The link ended without this tab: the backend closing the call's room (it
 * is over: its word follows) or another link of the account (`removed`,
 * `other-tab`); lost for good: reconnecting until the call's word, which
 * then says "Mất kết nối" (D-242, the 30 seconds of SOCIAL-05).
 */
function ended(id: number) {
    return (end: LinkEnd) => {
        if (id !== attempt) return
        link = null
        set({ room: null })
        if (end === 'lost') phaseIf(id, 'reconnecting')
    }
}

/**
 * Hang up (Hủy while ringing, Kết thúc once in): the link down at once on
 * this side (09 DM-EDGE `reconnecting`: End works at once here), then the
 * answer ends it as the other side sees it. Failed (no network): over here
 * all the same; the backend's 30 seconds end it there.
 */
export async function hangUp(): Promise<void> {
    const tab = get().current
    if (!tab) return
    hungUp = tab.call.id
    attempt += 1
    const before = link
    link = null
    set({ room: null })
    void before?.leave()
    try {
        callHeard(await endCall(tab.call.id))
    } catch {
        letGo()
        hungUp = null
        set({ current: null, mic: 'off', camera: 'off' })
    }
}

/** "Đóng" on a result: the DM again at once. */
export function dismissResult(): void {
    clearTimeout(resultTimer)
    set({ result: null })
}

/** The call's Mic (C-21): in the call it switches the sound sent; before, what it will send. */
export async function switchCallMic(on: boolean): Promise<void> {
    if (!link) return void set({ mic: on ? 'on' : 'off' })
    set({ mic: shown(await link.setMic(on)) })
}

/** The call's Camera (C-21, SOCIAL-05: at any time); before the link, what it will send. */
export async function switchCallCamera(on: boolean): Promise<void> {
    if (!link) return void set({ camera: on ? 'on' : 'off' })
    set({ camera: shown(await link.setCamera(on)) })
}

/** Signing out in a call (L4-g): ended first, with the token still in hand, and out of LiveKit. */
function signOutEnd(): void {
    const tab = get().current
    if (tab) void endCall(tab.call.id, true).catch(() => undefined)
    letGo()
    set({ current: null, room: null, mic: 'off', camera: 'off', result: null })
}

/**
 * A reload of the tab that held a call (D-255): ringing out still, the
 * call page `calling` again; answered, back into it with the mic on and
 * the camera off (as a voice room, D-51; 09 › Tương tác). Gone: nothing.
 */
export function rejoinCall(callId: string, my: MyCall): void {
    const call = my.current
    if (get().current || !call || call.id !== callId) return
    if (call.status === 'ringing' && !calledMe(call)) return hold(call, 'calling', call.video)
    if (call.status !== 'active') return
    hold(call, 'joining', false)
    void joinMedia(call)
}

/** How many calls this tab has held so far: a read of my calls notes it as it begins (`callsReadAgain`). */
export function holdsSoFar(): number {
    return holds
}

/**
 * `GET /me/call` read again after the socket came back (`ready`): a call of
 * this tab no longer there ended while the words could not come; let go,
 * with no result (what came of it is not known). A read begun before this
 * tab held its call (`since`) says nothing of it.
 */
export function callsReadAgain(my: MyCall, since: number): void {
    const tab = get().current
    if (!tab || holds !== since || my.current?.id === tab.call.id) return
    seen.set(tab.call.id, { ...tab.call, status: 'ended' })
    letGo()
    set({ current: null, room: null, mic: 'off', camera: 'off' })
}

/** For tests: back to no call. */
export function resetCallSession(): void {
    attempt += 1
    link = null
    hungUp = null
    holds = 0
    seen.clear()
    clearTimeout(resultTimer)
    stopSignOut?.()
    stopSignOut = null
    cache = null
    set({ current: null, mic: 'off', camera: 'off', room: null, result: null, notice: null })
}
