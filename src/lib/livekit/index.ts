import { DisconnectReason, MediaDeviceFailure, Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client'

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

/** The microphone after a switch: on, off, or refused by the browser (S-MOD-04). */
export type MicState = 'on' | 'off' | 'blocked'

export interface LinkEvents {
    /** The link ended without a word from this tab (not after `leave`). */
    onEnd: (end: LinkEnd) => void
    /** LiveKit lost the link and tries again (C-09 `+reconnecting`). */
    onReconnecting: () => void
    onReconnected: () => void
}

export interface RoomLink {
    /** The LiveKit room, for the room page's hooks (`@livekit/components-react`). */
    room: Room
    setMic: (on: boolean) => Promise<MicState>
    /** Leaves the room; `onEnd` is not called. */
    leave: () => Promise<void>
}

const ENDS: Partial<Record<DisconnectReason, LinkEnd>> = {
    [DisconnectReason.CLIENT_INITIATED]: 'left',
    [DisconnectReason.DUPLICATE_IDENTITY]: 'other-tab',
    [DisconnectReason.PARTICIPANT_REMOVED]: 'removed',
    [DisconnectReason.ROOM_DELETED]: 'removed'
}

/** What the browser answered when asked for the microphone. */
export function micStateOf(error: unknown): MicState {
    return MediaDeviceFailure.getFailure(error) === MediaDeviceFailure.PermissionDenied ? 'blocked' : 'off'
}

/**
 * Joins the room at `url` with `token`, the microphone on when `mic` (asked
 * on the preview page, REQ-VC-03); the camera stays off. Others' sound plays
 * whatever page is open: each sound track gets an <audio> of its own, out of
 * the page's layout. A browser that keeps sound until the page is touched
 * (no click before a reload's join) plays it at the next touch.
 *
 * Rejects when the room cannot be reached; a microphone refused only leaves
 * it off (`micState` then says `blocked`).
 */
export async function joinRoom(
    url: string,
    token: string,
    mic: boolean,
    events: LinkEvents
): Promise<{ link: RoomLink; micState: MicState }> {
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
    room.on(RoomEvent.Reconnecting, () => events.onReconnecting())
    room.on(RoomEvent.Reconnected, () => events.onReconnected())
    room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        for (const player of players.values()) player.remove()
        players.clear()
        stopWaiting()
        if (!leaving) events.onEnd((reason !== undefined && ENDS[reason]) || 'lost')
    })

    const setMic = async (on: boolean): Promise<MicState> => {
        try {
            await room.localParticipant.setMicrophoneEnabled(on)
            return on ? 'on' : 'off'
        } catch (error) {
            return micStateOf(error)
        }
    }

    await room.connect(url, token)
    const micState = mic ? await setMic(true) : 'off'
    return {
        link: {
            room,
            setMic,
            leave: async () => {
                leaving = true
                await room.disconnect()
            }
        },
        micState
    }
}
