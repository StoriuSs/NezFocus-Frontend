import { Suspense, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Minimize2, PhoneOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { RoomContext, useIsSpeaking, useParticipants } from '@livekit/components-react'
import { Track, type Participant, type Room } from 'livekit-client'
import { PageLoader } from '@/components/PageLoader'
import { StudyStage, useEndedHere, type StudyRoomView } from '@/features/study'
import { useToastEdge } from '@/hooks/useToastArea'
import { useOrderedPeople } from '../hooks/useOrderedPeople'
import { useLeaveRoom } from '../hooks/useLeaveRoom'
import { useModMuted } from '../hooks/useModMuted'
import { useRoomMenu } from '../hooks/useRoomMenu'
import type { Device } from '../lib/devices'
import { gridOf, personName, seatsOf } from '../lib/people'
import { roomActionsOn } from '../lib/room-actions'
import { switchScreen } from '../lib/session'
import { sharerOf } from '../lib/share'
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
import { Seat } from './Seat'
import { SeatMore } from './SeatMore'
import { ShareControl } from './ShareControl'
import { StageView } from './StageView'
import { TileStrip } from './TileStrip'
import { useVoiceStore } from '../voice.store'

/**
 * The room once joined (S-ROOM-06 `voice`): every person a tile in the grid
 * (C-20 › Lưới, 07 P2: always the grid in a voice room), oneself first, then
 * as C-18 orders them; the controls at the bottom (Mic · Camera · Share ···
 * Leave). Toasts sit 16 above the controls (C-16). The browser blocking the
 * mic or camera: a Banner under the Header (S-MOD-04).
 *
 * A screen shared (S-ROOM-07, D-102): the tiles go to a strip above (`video ·
 * strip`) and the screen takes the stage (C-31), for oneself the card
 * "You're sharing your screen"; it stopping, back to the grid (not to a
 * tile zoomed in before). Whose screen is LiveKit's (a screen track sent,
 * not muted by the server); its start and stop are read out politely.
 *
 * Who is there is LiveKit's: a person not yet on the API's list (its webhook
 * behind) still has a tile, with LiveKit's name; whether a mic is on is the
 * track's, who speaks is LiveKit's (`useIsSpeaking`), and so are the
 * pictures (a camera track not muted).
 *
 * A tile with a picture zooms in to the whole stage, the others hidden (07
 * câu L3b-a): a click on it, its zoom-out button or Esc goes back to the
 * grid, as does its picture stopping (the camera off, the person gone).
 *
 * A study room (07 S-ROOM-02, S-ROOM-06 `study-room-idle`) is the study
 * feature's stage: the people around the ring, or this grid under the
 * session's compact block (the Header's switch, D-55), a screen shared or a
 * tile zoomed in the same; its controls with the Host's. So is a room whose
 * study mode was turned off while one was in it, for the summary (07 › Edge).
 */
export function InRoom({
    room,
    live,
    me,
    onMorePeople
}: {
    room: VoiceRoom
    live: Room
    me: string
    /** Opens the panel "Người trong phòng" (the ring's "+N" seat). */
    onMorePeople?: (seat: HTMLButtonElement, order: string[]) => void
}) {
    return (
        <RoomContext.Provider value={live}>
            <Stage room={room} me={me} onMorePeople={onMorePeople} />
        </RoomContext.Provider>
    )
}

function Stage({
    room,
    me,
    onMorePeople
}: {
    room: VoiceRoom
    me: string
    onMorePeople?: (seat: HTMLButtonElement, order: string[]) => void
}) {
    const { t } = useTranslation('voice')
    const participants = useParticipants()
    // A camera sending a picture: published, not muted (`useParticipants` draws again as that changes).
    const pictures = new Map<string, Track>()
    // A screen sent: published, not muted (the server mutes a second one, D-101); its picture may still be on its way.
    const screens = new Map<string, Track | undefined>()
    for (const participant of participants) {
        const camera = participant.getTrackPublication(Track.Source.Camera)
        if (camera?.track && !camera.isMuted) pictures.set(participant.identity, camera.track)
        const screen = participant.getTrackPublication(Track.Source.ScreenShare)
        if (screen && !screen.isMuted) screens.set(participant.identity, screen.track)
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
    const ordered = useOrderedPeople(people, me, room.session?.hostId)
    const sharer = useHeldSharer(sharerOf([...screens.keys()], room.people.find((one) => one.screenSharing)?.user.id))
    const sharerPerson = sharer ? (people.find((one) => one.user.id === sharer) ?? listed.get(sharer)) : undefined
    const sharerName = useTileName(sharerPerson?.user ?? EMPTY_USER, false)
    const said = useShareNews(sharer === me ? undefined : sharer, sharerName)
    const shareButton = useRef<HTMLButtonElement>(null)
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
    // A screen shared takes the place of a tile zoomed in; it stopping goes back to the grid (07 ROOM-EDGE).
    if (sharer && zoomed) setZoomed(null)
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
    // The grid and the strip are different lists: the keyboard on a tile (or the stage) as the layout
    // changes, and so lost, goes to the tile holding the stop; not when it is elsewhere already.
    const area = useRef<HTMLDivElement>(null)
    const keyboardHere = useRef(false)
    useEffect(() => {
        const onFocus = (event: FocusEvent) => {
            keyboardHere.current = area.current?.contains(event.target as Node) ?? false
        }
        document.addEventListener('focusin', onFocus)
        return () => document.removeEventListener('focusin', onFocus)
    }, [])
    const shared = sharer !== undefined
    const layout = useRef(shared)
    useEffect(() => {
        if (layout.current === shared) return
        layout.current = shared
        const lost = !document.activeElement || document.activeElement === document.body
        if (lost && keyboardHere.current) tiles.current[at]?.focus()
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
    // Everyone's tile: in the grid, or `small` in the strip above a screen (no zooming in there).
    const tilesOf = (small: boolean) =>
        ordered.map((one, index) => {
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
                    sharing={one.user.id === sharer}
                    small={small}
                    tabIndex={index === at ? 0 : -1}
                    onFocus={() => setCurrent(one.user.id)}
                    onKeyDown={move(index)}
                    onZoom={picture && !small ? () => setZoomed(one.user.id) : undefined}
                />
            )
        })
    // Muted by a moderator (07 mod-muted): their word, or one's own row in the API's list (D-205).
    const modMuted = useModMuted(room.people.some((one) => one.user.id === me && one.modMuted))
    const joinedAt = room.people.find((one) => one.user.id === me)?.joinedAt ?? null
    const endedHere = useEndedHere(room.channelId, room.session === null, joinedAt) !== null
    const view = useVoiceStore((state) => state.roomView)
    const { t: words } = useTranslation('voice')
    const devices = (
        <>
            <DeviceControl device='mic' allowed={room.canSpeak} modMuted={modMuted} help={help} onHelp={setHelp} />
            <DeviceControl device='camera' allowed={room.canVideo} help={help} onHelp={setHelp} />
            <ShareControl
                ref={shareButton}
                allowed={room.canVideo}
                other={sharer && sharer !== me ? sharerName : undefined}
            />
        </>
    )
    const leaveButton = (
        <RoomControl icon={<PhoneOff />} label={t('controls.leave')} hint={t('controls.leave')} onClick={leave} />
    )
    if (room.isStudyRoom || endedHere) {
        const study: StudyRoomView = {
            channelId: room.channelId,
            isStudyRoom: room.isStudyRoom,
            session: room.session,
            cycle: room.cycle,
            canStart: room.canStartSession,
            canManage: room.canManageStudy
        }
        const ringView = view === 'ring' && !sharer && !zoomedPicture
        return (
            <div className='flex min-h-full flex-col'>
                <BlockedBanner onHowTo={setHelp} />
                <p className='sr-only' aria-live='polite'>
                    {said}
                </p>
                <Suspense fallback={<PageLoader className='min-h-0 flex-1' />}>
                    <StudyStage
                        room={study}
                        me={me}
                        joinedAt={joinedAt}
                        people={ordered.map((one) => ({
                            id: one.user.id,
                            name: personName(one.user) ?? words('person.deletedAccount')
                        }))}
                        seats={ringSeats(ordered, byId, onMorePeople)}
                        content={ringView ? null : tilesArea()}
                        devices={devices}
                        leave={leaveButton}
                        Control={RoomControl}
                        barRef={bar}
                    />
                </Suspense>
            </div>
        )
    }
    return (
        <div className='flex min-h-full flex-col'>
            <BlockedBanner onHowTo={setHelp} />
            <p className='sr-only' aria-live='polite'>
                {said}
            </p>
            {tilesArea()}
            <div ref={bar} className='flex shrink-0 items-start justify-center gap-4 px-6 pb-6 pt-2'>
                {devices}
                <span className='w-6' aria-hidden='true' />
                {leaveButton}
            </div>
        </div>
    )

    /** The people's tiles: the grid, a tile zoomed in, or the strip over a screen shared. */
    function tilesArea() {
        return (
            <div ref={area} className='flex min-h-0 flex-1 flex-col'>
                {sharer ? (
                    <>
                        <div className='flex shrink-0 px-6 pt-4'>
                            <TileStrip label={t('room.people')}>{tilesOf(true)}</TileStrip>
                        </div>
                        <StageView
                            key={sharer}
                            track={screens.get(sharer)}
                            name={sharerName}
                            self={sharer === me}
                            onStop={() => {
                                void switchScreen(false)
                                shareButton.current?.focus()
                            }}
                        />
                    </>
                ) : (
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
                                {tilesOf(false)}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        )
    }
}

/**
 * The seats around a study room's ring (C-18), in the order shown, each
 * person's mic as LiveKit has it; 13 or more, 11 seats and "+N", which
 * opens the panel "Người trong phòng".
 */
function ringSeats(
    ordered: RoomPerson[],
    byId: Map<string, Participant>,
    onMorePeople?: (seat: HTMLButtonElement, order: string[]) => void
) {
    const { shown, more } = seatsOf(ordered)
    const seats = shown.map((person) => {
        const participant = byId.get(person.user.id)
        const micOn = participant ? participant.isMicrophoneEnabled : person.micOn
        return { id: person.user.id, seat: <Seat as='div' person={{ ...person, micOn }} /> }
    })
    if (more > 0)
        seats.push({
            id: 'more',
            seat: (
                <SeatMore
                    more={more}
                    total={ordered.length}
                    onOpen={
                        onMorePeople &&
                        ((seat) =>
                            onMorePeople(
                                seat,
                                ordered.map((one) => one.user.id)
                            ))
                    }
                />
            )
        })
    return seats
}

/**
 * Whose screen the stage shows: LiveKit's sharer, and while the link is
 * coming back (C-09 `+reconnecting`: LiveKit lets every participant go
 * meanwhile) still the last one, so the stage says `connecting` rather than
 * going back to the grid (07 ROOM-EDGE: a short drop).
 */
function useHeldSharer(sharer: string | undefined): string | undefined {
    const reconnecting = useVoiceStore((state) => state.call?.phase === 'reconnecting')
    const [held, setHeld] = useState(sharer)
    if (held !== sharer && (sharer !== undefined || !reconnecting)) setHeld(sharer)
    return sharer ?? (reconnecting ? held : undefined)
}

/** No one: the name hook's input while no screen is shared. */
const EMPTY_USER: RoomPerson['user'] = { id: '', username: null, displayName: null, avatarUrl: null }

/**
 * What to read out as someone else's screen starts or stops (S-ROOM-07 ›
 * Tương tác: `aria-live` polite, "An is sharing their screen" / "An stopped
 * sharing"); nothing for one's own.
 */
function useShareNews(sharer: string | undefined, name: string): string {
    const { t } = useTranslation('voice')
    const [said, setSaid] = useState('')
    const last = useRef<{ id?: string; name: string }>({ name: '' })
    useEffect(() => {
        const before = last.current
        if (sharer === before.id) {
            before.name = name
            return
        }
        if (sharer) setSaid(t('stage.started', { name }))
        else if (before.id) setSaid(t('stage.stopped', { name: before.name }))
        last.current = { id: sharer, name }
    }, [sharer, name, t])
    return said
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
