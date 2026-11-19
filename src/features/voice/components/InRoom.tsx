import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Minimize2, PhoneOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { RoomContext, useIsSpeaking, useParticipants } from '@livekit/components-react'
import { Track, type Participant, type Room } from 'livekit-client'
import { useToastEdge } from '@/hooks/useToastArea'
import { useOrderedPeople } from '../hooks/useOrderedPeople'
import { useLeaveRoom } from '../hooks/useLeaveRoom'
import { useModMuted } from '../hooks/useModMuted'
import { useRoomMenu } from '../hooks/useRoomMenu'
import type { Device } from '../lib/devices'
import { gridOf } from '../lib/people'
import { roomActionsOn } from '../lib/room-actions'
import type { RoomPerson, VoiceRoom } from '../types'
import { BlockedBanner } from './BlockedBanner'
import { DeviceControl } from './DeviceControl'
import { ModeratorMenu } from './ModeratorMenu'
import {
    Corner,
    PersonTile,
    pictureFit,
    TILE_MORE,
    TILE_MORE_FOOT,
    TILE_MORE_SIZE,
    TileFace,
    useTileName
} from './PersonTile'
import { RoomControl } from './RoomControl'

/**
 * The room once joined (S-ROOM-06 `voice`): every person a tile in the grid
 * (C-20 › Lưới, 07 P2: always the grid in a voice room), oneself first, then
 * as C-18 orders them; the controls at the bottom (Mic · Camera · Leave, 24
 * apart; Share comes with L5). Toasts sit 16 above the controls (C-16). The
 * browser blocking the mic or camera: a Banner under the Header (S-MOD-04).
 *
 * Who is there is LiveKit's: a person not yet on the API's list (its webhook
 * behind) still has a tile, with LiveKit's name; whether a mic is on is the
 * track's, who speaks is LiveKit's (`useIsSpeaking`), and so are the
 * pictures (a camera track not muted).
 *
 * A tile with a picture zooms in to the whole stage, the others hidden (07
 * câu L3b-a): a click on it, its zoom-out button or Esc goes back to the
 * grid, as does its picture stopping (the camera off, the person gone).
 */
export function InRoom({ room, live, me }: { room: VoiceRoom; live: Room; me: string }) {
    return (
        <RoomContext.Provider value={live}>
            <Stage room={room} me={me} />
        </RoomContext.Provider>
    )
}

function Stage({ room, me }: { room: VoiceRoom; me: string }) {
    const { t } = useTranslation('voice')
    const participants = useParticipants()
    // A camera sending a picture: published, not muted (`useParticipants` draws again as that changes).
    const pictures = new Map<string, Track>()
    for (const participant of participants) {
        const camera = participant.getTrackPublication(Track.Source.Camera)
        if (camera?.track && !camera.isMuted) pictures.set(participant.identity, camera.track)
    }
    const listed = new Map(room.people.map((person) => [person.user.id, person]))
    const people: RoomPerson[] = participants.map(
        (participant) =>
            listed.get(participant.identity) ?? {
                user: {
                    id: participant.identity,
                    username: null,
                    displayName: participant.name || null,
                    avatarUrl: null
                },
                roleIds: [],
                isOwner: false,
                joinedAt: new Date().toISOString(),
                micOn: participant.isMicrophoneEnabled,
                cameraOn: false,
                screenSharing: false,
                modMuted: false
            }
    )
    const ordered = useOrderedPeople(people, me)
    const byId = new Map(participants.map((participant) => [participant.identity, participant]))
    const { columns, maxWidth } = gridOf(ordered.length)
    const [help, setHelp] = useState<Device | null>(null)
    const leave = useLeaveRoom(room)
    const bar = useRef<HTMLDivElement>(null)
    useToastEdge('barTop', bar)

    // The grid is one keyboard stop: the person whose tile was last focused holds it
    // (people come and go around them), ← → move. Inline, as the attachment tray's tiles.
    const [current, setCurrent] = useState<string | null>(null)
    const at = Math.max(
        ordered.findIndex((one) => one.user.id === current),
        0
    )
    const tiles = useRef<(HTMLButtonElement | null)[]>([])
    const move = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        const next = ordered[index + step]
        if (!step || !next) return
        event.preventDefault()
        setCurrent(next.user.id)
        tiles.current[index + step]?.focus()
    }

    const [zoomed, setZoomed] = useState<string | null>(null)
    const zoomedPicture = zoomed ? pictures.get(zoomed) : undefined
    const backTo = useRef<string | null>(null)
    const zoomOut = () => {
        backTo.current = zoomed
        setZoomed(null)
    }
    // The picture zoomed in on stopped (camera off, the person gone): back to the grid, not zoomed again when it returns.
    useEffect(() => {
        if (!zoomed || zoomedPicture) return
        backTo.current = zoomed
        setZoomed(null)
    }, [zoomed, zoomedPicture])
    // Back in the grid from a zoom, the keyboard having been on it: on that person's tile, or the grid's stop.
    useEffect(() => {
        if (zoomed || !backTo.current) return
        const away = document.activeElement && document.activeElement !== document.body
        const index = ordered.findIndex((one) => one.user.id === backTo.current)
        backTo.current = null
        if (!away) tiles.current[index === -1 ? at : index]?.focus()
    })
    // Esc zooms out, unless it closes the help over the stage (that layer goes first).
    const escape = useRef({ zoomed, help })
    useLayoutEffect(() => {
        escape.current = { zoomed, help }
    })
    useEffect(() => {
        const onKey = (event: globalThis.KeyboardEvent) => {
            // Taken by a layer on top already (a moderator's menu closing): only that one goes.
            if (event.key !== 'Escape' || event.defaultPrevented || !escape.current.zoomed || escape.current.help)
                return
            backTo.current = escape.current.zoomed
            setZoomed(null)
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [])

    const person = zoomedPicture ? ordered.find((one) => one.user.id === zoomed) : undefined
    // Muted by a moderator (07 mod-muted): their word, or one's own row in the API's list (D-205).
    const modMuted = useModMuted(room.people.some((one) => one.user.id === me && one.modMuted))
    return (
        <div className='flex min-h-full flex-col'>
            <BlockedBanner onHowTo={setHelp} />
            <div className='flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-4'>
                {zoomedPicture && person ? (
                    <Zoomed
                        room={room}
                        person={person}
                        self={person.user.id === me}
                        participant={byId.get(person.user.id)}
                        picture={zoomedPicture}
                        onZoomOut={zoomOut}
                    />
                ) : (
                    <ul
                        aria-label={t('room.people')}
                        className='grid w-full justify-center gap-4'
                        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, ${maxWidth}px))` }}
                    >
                        {ordered.map((one, index) => {
                            const picture = pictures.get(one.user.id)
                            return (
                                <Tile
                                    key={one.user.id}
                                    ref={(node) => {
                                        tiles.current[index] = node
                                    }}
                                    room={room}
                                    person={one}
                                    participant={byId.get(one.user.id)}
                                    self={one.user.id === me}
                                    picture={picture}
                                    tabIndex={index === at ? 0 : -1}
                                    onFocus={() => setCurrent(one.user.id)}
                                    onKeyDown={move(index)}
                                    onZoom={picture ? () => setZoomed(one.user.id) : undefined}
                                />
                            )
                        })}
                    </ul>
                )}
            </div>
            <div ref={bar} className='flex shrink-0 items-start justify-center gap-4 px-6 pb-6 pt-2'>
                <DeviceControl device='mic' allowed={room.canSpeak} modMuted={modMuted} help={help} onHelp={setHelp} />
                <DeviceControl device='camera' allowed={room.canVideo} help={help} onHelp={setHelp} />
                <span className='w-6' aria-hidden='true' />
                <RoomControl
                    icon={<PhoneOff />}
                    label={t('controls.leave')}
                    hint={t('controls.leave')}
                    onClick={leave}
                />
            </div>
        </div>
    )
}

/**
 * A camera's picture in a tile: covering it in the grid, whole when zoomed
 * in; one's own mirrored (C-20 `self`). The track is attached to the <video>
 * itself, which also lets LiveKit send a picture only as large as the tile
 * shows (`adaptiveStream`).
 */
function Picture({ track, self, whole }: { track: Track; self: boolean; whole?: boolean }) {
    const video = useRef<HTMLVideoElement>(null)
    useEffect(() => {
        const element = video.current
        if (!element) return
        track.attach(element)
        return () => {
            track.detach(element)
        }
    }, [track])
    return (
        <video
            ref={video}
            autoPlay
            muted
            playsInline
            aria-hidden='true'
            className='absolute inset-0 size-full'
            style={pictureFit(self, whole)}
        />
    )
}

type TileProps = Omit<Parameters<typeof PersonTile>[0], 'person' | 'micOn' | 'speaking' | 'picture' | 'menu'> & {
    room: VoiceRoom
    person: RoomPerson
    participant?: Participant
    picture?: Track
}

/**
 * A person's tile, LiveKit's mic and speaking, and a moderator's menu on it
 * (D-208): ⋯ in the corner, a right click, or Shift+F10 on the tile.
 */
const Tile = ({
    ref,
    room,
    person,
    participant,
    self,
    picture,
    onKeyDown,
    ...props
}: TileProps & { ref: (node: HTMLButtonElement | null) => void }) => {
    const speaking = useIsSpeaking(participant)
    const micOn = participant ? participant.isMicrophoneEnabled : person.micOn
    const actions = roomActionsOn(room, person, self ? person.user.id : undefined)
    const menu = useRoomMenu(actions.length > 0)
    const own = useRef<HTMLButtonElement | null>(null)
    const name = useTileName(person.user, self)
    return (
        <PersonTile
            ref={(node) => {
                own.current = node
                ref(node)
            }}
            person={person.user}
            self={self}
            micOn={micOn}
            modMuted={person.modMuted}
            speaking={speaking}
            picture={picture ? <Picture track={picture} self={self} /> : undefined}
            onContextMenu={menu.onContextMenu}
            onKeyDown={(event) => {
                if (!menu.onKeyDown(event)) onKeyDown?.(event)
            }}
            menu={
                actions.length > 0 ? (
                    <ModeratorMenu
                        menu={menu}
                        channelId={room.channelId}
                        userId={person.user.id}
                        name={name}
                        actions={actions}
                        className={TILE_MORE}
                        size={TILE_MORE_SIZE}
                        foot={TILE_MORE_FOOT}
                        returnTo={own}
                    />
                ) : undefined
            }
            {...props}
        />
    )
}

/**
 * One tile on the whole stage (07 câu L3b-a): the picture whole, the name
 * strip, the zoom-out mark at the top right (`minimize-2`). The whole tile
 * is the "Zoom out" button, which the keyboard lands on (Esc: the stage).
 */
function Zoomed({
    room,
    person,
    self,
    participant,
    picture,
    onZoomOut
}: {
    room: VoiceRoom
    person: RoomPerson
    self: boolean
    participant?: Participant
    picture: Track
    onZoomOut: () => void
}) {
    const { t } = useTranslation('voice')
    const name = useTileName(person.user, self)
    const speaking = useIsSpeaking(participant)
    const micOn = participant ? participant.isMicrophoneEnabled : person.micOn
    const button = useRef<HTMLButtonElement>(null)
    useEffect(() => button.current?.focus(), [])
    const actions = roomActionsOn(room, person, self ? person.user.id : undefined)
    const menu = useRoomMenu(actions.length > 0)
    return (
        <div
            role='group'
            aria-label={t('room.zoomed', { name })}
            className='group relative flex min-h-0 flex-1'
            style={{ alignSelf: 'stretch' }}
        >
            <button
                ref={button}
                type='button'
                aria-label={t('room.zoomOut')}
                onClick={onZoomOut}
                onContextMenu={menu.onContextMenu}
                onKeyDown={menu.onKeyDown}
                className='relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-button bg-surface-2 text-left'
            >
                <TileFace
                    person={person.user}
                    self={self}
                    micOn={micOn}
                    speaking={speaking}
                    picture={<Picture track={picture} self={self} whole />}
                />
                <Corner icon={<Minimize2 />} beside={actions.length > 0} />
            </button>
            <ModeratorMenu
                menu={menu}
                channelId={room.channelId}
                userId={person.user.id}
                name={name}
                actions={actions}
                className={TILE_MORE}
                size={TILE_MORE_SIZE}
                foot={TILE_MORE_FOOT}
                returnTo={button}
            />
        </div>
    )
}
