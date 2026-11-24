import { Suspense, useEffect, useRef, useState } from 'react'
import { CloudOff, Loader2, Lock, MonitorSmartphone, Timer, WifiOff, type LucideIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { Banner } from '@/components/Banner'
import { Button } from '@/components/ui/button'
import {
    asksBeforeLeaving,
    PreviewRing,
    useHostLeave,
    useSoloSession,
    useSoloYield,
    type RoomSession
} from '@/features/study'
import { settingsCache, useProfile } from '@/features/users'
import { useBrowserOnline } from '@/hooks/useBrowserOnline'
import { useToastEdge } from '@/hooks/useToastArea'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { endsAtText } from '@/lib/time-zones'
import { useOrderedPeople } from '../hooks/useOrderedPeople'
import type { Device } from '../lib/devices'
import { personName, seatsOf } from '../lib/people'
import { forgetProblem, joinRoom, stopPreviewCamera } from '../lib/session'
import type { VoiceRoom } from '../types'
import { useVoiceStore } from '../voice.store'
import { BlockedBanner } from './BlockedBanner'
import { DeviceControl } from './DeviceControl'
import { PersonAvatar } from './PersonAvatar'
import { pictureFit } from './PersonTile'
import { Seat } from './Seat'
import { SeatMore } from './SeatMore'

/**
 * The room's preview page (S-ROOM-01 `voice-preview`, 07 P3): the only way in
 * (D-44). Who is there as a row of seats (C-20 `seat`, C-18 order without
 * oneself), how many; one's own tile, always there so the buttons never jump
 * (D-53): one's avatar, or the camera's picture mirrored once it is on; Mic
 * and Camera (icon only) and "Join room". Joining keeps them as they are
 * (REQ-VC-03); leaving the page without joining turns the camera off (07
 * câu L3b-c).
 *
 * - `joining`: the button busy; Mic still works. Over 10 seconds, or no
 *   token: `join-error`, a neutral line under the buttons.
 * - `switch-room`: in another room in this tab, the button says "Switch to
 *   this room" (joining leaves the other); the Host of the other's session
 *   is asked first, "Chuyển phòng" (07 S-ROOM-04 `host-leave-confirm`, D-50).
 * - `forbidden`: timed out (D-54) or no CONNECT: the button disabled with
 *   why, no Mic and no own tile.
 * - `offline`: the button disabled, "You need a connection to join".
 * - `other-tab` (ROOM-EDGE): the account is in this room elsewhere: a Banner,
 *   and the button "Join here instead" (the other place is put out, VC-02).
 * - `mic-blocked`, `camera-blocked` (S-MOD-04): a Banner (one for both), the
 *   button `blocked`; joining still hears.
 */
export function Preview({
    room,
    joinedSession = null,
    onMorePeople
}: {
    room: VoiceRoom
    joinedSession?: RoomSession | null
    /** Opens the panel "Người trong phòng" (the "+N" seat), with the order of the seats. */
    onMorePeople?: (seat: HTMLButtonElement, order: string[]) => void
}) {
    const { t, i18n } = useTranslation('voice')
    const me = useProfile().data
    const timeZone = useQuery(settingsCache).data?.timezone
    const now = useMinuteClock()
    const online = useBrowserOnline()
    const call = useVoiceStore((state) => state.call)
    const cameraPreview = useVoiceStore((state) => state.cameraPreview)
    const problem = useVoiceStore((state) => (state.problem?.channelId === room.channelId ? state.problem : null))
    const [help, setHelp] = useState<Device | null>(null)
    // Toasts sit 16 above the buttons (07 › Quy ước, C-16).
    const buttons = useRef<HTMLDivElement>(null)
    useToastEdge('barTop', buttons)
    const others = room.people.filter((person) => person.user.id !== me?.id)
    // The first by the order of C-18 sits at 12 o'clock, the Host first of all (C-18 › Chưa vào phòng).
    const seats = useOrderedPeople(others, undefined, room.session?.hostId)
    const { shown, more } = seatsOf(seats)
    const nameOf = (userId: string) => {
        const person = room.people.find((one) => one.user.id === userId)
        return (person && personName(person.user)) ?? t('person.deletedAccount')
    }
    const host = room.session?.hostId ? room.people.find((one) => one.user.id === room.session?.hostId) : undefined
    const openMore =
        onMorePeople &&
        ((seat: HTMLButtonElement) =>
            onMorePeople(
                seat,
                seats.map((one) => one.user.id)
            ))
    const here = call?.channelId === room.channelId
    // In it, but not from this tab (this tab joining it is not elsewhere).
    const elsewhere = !here && room.people.some((person) => person.user.id === me?.id)
    const joining = here && call.phase === 'joining'
    const inOther = call !== null && call.channelId !== room.channelId

    // A refusal is forgotten when the page goes, or what the room allows changes (read again after it).
    const { channelId, canConnect, timeoutUntil } = room
    useEffect(() => () => forgetProblem(channelId), [channelId, canConnect, timeoutUntil])
    useEffect(() => () => stopPreviewCamera(), [channelId])
    // Until when: the server's, or the API's answer when the server is not read again yet.
    const until = room.timeoutUntil ?? problem?.until ?? null
    const timedOut = until !== null && new Date(until) > now
    const forbidden = timedOut || !room.canConnect || problem?.kind === 'refused'
    // The camera's button gone or disabled (closed to one, VIDEO taken): nothing could turn it off, so it goes off.
    const cameraUsable = !forbidden && room.canVideo
    useEffect(() => {
        if (!cameraUsable) stopPreviewCamera()
    }, [cameraUsable])
    const reason: { icon: LucideIcon; text: string } | null = forbidden
        ? timedOut && until
            ? {
                  icon: Timer,
                  text: t('preview.timedOut', {
                      time: endsAtText(new Date(until), now, i18n.language, timeZone)
                  })
              }
            : { icon: Lock, text: t('preview.noConnect') }
        : !online
          ? { icon: WifiOff, text: t('preview.offline') }
          : problem?.kind === 'network' && !joining
            ? { icon: CloudOff, text: t('preview.joinError') }
            : null

    const askHost = useHostLeave((state) => state.ask)
    const solo = useSoloSession().data?.session ?? null
    const askYield = useSoloYield((state) => state.ask)
    const join = () => {
        // Here instead of elsewhere: one never left the room for the API, counted all along (D-236).
        const go = () =>
            void joinRoom(
                { serverId: room.serverId, channelId: room.channelId, name: room.name },
                elsewhere ? { rejoin: true } : {}
            )
        // A room with a session ends one's Solo: asked first (08 `join-room-confirm`, D-103); none without one.
        if (solo && room.session) {
            askYield({ kind: 'join', room: room.name, confirm: go })
        } else if (inOther && joinedSession && asksBeforeLeaving(joinedSession, me?.id)) {
            // Switching is leaving: the Host of the room one is in is asked first, "Chuyển phòng" (D-50).
            askHost({ sessionId: joinedSession.id, kind: 'switch', confirm: go })
        } else go()
    }

    return (
        <div className='flex min-h-full flex-col'>
            {elsewhere && !forbidden ? (
                <Banner variant='strip' icon={MonitorSmartphone}>
                    {t('preview.otherTab')}
                </Banner>
            ) : null}
            {forbidden ? null : <BlockedBanner onHowTo={setHelp} />}
            <div className='flex flex-1 flex-col items-center justify-center gap-8 px-6 py-8'>
                {room.isStudyRoom ? (
                    <Suspense fallback={null}>
                        <PreviewRing
                            channelId={room.channelId}
                            session={room.session}
                            seats={[
                                ...shown.map((person) => ({
                                    id: person.user.id,
                                    seat: <Seat as='div' person={person} />
                                })),
                                ...(more > 0
                                    ? [
                                          {
                                              id: 'more',
                                              seat: (
                                                  <SeatMore more={more} total={room.people.length} onOpen={openMore} />
                                              )
                                          }
                                      ]
                                    : [])
                            ]}
                            people={room.people.length}
                            hostName={host ? nameOf(host.user.id) : null}
                            nameOf={nameOf}
                            elsewhere={inOther && joinedSession !== null}
                        />
                    </Suspense>
                ) : (
                    <div className='flex flex-col items-center gap-3'>
                        {seats.length > 0 ? (
                            <ul aria-label={t('room.people')} className='flex flex-wrap justify-center gap-4'>
                                {shown.map((person) => (
                                    <Seat key={person.user.id} person={person} />
                                ))}
                                {more > 0 ? (
                                    <li>
                                        <SeatMore more={more} total={room.people.length} onOpen={openMore} />
                                    </li>
                                ) : null}
                            </ul>
                        ) : null}
                        <p className='text-body font-semibold text-text-primary'>
                            {room.people.length === 0
                                ? t('preview.empty')
                                : t('preview.count', { count: room.people.length })}
                        </p>
                    </div>
                )}
                {forbidden || !me ? null : (
                    <div className='relative flex h-36 w-48 flex-col overflow-hidden rounded-button bg-surface-2'>
                        {cameraPreview ? (
                            <OwnPicture stream={cameraPreview} />
                        ) : (
                            <span className='flex min-h-0 flex-1 items-center justify-center'>
                                <PersonAvatar
                                    person={{
                                        ...me,
                                        username: me.username ?? null,
                                        displayName: me.displayName ?? null
                                    }}
                                    className='size-14 text-headline'
                                />
                            </span>
                        )}
                        <span className='relative mt-auto flex h-7 shrink-0 items-center bg-scrim px-2 text-label font-semibold text-text-primary'>
                            {t('preview.you')}
                        </span>
                    </div>
                )}
                <div className='flex flex-col items-center gap-3'>
                    <div ref={buttons} className='flex items-center gap-4'>
                        {forbidden ? null : (
                            <>
                                <DeviceControl
                                    device='mic'
                                    allowed={room.canSpeak}
                                    iconOnly
                                    help={help}
                                    onHelp={setHelp}
                                />
                                <DeviceControl
                                    device='camera'
                                    allowed={room.canVideo}
                                    iconOnly
                                    help={help}
                                    onHelp={setHelp}
                                />
                            </>
                        )}
                        <Button
                            className='w-60'
                            disabled={forbidden || !online}
                            aria-busy={joining || undefined}
                            onClick={joining ? undefined : join}
                        >
                            {joining ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                            {t(elsewhere ? 'preview.joinHere' : inOther ? 'preview.switch' : 'preview.join')}
                        </Button>
                    </div>
                    {reason ? (
                        <p role='status' className='flex items-center gap-2 text-label text-text-secondary'>
                            <reason.icon className='size-4 shrink-0' aria-hidden='true' />
                            {reason.text}
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

/** The camera's picture before joining, mirrored, covering one's tile (C-20 `self`). */
function OwnPicture({ stream }: { stream: MediaStream }) {
    const video = useRef<HTMLVideoElement>(null)
    useEffect(() => {
        if (video.current) video.current.srcObject = stream
    }, [stream])
    return (
        <video
            ref={video}
            data-testid='own-picture'
            autoPlay
            muted
            playsInline
            aria-hidden='true'
            className='absolute inset-0 size-full'
            style={pictureFit(true)}
        />
    )
}
