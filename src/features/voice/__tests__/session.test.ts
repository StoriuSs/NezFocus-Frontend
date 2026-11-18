import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiError } from '@/test/helpers'
import type { LinkEvents, MicState } from '@/lib/livekit'
import type { VoiceToken } from '../types'

const voiceApi = {
    requestVoiceToken: vi.fn<(channelId: string) => Promise<VoiceToken>>(),
    leaveVoiceRoom: vi.fn<(onLeave?: boolean) => Promise<void>>(async () => undefined)
}
vi.mock('../api/voice.api', () => voiceApi)

/** A link as `@/lib/livekit` gives it, with the events it was given. */
const links: { leave: ReturnType<typeof vi.fn>; setMic: ReturnType<typeof vi.fn>; events: LinkEvents }[] = []
const livekit = {
    joinRoom: vi.fn(async (_url: string, _token: string, mic: boolean, events: LinkEvents) => {
        const link = {
            room: { name: 'room' },
            leave: vi.fn(async () => undefined),
            setMic: vi.fn(async (on: boolean) => (on ? 'on' : 'off'))
        }
        links.push({ ...link, events })
        return { link, micState: (mic ? 'on' : 'off') as MicState }
    })
}
vi.mock('@/lib/livekit', () => livekit)

const sendRealtimeSignal = vi.fn()
vi.mock('@/features/realtime', () => ({ sendRealtimeSignal }))

const { joinRoom, leaveRoom, switchMic, micAllowedAgain, resetSession, tellOwnState, JOIN_MS } =
    await import('../lib/session')
const { useVoiceStore } = await import('../voice.store')
const { flushBeforeSignOut } = await import('@/lib/before-sign-out')

const LOUNGE = { serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' }
const QUIET = { serverId: 'ot', channelId: 'quiet', name: 'Phòng học im lặng' }
const state = () => useVoiceStore.getState()
const kept = () => sessionStorage.getItem('voice.room')

describe("a tab's time in a voice room (REQ-VC-01 → VC-03)", () => {
    beforeEach(() => {
        resetSession()
        links.length = 0
        sessionStorage.clear()
        voiceApi.requestVoiceToken.mockReset()
        voiceApi.requestVoiceToken.mockResolvedValue({ token: 'token', url: 'ws://lk' })
        voiceApi.leaveVoiceRoom.mockClear()
        livekit.joinRoom.mockClear()
        sendRealtimeSignal.mockClear()
    })
    afterEach(() => vi.useRealTimers())

    it('joins with a token for the room, keeps it for a reload, and says its mic and camera (D-206)', async () => {
        const joining = joinRoom(LOUNGE)
        expect(state().call).toMatchObject({ channelId: 'thao-luan', phase: 'joining' })
        expect(await joining).toBe(true)

        expect(voiceApi.requestVoiceToken).toHaveBeenCalledWith('thao-luan')
        expect(livekit.joinRoom).toHaveBeenCalledWith('ws://lk', 'token', false, expect.any(Object))
        expect(state().call).toMatchObject({ channelId: 'thao-luan', phase: 'connected' })
        expect(state().room).not.toBeNull()
        expect(JSON.parse(kept() ?? '')).toEqual({ serverId: 'ot', channelId: 'thao-luan' })
        expect(sendRealtimeSignal).toHaveBeenCalledWith('voice.self_state', { mic: false, camera: false })
    })

    it('joins with the mic the preview page turned on, unless told to keep it off (a reload)', async () => {
        useVoiceStore.setState({ mic: 'on' })
        await joinRoom(LOUNGE)
        expect(livekit.joinRoom).toHaveBeenLastCalledWith('ws://lk', 'token', true, expect.any(Object))
        expect(state().mic).toBe('on')

        await joinRoom(QUIET, { micOff: true })
        expect(livekit.joinRoom).toHaveBeenLastCalledWith('ws://lk', 'token', false, expect.any(Object))
        expect(state().mic).toBe('off')
    })

    it('leaves the room it was in before joining another (VC-02)', async () => {
        await joinRoom(LOUNGE)
        await joinRoom(QUIET)
        expect(links[0]?.leave).toHaveBeenCalled()
        expect(state().call?.channelId).toBe('quiet')
        // The first room's link ending now is not this tab's news.
        links[0]?.events.onEnd('removed')
        expect(state().call?.channelId).toBe('quiet')
    })

    it('a failed switch leaves one in no room: a reload joins neither, signing out asks nothing', async () => {
        await joinRoom(LOUNGE)
        voiceApi.requestVoiceToken.mockRejectedValueOnce(apiError(503, 'SERVICE_UNAVAILABLE_ERROR'))
        expect(await joinRoom(QUIET)).toBe(false)
        expect(links[0]?.leave).toHaveBeenCalled()
        expect(kept()).toBeNull()
        flushBeforeSignOut()
        expect(voiceApi.leaveVoiceRoom).not.toHaveBeenCalled()
    })

    it('says why a join failed: refused by the API, or no answer (join-error)', async () => {
        voiceApi.requestVoiceToken.mockRejectedValueOnce(apiError(403, 'MEMBER_TIMED_OUT'))
        expect(await joinRoom(LOUNGE)).toBe(false)
        expect(state()).toMatchObject({ call: null, problem: { channelId: 'thao-luan', kind: 'refused' } })

        voiceApi.requestVoiceToken.mockRejectedValueOnce(apiError(503, 'SERVICE_UNAVAILABLE_ERROR'))
        await joinRoom(LOUNGE)
        expect(state().problem).toEqual({ channelId: 'thao-luan', kind: 'network' })

        await joinRoom(LOUNGE)
        expect(state().problem).toBeNull()
    })

    it('gives up after 10 seconds, and leaves at once a room that answers later', async () => {
        vi.useFakeTimers()
        let answer!: (value: Awaited<ReturnType<typeof livekit.joinRoom>>) => void
        livekit.joinRoom.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
        const joining = joinRoom(LOUNGE)
        await vi.advanceTimersByTimeAsync(JOIN_MS)
        expect(await joining).toBe(false)
        expect(state()).toMatchObject({ call: null, problem: { kind: 'network' } })

        const late = { room: {}, leave: vi.fn(async () => undefined), setMic: vi.fn() }
        answer({ link: late as never, micState: 'off' })
        await vi.advanceTimersByTimeAsync(0)
        expect(late.leave).toHaveBeenCalled()
    })

    it('leaves a room joined after the person pressed Leave meanwhile', async () => {
        let answer!: (value: Awaited<ReturnType<typeof livekit.joinRoom>>) => void
        livekit.joinRoom.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
        const joining = joinRoom(LOUNGE)
        await vi.waitFor(() => expect(livekit.joinRoom).toHaveBeenCalled())
        await leaveRoom()
        const late = { room: {}, leave: vi.fn(async () => undefined), setMic: vi.fn() }
        answer({ link: late as never, micState: 'off' })
        expect(await joining).toBe(false)
        expect(late.leave).toHaveBeenCalled()
        expect(state().call).toBeNull()
    })

    it('leaves at once on the page, then asks the API to take one off the list', async () => {
        await joinRoom(LOUNGE)
        useVoiceStore.setState({ mic: 'on' })
        await leaveRoom()
        expect(links[0]?.leave).toHaveBeenCalled()
        expect(voiceApi.leaveVoiceRoom).toHaveBeenCalledWith()
        expect(state()).toMatchObject({ call: null, room: null, mic: 'off' })
        expect(kept()).toBeNull()
    })

    it('a failed ask to leave changes nothing for the person', async () => {
        await joinRoom(LOUNGE)
        voiceApi.leaveVoiceRoom.mockRejectedValueOnce(apiError(503, 'SERVICE_UNAVAILABLE_ERROR'))
        await expect(leaveRoom()).resolves.toBeUndefined()
        expect(state().call).toBeNull()
    })

    it('ends when LiveKit ends the link: elsewhere in this room, or put out (07 câu L3-b)', async () => {
        await joinRoom(LOUNGE)
        links[0]?.events.onEnd('other-tab')
        expect(state()).toMatchObject({ call: null, room: null, removed: null })
        expect(kept()).toBeNull()

        vi.spyOn(Date, 'now').mockReturnValue(1000)
        await joinRoom(QUIET)
        links[1]?.events.onEnd('removed')
        expect(state()).toMatchObject({ call: null, removed: { channelId: 'quiet', at: 1000 } })
        vi.restoreAllMocks()
    })

    it('keeps the room for the reload when the page itself ends the link as it goes (D-51)', async () => {
        await joinRoom(LOUNGE)
        links[0]?.events.onEnd('left')
        expect(state().call).toBeNull()
        expect(JSON.parse(kept() ?? '')).toEqual({ serverId: 'ot', channelId: 'thao-luan' })
    })

    it('shows LiveKit trying again, and says its state again once back (D-206)', async () => {
        await joinRoom(LOUNGE)
        sendRealtimeSignal.mockClear()
        links[0]?.events.onReconnecting()
        expect(state().call?.phase).toBe('reconnecting')
        tellOwnState()
        expect(sendRealtimeSignal).not.toHaveBeenCalled()
        links[0]?.events.onReconnected()
        expect(state().call?.phase).toBe('connected')
        expect(sendRealtimeSignal).toHaveBeenCalledWith('voice.self_state', { mic: false, camera: false })
    })

    it('switches the mic in the room, and says so', async () => {
        await joinRoom(LOUNGE)
        await switchMic(true)
        expect(links[0]?.setMic).toHaveBeenCalledWith(true)
        expect(state().mic).toBe('on')
        expect(sendRealtimeSignal).toHaveBeenLastCalledWith('voice.self_state', { mic: true, camera: false })
    })

    it('before joining, only asks the browser for the mic (D-36); refused, it is blocked until allowed again', async () => {
        const stop = vi.fn()
        const getUserMedia = vi.fn().mockResolvedValueOnce({ getTracks: () => [{ stop }] })
        Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
        await switchMic(true)
        expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
        expect(stop).toHaveBeenCalled()
        expect(state().mic).toBe('on')
        expect(sendRealtimeSignal).not.toHaveBeenCalled()

        await switchMic(false)
        expect(state().mic).toBe('off')

        getUserMedia.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'))
        await switchMic(true)
        expect(state().mic).toBe('blocked')
        micAllowedAgain()
        expect(state().mic).toBe('off')

        getUserMedia.mockRejectedValueOnce(new DOMException('none', 'NotFoundError'))
        await switchMic(true)
        expect(state().mic).toBe('off')
    })

    it('leaves the room as the account signs out, with the token still in hand', async () => {
        await joinRoom(LOUNGE)
        flushBeforeSignOut()
        expect(links[0]?.leave).toHaveBeenCalled()
        expect(voiceApi.leaveVoiceRoom).toHaveBeenCalledWith(true)
        expect(state().call).toBeNull()

        voiceApi.leaveVoiceRoom.mockClear()
        flushBeforeSignOut()
        expect(voiceApi.leaveVoiceRoom).not.toHaveBeenCalled()
    })
})
