import {
    DisconnectReason,
    MediaDeviceFailure,
    Room,
    RoomEvent,
    Track,
    type Participant,
    type RemoteTrack,
    type TrackPublication
} from 'livekit-client'

/**
 * The tab's link to a LiveKit room (ARCHITECTURE §4): media goes straight
 * between the browser and LiveKit, never through the API. Loaded with
 * `import()` when a room is joined, never with the first screen
 * (CONSTRAINTS.md, performance), as `socket.ts` is.
 *
 * Knows no feature: the voice feature hands it the room's address and token
 * and hears back how the link ends, in the app's words.
 */

/**
 * How a link ends: left by this page without `leave` (the page closing or
 * reloading: LiveKit leaves on pagehide); the same account joined this room elsewhere
 * (`other-tab`, VC-02); put out by the server (another room joined elsewhere,
 * a moderator, a lost right; the API says which); lost for good.
 */
export type LinkEnd = 'left' | 'other-tab' | 'removed' | 'lost'

/** The microphone or camera after a switch: on, off, or refused by the browser (S-MOD-04). */
export type DeviceState = 'on' | 'off' | 'blocked'

/** What to send as the room is joined (asked on the preview page, REQ-VC-03). */
export interface JoinDevices {
    mic: boolean
    camera: boolean
}

export interface LinkEvents {
    /** The link ended without a word from this tab (not after `leave`). */
    onEnd: (end: LinkEnd) => void
    /** LiveKit lost the link and tries again (C-09 `+reconnecting`). */
    onReconnecting: () => void
    onReconnected: () => void
    /**
     * This tab's shared screen stopped without `setScreen(false)`: the
     * browser's own "sharing" bar, the window closed, the server taking it
     * (`refused`: VIDEO lost, ROOM-EDGE), or the server muting it (`muted`:
     * another screen came first, D-101).
     */
    onScreenEnded: (why: ScreenEnd) => void
}

/** Why a shared screen stopped by itself (`onScreenEnded`). */
export type ScreenEnd = 'stopped' | 'refused' | 'muted'

export interface RoomLink {
    /** The LiveKit room, for the room page's hooks (`@livekit/components-react`). */
    room: Room
    setMic: (on: boolean) => Promise<DeviceState>
    setCamera: (on: boolean) => Promise<DeviceState>
    /**
     * Shares a screen or stops: on asks the browser which (its own picker,
     * with ARCHITECTURE §4's hints), `off` when the person cancels it or the
     * system refuses (one `NotAllowedError`: no Toast, 07 S-ROOM-07).
     */
    setScreen: (on: boolean) => Promise<'on' | 'off'>
    /** Leaves the room; `onEnd` is not called. */
    leave: () => Promise<void>
}

const ENDS: Partial<Record<DisconnectReason, LinkEnd>> = {
    [DisconnectReason.CLIENT_INITIATED]: 'left',
    [DisconnectReason.DUPLICATE_IDENTITY]: 'other-tab',
    [DisconnectReason.PARTICIPANT_REMOVED]: 'removed',
    [DisconnectReason.ROOM_DELETED]: 'removed'
}

/** LiveKit's numbers for the screen and its sound in a participant's permissions (`TrackSource` of its protocol, not exported). */
const SCREEN_SHARE = 3
const SCREEN_SHARE_AUDIO = 4

/** Whether the server lets this participant send `source` (no list: every source). */
function mayPublish(participant: Participant, source: number): boolean {
    const permissions = participant.permissions
    if (!permissions) return true
    return (
        permissions.canPublish &&
        (permissions.canPublishSources.length === 0 || permissions.canPublishSources.includes(source))
    )
}

/**
 * The picker's hints (ARCHITECTURE §4): a window chosen first, this tab left
 * out, the box to share sound shown. Chrome follows them; Firefox and Safari
 * show their own picker. No sound when it may not be sent (muted by a
 * moderator, D-207): LiveKit would refuse that track after sending the picture.
 */
const screenOptions = (sound: boolean) => ({
    audio: sound,
    video: { displaySurface: 'window' as const },
    selfBrowserSurface: 'exclude' as const,
    systemAudio: sound ? ('include' as const) : ('exclude' as const)
})

/** How long after the screen stopped by itself a lost VIDEO still says why. */
const REFUSED_MS = 3_000

/** What the browser answered when asked for the microphone or camera. */
export function deviceStateOf(error: unknown): DeviceState {
    return MediaDeviceFailure.getFailure(error) === MediaDeviceFailure.PermissionDenied ? 'blocked' : 'off'
}

/**
 * Joins the room at `url` with `token`, the microphone and camera on as
 * `devices` says (asked on the preview page, REQ-VC-03). Others' sound plays
 * whatever page is open: each sound track gets an <audio> of its own, out of
 * the page's layout. A browser that keeps sound until the page is touched
 * (no click before a reload's join) plays it at the next touch. Others'
 * pictures are attached by the room page to its own <video>, only where shown.
 *
 * Rejects when the room cannot be reached; a microphone or camera refused
 * only leaves it off (`micState` / `cameraState` then say `blocked`).
 */
export async function joinRoom(
    url: string,
    token: string,
    devices: JoinDevices,
    events: LinkEvents
): Promise<{ link: RoomLink; micState: DeviceState; cameraState: DeviceState }> {
    const room = new Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true })
    let leaving = false
    const players = new Map<string, HTMLMediaElement>()

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio || !track.sid) return
        const player = track.attach()
        player.hidden = true
        document.body.append(player)
        players.set(track.sid, player)
    })
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (!track.sid) return
        const player = players.get(track.sid)
        if (!player) return
        track.detach(player)
        player.remove()
        players.delete(track.sid)
    })
    const stopWaiting = () => {
        document.removeEventListener('pointerdown', unlockSound)
        document.removeEventListener('keydown', unlockSound)
    }
    function unlockSound() {
        stopWaiting()
        void room.startAudio()
    }
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (room.canPlaybackAudio) return
        document.addEventListener('pointerdown', unlockSound)
        document.addEventListener('keydown', unlockSound)
    })
    // This tab's screen: `sharing` while this tab means it to be shared.
    let sharing = false
    /** When the screen last stopped by itself, for VIDEO lost just after (the server's two words come in either order). */
    let stoppedAt = 0
    const screenEnded = (why: ScreenEnd) => {
        sharing = false
        events.onScreenEnded(why)
    }
    room.on(RoomEvent.LocalTrackUnpublished, (publication: TrackPublication) => {
        if (publication.source !== Track.Source.ScreenShare || !sharing) return
        // A full reconnect takes every track down and sends it again, still live: not a stop.
        if (publication.track?.mediaStreamTrack.readyState === 'live') return
        stoppedAt = Date.now()
        screenEnded(mayPublish(room.localParticipant, SCREEN_SHARE) ? 'stopped' : 'refused')
        // Its sound too, if the server left it (the browser's bar ends both).
        void room.localParticipant.setScreenShareEnabled(false).catch(() => undefined)
    })
    room.on(RoomEvent.TrackMuted, (publication: TrackPublication, participant: Participant) => {
        if (participant !== room.localParticipant || publication.source !== Track.Source.ScreenShare || !sharing) return
        screenEnded('muted')
        void room.localParticipant.setScreenShareEnabled(false).catch(() => undefined)
    })
    room.on(RoomEvent.ParticipantPermissionsChanged, (_before: unknown, participant?: Participant) => {
        if (participant && participant !== room.localParticipant) return
        if (mayPublish(room.localParticipant, SCREEN_SHARE)) return
        if (sharing) {
            screenEnded('refused')
            void room.localParticipant.setScreenShareEnabled(false).catch(() => undefined)
        } else if (Date.now() - stoppedAt < REFUSED_MS) {
            stoppedAt = 0
            events.onScreenEnded('refused')
        }
    })
    room.on(RoomEvent.Reconnecting, () => events.onReconnecting())
    room.on(RoomEvent.Reconnected, () => events.onReconnected())
    room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        for (const player of players.values()) player.remove()
        players.clear()
        stopWaiting()
        if (!leaving) events.onEnd((reason !== undefined && ENDS[reason]) || 'lost')
    })

    const switched = async (on: boolean, apply: (on: boolean) => Promise<unknown>): Promise<DeviceState> => {
        try {
            await apply(on)
            return on ? 'on' : 'off'
        } catch (error) {
            return deviceStateOf(error)
        }
    }
    const setMic = (on: boolean) => switched(on, (value) => room.localParticipant.setMicrophoneEnabled(value))
    const setCamera = (on: boolean) => switched(on, (value) => room.localParticipant.setCameraEnabled(value))
    const setScreen = async (on: boolean): Promise<'on' | 'off'> => {
        sharing = false
        try {
            if (on) {
                const sound = mayPublish(room.localParticipant, SCREEN_SHARE_AUDIO)
                await room.localParticipant.setScreenShareEnabled(true, screenOptions(sound))
                // Muted by the server while it was being sent (another screen came first): not shared.
                if (room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.isMuted) {
                    await room.localParticipant.setScreenShareEnabled(false)
                    return 'off'
                }
                sharing = true
                return 'on'
            }
            await room.localParticipant.setScreenShareEnabled(false)
        } catch {
            // Cancelled, refused, or LiveKit refusing it: nothing shared.
            await room.localParticipant.setScreenShareEnabled(false).catch(() => undefined)
        }
        return 'off'
    }

    await room.connect(url, token)
    const micState = devices.mic ? await setMic(true) : 'off'
    const cameraState = devices.camera ? await setCamera(true) : 'off'
    return {
        link: {
            room,
            setMic,
            setCamera,
            setScreen,
            leave: async () => {
                leaving = true
                await room.disconnect()
            }
        },
        micState,
        cameraState
    }
}
