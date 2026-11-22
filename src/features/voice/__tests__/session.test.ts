import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiError } from '@/test/helpers'
import type { DeviceState, JoinDevices, LinkEvents } from '@/lib/livekit'
import type { VoiceToken } from '../types'

const voiceApi = {
    requestVoiceToken: vi.fn<(channelId: string) => Promise<VoiceToken>>(),
    leaveVoiceRoom: vi.fn<(onLeave?: boolean) => Promise<void>>(async () => undefined)
}
vi.mock('../api/voice.api', () => voiceApi)

/** A link as `@/lib/livekit` gives it, with the events it was given. */
const links: {
    leave: ReturnType<typeof vi.fn>
    setMic: ReturnType<typeof vi.fn>
    setCamera: ReturnType<typeof vi.fn>
    setScreen: ReturnType<typeof vi.fn>
    events: LinkEvents
}[] = []
const livekit = {
    joinRoom: vi.fn(async (_url: string, _token: string, devices: JoinDevices, events: LinkEvents) => {
        const link = {
            room: { name: 'room' },
            leave: vi.fn(async () => undefined),
            setMic: vi.fn(async (on: boolean) => (on ? 'on' : 'off')),
            setCamera: vi.fn(async (on: boolean) => (on ? 'on' : 'off')),
            setScreen: vi.fn(async (on: boolean) => (on ? 'on' : 'off'))
        }
        links.push({ ...link, events })
        const said = (on: boolean): DeviceState => (on ? 'on' : 'off')
        return { link, micState: said(devices.mic), cameraState: said(devices.camera) }
    })
}
vi.mock('@/lib/livekit', () => livekit)

const sendRealtimeSignal = vi.fn()
vi.mock('@/features/realtime', () => ({ sendRealtimeSignal }))

const {
    joinRoom,
    leaveRoom,
    switchMic,
    switchCamera,
    stopPreviewCamera,
    deviceAllowedAgain,
    resetSession,
    tellOwnState,
    micTakenAway,
    switchScreen,
    screenTakenAway,
    JOIN_MS
} = await import('../lib/session')
const { useVoiceStore } = await import('../voice.store')
const { flushBeforeSignOut } = await import('@/lib/before-sign-out')

const LOUNGE = { serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' }
const QUIET = { serverId: 'ot', channelId: 'quiet', name: 'Phòng học im lặng' }
const state = () => useVoiceStore.getState()
const kept = () => sessionStorage.getItem('voice.room')
const OFF = { mic: false, camera: false }

/** The browser's camera before joining: a stream of one track, stopped when the camera goes off. */
function aCamera() {
    const stop = vi.fn()
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
    return { stream, stop, getUserMedia }
}

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
        expect(livekit.joinRoom).toHaveBeenCalledWith('ws://lk', 'token', OFF, expect.any(Object))
        expect(state().call).toMatchObject({ channelId: 'thao-luan', phase: 'connected' })
        expect(state().room).not.toBeNull()
        expect(JSON.parse(kept() ?? '')).toEqual({ serverId: 'ot', channelId: 'thao-luan' })
        expect(sendRealtimeSignal).toHaveBeenCalledWith('voice.self_state', { mic: false, camera: false })
    })

    it('joins with the mic and camera the preview page turned on, unless told to keep them off (a reload)', async () => {
        useVoiceStore.setState({ mic: 'on', camera: 'on' })
        await joinRoom(LOUNGE)
        expect(livekit.joinRoom).toHaveBeenLastCalledWith(
            'ws://lk',
            'token',
            { mic: true, camera: true },
            expect.any(Object)
        )
        expect(state()).toMatchObject({ mic: 'on', camera: 'on' })
        expect(sendRealtimeSignal).toHaveBeenLastCalledWith('voice.self_state', { mic: true, camera: true })

        await joinRoom(QUIET, { devicesOff: true })
        expect(livekit.joinRoom).toHaveBeenLastCalledWith('ws://lk', 'token', OFF, expect.any(Object))
        expect(state()).toMatchObject({ mic: 'off', camera: 'off' })
    })

    it("before joining, opens the camera for one's own tile (D-53); refused, it is blocked until allowed again", async () => {
        const camera = aCamera()
        await switchCamera(true)
        expect(camera.getUserMedia).toHaveBeenCalledWith({ video: true })
        expect(state()).toMatchObject({ camera: 'on', cameraPreview: camera.stream })
        expect(sendRealtimeSignal).not.toHaveBeenCalled()

        await switchCamera(false)
        expect(camera.stop).toHaveBeenCalled()
        expect(state()).toMatchObject({ camera: 'off', cameraPreview: null })

        camera.getUserMedia.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'))
        await switchCamera(true)
        expect(state()).toMatchObject({ camera: 'blocked', cameraPreview: null })
        deviceAllowedAgain('camera')
        expect(state().camera).toBe('off')

        camera.getUserMedia.mockRejectedValueOnce(new DOMException('none', 'NotFoundError'))
        await switchCamera(true)
        expect(state().camera).toBe('off')
    })

    it('lets go of a picture the browser gives after the camera was pressed off, or a join began', async () => {
        const camera = aCamera()
        let answer!: (stream: MediaStream) => void
        camera.getUserMedia.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
        const asking = switchCamera(true)
        await switchCamera(false)
        answer(camera.stream)
        await asking
        expect(camera.stop).toHaveBeenCalled()
        expect(state()).toMatchObject({ camera: 'off', cameraPreview: null })

        camera.stop.mockClear()
        camera.getUserMedia.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
        const again = switchCamera(true)
        const joining = joinRoom(LOUNGE)
        answer(camera.stream)
        await again
        await joining
        expect(camera.stop).toHaveBeenCalled()
        expect(state().cameraPreview).toBeNull()
    })

    it('hands the camera to LiveKit once in the room: the preview stops', async () => {
        const camera = aCamera()
        await switchCamera(true)
        await joinRoom(LOUNGE)
        expect(camera.stop).toHaveBeenCalled()
        expect(state()).toMatchObject({ camera: 'on', cameraPreview: null })

        await switchCamera(false)
        expect(links[0]?.setCamera).toHaveBeenCalledWith(false)
        expect(state().camera).toBe('off')
        expect(sendRealtimeSignal).toHaveBeenLastCalledWith('voice.self_state', { mic: false, camera: false })
    })

    it('turns off a camera the browser allows only after the preview page went', async () => {
        const camera = aCamera()
        let answer!: (stream: MediaStream) => void
        camera.getUserMedia.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
        const asking = switchCamera(true)
        stopPreviewCamera()
        answer(camera.stream)
        await asking
        expect(camera.stop).toHaveBeenCalled()
        expect(state()).toMatchObject({ camera: 'off', cameraPreview: null })
    })

    it('a join that fails after its preview page went leaves the camera off; on the page, as it was', async () => {
        const camera = aCamera()
        await switchCamera(true)
        voiceApi.requestVoiceToken.mockRejectedValueOnce(apiError(503, 'SERVICE_UNAVAILABLE_ERROR'))
        await joinRoom(LOUNGE)
        expect(state()).toMatchObject({ camera: 'on', cameraPreview: camera.stream })

        let refuse!: (error: unknown) => void
        voiceApi.requestVoiceToken.mockImplementationOnce(() => new Promise((_, reject) => (refuse = reject)))
        const joining = joinRoom(LOUNGE)
        stopPreviewCamera()
        expect(camera.stop).toHaveBeenCalled()
        refuse(apiError(503, 'SERVICE_UNAVAILABLE_ERROR'))
        await joining
        expect(state()).toMatchObject({ camera: 'off', cameraPreview: null })
    })

    it('keeps what was pressed while joining: the mic and camera as last set (07 joining)', async () => {
        aCamera()
        await switchCamera(true)
        let answer!: (token: VoiceToken) => void
        voiceApi.requestVoiceToken.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
        const joining = joinRoom(LOUNGE)
        await switchCamera(false)
        answer({ token: 'token', url: 'ws://lk' })
        await vi.waitFor(() => expect(livekit.joinRoom).toHaveBeenCalled())
        await joining
        expect(state()).toMatchObject({ camera: 'off', mic: 'off' })

        let again!: (token: VoiceToken) => void
        voiceApi.requestVoiceToken.mockImplementationOnce(() => new Promise((resolve) => (again = resolve)))
        livekit.joinRoom.mockClear()
        const second = joinRoom(QUIET)
        await vi.waitFor(() => expect(voiceApi.requestVoiceToken).toHaveBeenCalledTimes(2))
        livekit.joinRoom.mockImplementationOnce(async (_url, _token, _devices, events) => {
            const link = {
                room: { name: 'room' },
                leave: vi.fn(async () => undefined),
                setMic: vi.fn(async (on: boolean) => (on ? 'on' : 'off')),
                setCamera: vi.fn(async (on: boolean) => (on ? 'on' : 'off')),
                setScreen: vi.fn(async (on: boolean) => (on ? 'on' : 'off'))
            }
            links.push({ ...link, events })
            // The mic pressed on while LiveKit was joining with it off.
            useVoiceStore.setState({ mic: 'on' })
            return { link, micState: 'off' as DeviceState, cameraState: 'off' as DeviceState }
        })
        again({ token: 'token', url: 'ws://lk' })
        await second
        expect(links.at(-1)?.setMic).toHaveBeenCalledWith(true)
        expect(state().mic).toBe('on')
    })

    it('turns the camera off when the preview page goes without joining (07 câu L3b-c), not once joined', async () => {
        const camera = aCamera()
        await switchCamera(true)
        stopPreviewCamera()
        expect(camera.stop).toHaveBeenCalled()
        expect(state()).toMatchObject({ camera: 'off', cameraPreview: null })

        await switchCamera(true)
        await joinRoom(LOUNGE)
        stopPreviewCamera()
        expect(state().camera).toBe('on')

        await leaveRoom()
        useVoiceStore.setState({ camera: 'blocked' })
        stopPreviewCamera()
        expect(state().camera).toBe('blocked')
    })

    it('leaves the room it was in before joining another (VC-02)', async () => {
        await joinRoom(LOUNGE)
        voiceApi.requestVoiceToken.mockClear()
        await joinRoom(QUIET)
        expect(links[0]?.leave).toHaveBeenCalled()
        // Asked like Rời: the old room's Host hands over now, not 3 minutes on; asked before the new token.
        expect(voiceApi.leaveVoiceRoom).toHaveBeenCalledWith()
        expect(voiceApi.leaveVoiceRoom.mock.invocationCallOrder[0]).toBeLessThan(
            voiceApi.requestVoiceToken.mock.invocationCallOrder[0] ?? 0
        )
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
        // The switch asked to leave the first room; signing out after it asks nothing more.
        voiceApi.leaveVoiceRoom.mockClear()
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

    it('switches on when asking to leave the old room does not answer, 3 seconds on; not once Rời was pressed', async () => {
        await joinRoom(LOUNGE)
        vi.useFakeTimers()
        voiceApi.requestVoiceToken.mockClear()
        voiceApi.leaveVoiceRoom.mockImplementation(() => new Promise(() => undefined))
        const switching = joinRoom(QUIET)
        await vi.advanceTimersByTimeAsync(2900)
        expect(voiceApi.requestVoiceToken).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(100)
        expect(voiceApi.requestVoiceToken).toHaveBeenCalledWith('quiet')
        expect(await switching).toBe(true)

        voiceApi.requestVoiceToken.mockClear()
        const again = joinRoom(LOUNGE)
        void leaveRoom()
        await vi.advanceTimersByTimeAsync(3000)
        expect(await again).toBe(false)
        expect(voiceApi.requestVoiceToken).not.toHaveBeenCalled()
        voiceApi.leaveVoiceRoom.mockImplementation(async () => undefined)
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
        answer({ link: late as never, micState: 'off', cameraState: 'off' })
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
        answer({ link: late as never, micState: 'off', cameraState: 'off' })
        expect(await joining).toBe(false)
        expect(late.leave).toHaveBeenCalled()
        expect(state().call).toBeNull()
    })

    it('leaves at once on the page, then asks the API to take one off the list', async () => {
        await joinRoom(LOUNGE)
        useVoiceStore.setState({ mic: 'on', camera: 'on' })
        await leaveRoom()
        expect(links[0]?.leave).toHaveBeenCalled()
        expect(voiceApi.leaveVoiceRoom).toHaveBeenCalledWith()
        expect(state()).toMatchObject({ call: null, room: null, mic: 'off', camera: 'off' })
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
        useVoiceStore.setState({ camera: 'on' })
        links[0]?.events.onEnd('other-tab')
        expect(state()).toMatchObject({ call: null, room: null, removed: null, camera: 'off' })
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
        deviceAllowedAgain('mic')
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

    it("a moderator's mute takes the mic: off in LiveKit and on the page, only in that room (D-207)", async () => {
        await joinRoom(LOUNGE)
        await switchMic(true)
        expect(state().mic).toBe('on')

        await micTakenAway('quiet')
        expect(state().mic).toBe('on')

        await micTakenAway('thao-luan')
        expect(links[0]?.setMic).toHaveBeenLastCalledWith(false)
        expect(state().mic).toBe('off')
        expect(sendRealtimeSignal).toHaveBeenLastCalledWith('voice.self_state', { mic: false, camera: false })

        links[0]?.setMic.mockClear()
        await micTakenAway('thao-luan')
        expect(links[0]?.setMic).not.toHaveBeenCalled()
    })

    it('shares a screen in the room; a cancelled picker leaves it off, without a word (S-ROOM-07)', async () => {
        await switchScreen(true)
        expect(state().screen).toBe('off')

        await joinRoom(LOUNGE)
        const link = links[0]!
        await switchScreen(true)
        expect(link.setScreen).toHaveBeenLastCalledWith(true)
        expect(state().screen).toBe('on')
        await switchScreen(false)
        expect(state().screen).toBe('off')

        link.setScreen.mockResolvedValueOnce('off')
        await switchScreen(true)
        expect(state().screen).toBe('off')
        expect(state().screenRefused).toBeNull()
    })

    it('a screen chosen after leaving, or after pressing again, is not shared', async () => {
        await joinRoom(LOUNGE)
        const link = links[0]!
        let choose: (state: 'on' | 'off') => void = () => undefined
        link.setScreen.mockImplementationOnce(() => new Promise((resolve) => (choose = resolve)))
        const asking = switchScreen(true)
        await leaveRoom()
        choose('on')
        await asking
        expect(link.setScreen).toHaveBeenLastCalledWith(false)
        expect(state().screen).toBe('off')

        await joinRoom(LOUNGE)
        const again = links[1]!
        again.setScreen.mockImplementationOnce(() => new Promise((resolve) => (choose = resolve)))
        const first = switchScreen(true)
        await switchScreen(false)
        choose('on')
        await first
        expect(again.setScreen).toHaveBeenLastCalledWith(false)
        expect(state().screen).toBe('off')
    })

    it('stops sharing on leaving, being put out, or joining elsewhere (D-101: a reload shares nothing)', async () => {
        await joinRoom(LOUNGE)
        await switchScreen(true)
        await leaveRoom()
        expect(state().screen).toBe('off')

        await joinRoom(LOUNGE)
        await switchScreen(true)
        links[1]!.events.onEnd('removed')
        expect(state().screen).toBe('off')

        await joinRoom(LOUNGE)
        await switchScreen(true)
        await joinRoom(QUIET)
        expect(state().screen).toBe('off')
    })

    it('another screen came first: this one stops for good, only in that room (D-101)', async () => {
        await joinRoom(LOUNGE)
        const link = links[0]!
        await switchScreen(true)
        await screenTakenAway('quiet')
        expect(state().screen).toBe('on')
        await screenTakenAway('thao-luan')
        expect(state().screen).toBe('off')
        expect(link.setScreen).toHaveBeenLastCalledWith(false)
    })

    it('the screen stopping by itself turns Share off; VIDEO lost says so (07 ROOM-EDGE)', async () => {
        await joinRoom(LOUNGE)
        const link = links[0]!
        await switchScreen(true)
        link.events.onScreenEnded('stopped')
        expect(state().screen).toBe('off')
        link.events.onScreenEnded('muted')
        expect(state().screenRefused).toBeNull()

        await switchScreen(true)
        link.events.onScreenEnded('refused')
        expect(state().screen).toBe('off')
        // Kept for useVoiceSession's Toast.
        expect(state().screenRefused).toEqual(expect.any(Number))

        // A link left behind says nothing.
        useVoiceStore.setState({ screenRefused: null })
        await joinRoom(QUIET)
        await switchScreen(true)
        link.events.onScreenEnded('refused')
        expect(state().screen).toBe('on')
        expect(state().screenRefused).toBeNull()
    })

    it('Share pressed again while the picker is open does nothing (Firefox lets the page be pressed)', async () => {
        await joinRoom(LOUNGE)
        const link = links[0]!
        let choose: (state: 'on' | 'off') => void = () => undefined
        link.setScreen.mockImplementationOnce(() => new Promise((resolve) => (choose = resolve)))
        const first = switchScreen(true)
        await switchScreen(true)
        expect(link.setScreen).toHaveBeenCalledTimes(1)
        choose('on')
        await first
        expect(state().screen).toBe('on')
        expect(link.setScreen).toHaveBeenCalledTimes(1)
        // The picker answered: Share works again.
        await switchScreen(false)
        await switchScreen(true)
        expect(link.setScreen).toHaveBeenLastCalledWith(true)
    })
})
