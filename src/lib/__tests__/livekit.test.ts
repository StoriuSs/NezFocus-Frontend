import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** A stand-in for livekit-client's Room: handlers kept by event, fired by the test. */
class FakeRoom {
    static last: FakeRoom
    handlers = new Map<string, ((...args: unknown[]) => void)[]>()
    canPlaybackAudio = true
    connect = vi.fn(async () => undefined)
    disconnect = vi.fn(async () => {
        this.fire('disconnected', 1)
    })
    startAudio = vi.fn(async () => undefined)
    localParticipant = { setMicrophoneEnabled: vi.fn(async (_on: boolean) => undefined) }
    constructor(public options: unknown) {
        FakeRoom.last = this
    }
    on(event: string, handler: (...args: unknown[]) => void) {
        this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
        return this
    }
    fire(event: string, ...args: unknown[]) {
        for (const handler of this.handlers.get(event) ?? []) handler(...args)
    }
}

vi.mock('livekit-client', () => ({
    Room: FakeRoom,
    RoomEvent: {
        TrackSubscribed: 'trackSubscribed',
        TrackUnsubscribed: 'trackUnsubscribed',
        AudioPlaybackStatusChanged: 'audioPlaybackChanged',
        Reconnecting: 'reconnecting',
        Reconnected: 'reconnected',
        Disconnected: 'disconnected'
    },
    Track: { Kind: { Audio: 'audio', Video: 'video' } },
    DisconnectReason: { CLIENT_INITIATED: 1, DUPLICATE_IDENTITY: 2, PARTICIPANT_REMOVED: 4, ROOM_DELETED: 5 },
    MediaDeviceFailure: {
        PermissionDenied: 'PermissionDenied',
        getFailure: (error: unknown) =>
            error instanceof DOMException && error.name === 'NotAllowedError' ? 'PermissionDenied' : 'Other'
    }
}))

const { joinRoom, micStateOf } = await import('../livekit')

const events = () => ({ onEnd: vi.fn(), onReconnecting: vi.fn(), onReconnected: vi.fn() })
const refused = () => new DOMException('no', 'NotAllowedError')

/** A remote sound track: `attach` makes its <audio>. */
const soundTrack = (sid: string) => {
    const player = document.createElement('audio')
    return { kind: 'audio', sid, attach: vi.fn(() => player), detach: vi.fn(), player }
}

describe('the link to a LiveKit room (ARCHITECTURE §4)', () => {
    beforeEach(() => document.body.replaceChildren())
    afterEach(() => vi.restoreAllMocks())

    it('joins with the address and token, the mic on only when asked', async () => {
        const muted = await joinRoom('ws://lk', 'token-1', false, events())
        expect(FakeRoom.last.connect).toHaveBeenCalledWith('ws://lk', 'token-1')
        expect(FakeRoom.last.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled()
        expect(muted.micState).toBe('off')

        const speaking = await joinRoom('ws://lk', 'token-2', true, events())
        expect(FakeRoom.last.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true)
        expect(speaking.micState).toBe('on')
        expect(speaking.link.room).toBe(FakeRoom.last)
    })

    it('still joins when the browser refuses the mic: it is blocked (S-MOD-04, VC-03)', async () => {
        const room = joinRoom('ws://lk', 'token', true, events())
        FakeRoom.last.localParticipant.setMicrophoneEnabled.mockRejectedValueOnce(refused())
        expect((await room).micState).toBe('blocked')
    })

    it('switches the mic, and says what the browser answered', async () => {
        const { link } = await joinRoom('ws://lk', 'token', false, events())
        expect(await link.setMic(true)).toBe('on')
        expect(await link.setMic(false)).toBe('off')
        FakeRoom.last.localParticipant.setMicrophoneEnabled.mockRejectedValueOnce(refused())
        expect(await link.setMic(true)).toBe('blocked')
        FakeRoom.last.localParticipant.setMicrophoneEnabled.mockRejectedValueOnce(new Error('no device'))
        expect(await link.setMic(true)).toBe('off')
        expect(micStateOf(refused())).toBe('blocked')
    })

    it("plays others' sound whatever the page, and stops it when the track goes", async () => {
        await joinRoom('ws://lk', 'token', false, events())
        const track = soundTrack('TR_1')
        FakeRoom.last.fire('trackSubscribed', track)
        expect(document.body.contains(track.player)).toBe(true)
        expect(track.player.hidden).toBe(true)
        FakeRoom.last.fire('trackSubscribed', { kind: 'video', sid: 'TR_2', attach: vi.fn() })
        expect(document.body.children).toHaveLength(1)

        FakeRoom.last.fire('trackUnsubscribed', track)
        expect(track.detach).toHaveBeenCalledWith(track.player)
        expect(document.body.contains(track.player)).toBe(false)
        FakeRoom.last.fire('trackUnsubscribed', soundTrack('TR_unknown'))
    })

    it('plays sound at the next touch when the browser held it back (a reload joins with no click)', async () => {
        await joinRoom('ws://lk', 'token', false, events())
        FakeRoom.last.canPlaybackAudio = false
        FakeRoom.last.fire('audioPlaybackChanged')
        document.dispatchEvent(new Event('pointerdown'))
        expect(FakeRoom.last.startAudio).toHaveBeenCalledTimes(1)

        FakeRoom.last.canPlaybackAudio = true
        FakeRoom.last.fire('audioPlaybackChanged')
        document.dispatchEvent(new Event('keydown'))
        expect(FakeRoom.last.startAudio).toHaveBeenCalledTimes(1)
    })

    it('says how the link ended, in the app words; not after leaving here', async () => {
        const told = events()
        await joinRoom('ws://lk', 'token', false, told)
        FakeRoom.last.fire('reconnecting')
        FakeRoom.last.fire('reconnected')
        expect(told.onReconnecting).toHaveBeenCalled()
        expect(told.onReconnected).toHaveBeenCalled()
        const track = soundTrack('TR_1')
        FakeRoom.last.fire('trackSubscribed', track)
        FakeRoom.last.fire('disconnected', 2)
        expect(told.onEnd).toHaveBeenLastCalledWith('other-tab')
        expect(document.body.contains(track.player)).toBe(false)
        FakeRoom.last.fire('disconnected', 4)
        expect(told.onEnd).toHaveBeenLastCalledWith('removed')
        FakeRoom.last.fire('disconnected', 5)
        expect(told.onEnd).toHaveBeenLastCalledWith('removed')
        FakeRoom.last.fire('disconnected')
        expect(told.onEnd).toHaveBeenLastCalledWith('lost')

        const left = events()
        const { link } = await joinRoom('ws://lk', 'token', false, left)
        await link.leave()
        expect(FakeRoom.last.disconnect).toHaveBeenCalled()
        expect(left.onEnd).not.toHaveBeenCalled()
    })
})
