import { Suspense, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RoomContext, useIsSpeaking, useParticipants } from '@livekit/components-react'
import type { Participant } from 'livekit-client'
import { Mic, MicOff, Minimize2, Phone, PhoneOff, Video, VideoOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/social'
import { Button } from '@/components/ui/button'
import { RoomControl, useMicShortcut, type MicControl } from '@/features/voice'
import { useProfile } from '@/features/users'
import { serverNow } from '@/lib/server-clock'
import { useCallStore, type TabCall } from '../../call.store'
import { useCallPress } from '../../hooks/useCallPress'
import { callClock, type CallResult } from '../../lib/call-result'
import { dismissResult, hangUp, switchCallCamera, switchCallMic } from '../../lib/call-session'
import { friendsPath } from '../../lib/paths'
import type { SocialPerson } from '../../types'
import { PersonAvatar } from '../PersonAvatar'
import { CallHalo } from './CallHalo'
import { DANGER, PRESSED } from './call-tones'
import { resultWords } from './result-words'

/** The call's mic for Ctrl+Shift+M (DESIGN.md › Bàn phím, D-255). */
const CALL_MIC: MicControl = { mic: () => useCallStore.getState().mic, switchMic: switchCallMic }

// One-offs of C-48, inline: the social stylesheet keeps no class for them.
/** Avatars 120 on the Stage. */
const AVATAR = { width: 120, height: 120 }
/** Its frame: the ringing halo 14 around it. */
const FRAME = { width: 148, height: 148 }
/** The two people, 64 apart. */
const PEOPLE = { gap: 64 }
/** Kết thúc / Hủy apart from the other controls: 24, 8 more than their 16 (C-48). */
const APART = { marginLeft: 8 }
/** `speaking-ring` (DESIGN.md): 2 `text-primary`, 2 apart from the avatar. */
const SPEAKING = { boxShadow: '0 0 0 2px rgb(var(--bg)), 0 0 0 4px rgb(var(--text-primary))' }

/**
 * The call's page (C-48 CallStage, 09 S-CALL-01, R14): the DM's content
 * area while this tab holds a call of that DM, or for a few seconds after it
 * ends. The Stage (`bg`, centred, Experience: no phase ground, no mascot):
 * the line on top ("Đang gọi…", "Đang kết nối…", "Cuộc gọi thoại · 03:12"
 * counting each second from the answer, "Đang kết nối lại…"), then the two
 * avatars 120, 64 apart, a name under each (`body` 600, `mic-off` when they
 * muted), the one speaking ringed (`speaking-ring`); ringing out, only the
 * other one, in the ringing halo. The Control bar at the bottom: Mic · Camera
 * · Thu nhỏ · (24) · Kết thúc / Hủy (`danger`). Over: their avatar and what
 * came of it, "Gọi lại" · "Đóng" where one may try again (C-48 › Kết quả).
 *
 * Video (the large tile, one's own under it) comes with L9b: the camera may be
 * on, the Stage still shows the avatars. Esc does not hang up.
 */
export default function CallStage({ person, name }: { person: SocialPerson; name: string }) {
    const { t } = useTranslation('social')
    const tab = useCallStore((state) => state.current)
    const result = useCallStore((state) => state.result)
    const shownResult = result && result.call.user.id === person.id ? result : null
    const shownTab = !shownResult && tab && tab.call.user.id === person.id ? tab : null
    // Said once it changes (C-48): one live region for the whole call, its words changing.
    const said = shownResult
        ? resultWords(t, shownResult, name)
        : shownTab?.phase === 'connected'
          ? t('call.connected', { name })
          : ''
    // The page took the place of what had the focus (the chat's "Gọi lại", a control gone with the call): to the page.
    const page = useRef<HTMLDivElement>(null)
    const step = shownResult ? 'result' : shownTab ? 'live' : 'none'
    useEffect(() => {
        const focused = document.activeElement
        if (!focused || focused === document.body || focused.closest('[data-call-hidden]')) page.current?.focus()
    }, [step])
    return (
        <div ref={page} tabIndex={-1} className='flex min-h-0 flex-1 flex-col focus-visible:outline-none'>
            <p className='sr-only' aria-live='polite'>
                {said}
            </p>
            {shownResult ? (
                <ResultStage result={shownResult} person={person} name={name} />
            ) : shownTab ? (
                <LiveStage tab={shownTab} person={person} name={name} />
            ) : null}
        </div>
    )
}

function LiveStage({ tab, person, name }: { tab: TabCall; person: SocialPerson; name: string }) {
    const { t } = useTranslation('social')
    const room = useCallStore((state) => state.room)
    const mic = useCallStore((state) => state.mic)
    const camera = useCallStore((state) => state.camera)
    const navigate = useNavigate()
    const { key } = useLocation()
    useMicShortcut(true, CALL_MIC)
    const { phase } = tab
    const ringing = phase === 'calling'
    // "Thu nhỏ": back to the page before, or the Friends page when the DM was the first one (09 S-CALL-01 › Đi tới).
    const minimize = () => void (key === 'default' ? navigate(friendsPath()) : navigate(-1))
    const micHint = mic === 'blocked' ? t('call.micBlocked') : t(mic === 'on' ? 'call.micOff' : 'call.micOn')
    const cameraHint =
        camera === 'blocked' ? t('call.cameraBlocked') : t(camera === 'on' ? 'call.cameraOff' : 'call.cameraOn')

    return (
        <section aria-label={t('call.region', { name })} className='flex min-h-0 flex-1 flex-col bg-bg'>
            <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6'>
                <TopLine tab={tab} />
                {ringing ? (
                    <Face person={person} name={name} halo />
                ) : room ? (
                    <RoomContext.Provider value={room}>
                        <LivePeople person={person} name={name} />
                    </RoomContext.Provider>
                ) : (
                    <People person={person} name={name} />
                )}
            </div>
            <div className='flex shrink-0 items-start justify-center gap-4 pb-6 pt-4'>
                <Suspense fallback={null}>
                    <RoomControl
                        icon={mic === 'on' ? <Mic /> : <MicOff />}
                        label={t('call.mic')}
                        hint={micHint}
                        on={mic === 'on'}
                        disabled={mic === 'blocked'}
                        onClick={() => void switchCallMic(mic !== 'on')}
                    />
                    <RoomControl
                        icon={camera === 'on' ? <Video /> : <VideoOff />}
                        label={t('call.camera')}
                        hint={cameraHint}
                        on={camera === 'on'}
                        disabled={camera === 'blocked'}
                        onClick={() => void switchCallCamera(camera !== 'on')}
                    />
                    <RoomControl
                        icon={<Minimize2 />}
                        label={t('call.minimize')}
                        hint={t('call.minimizeHint')}
                        onClick={minimize}
                    />
                    <div style={APART}>
                        <RoomControl
                            icon={<PhoneOff />}
                            label={t(ringing ? 'call.cancel' : 'call.end')}
                            hint={t(ringing ? 'call.cancelHint' : 'call.endHint')}
                            onClick={() => void hangUp()}
                            className={PRESSED}
                            style={DANGER}
                        />
                    </div>
                </Suspense>
            </div>
        </section>
    )
}

/** The line over the people (C-48): the step, or the kind and the clock counting each second from the answer. */
function TopLine({ tab }: { tab: TabCall }) {
    const { t } = useTranslation('social')
    const { phase, call } = tab
    const now = useSecond()
    if (phase === 'connected' && call.acceptedAt) {
        return (
            <p className='flex items-center gap-1.5 text-label text-text-secondary'>
                <span>{t(call.video ? 'call.videoKind' : 'call.voiceKind')} ·</span>
                <span className='font-numeric text-numeric-inline tabular-nums'>
                    {callClock(now - Date.parse(call.acceptedAt))}
                </span>
            </p>
        )
    }
    const words =
        phase === 'calling'
            ? t(call.video ? 'call.callingVideo' : 'call.calling')
            : phase === 'reconnecting'
              ? t('call.reconnecting')
              : t('call.connecting')
    return <p className='text-label text-text-secondary'>{words}</p>
}

/** The server's time, a new render each second (the call's clock, 09 › Số). */
function useSecond(): number {
    const [now, setNow] = useState(serverNow)
    useEffect(() => {
        const timer = setInterval(() => setNow(serverNow()), 1000)
        return () => clearInterval(timer)
    }, [])
    return now
}

/** Me and them, as LiveKit has us: who speaks, whether they muted. */
function LivePeople({ person, name }: { person: SocialPerson; name: string }) {
    const participants = useParticipants()
    const self = participants.find((one) => one.isLocal)
    const other = participants.find((one) => !one.isLocal)
    return (
        <div className='flex items-start' style={PEOPLE}>
            {self ? <LiveFace participant={self} /> : <MyFace speaking={false} />}
            {other ? (
                <LiveFace participant={other} person={person} name={name} />
            ) : (
                <Face person={person} name={name} />
            )}
        </div>
    )
}

function LiveFace({ participant, person, name }: { participant: Participant; person?: SocialPerson; name?: string }) {
    const speaking = useIsSpeaking(participant)
    if (!person || name === undefined) return <MyFace speaking={speaking} />
    return <Face person={person} name={name} speaking={speaking} muted={!participant.isMicrophoneEnabled} />
}

/** Before the link (joining, after losing it): the two avatars, nothing live. */
function People({ person, name }: { person: SocialPerson; name: string }) {
    return (
        <div className='flex items-start' style={PEOPLE}>
            <MyFace speaking={false} />
            <Face person={person} name={name} />
        </div>
    )
}

function MyFace({ speaking }: { speaking: boolean }) {
    const { t } = useTranslation('social')
    const profile = useProfile().data
    const me: SocialPerson = {
        id: profile?.id ?? '',
        username: profile?.username ?? null,
        displayName: profile?.displayName ?? null,
        avatarUrl: profile?.avatarUrl ?? null
    }
    return <Face person={me} name={t('call.you')} speaking={speaking} />
}

/**
 * A person on the Stage (C-48): avatar 120 in a 148 frame (the ringing halo
 * 14 around it, or the `speaking-ring` 2 apart), the name under it (`body`
 * 600, one line cut at 240, its Tooltip the full name), `mic-off` 14 after it
 * when they muted.
 */
function Face({
    person,
    name,
    speaking = false,
    muted = false,
    halo = false
}: {
    person: SocialPerson
    name: string
    speaking?: boolean
    muted?: boolean
    halo?: boolean
}) {
    const { t } = useTranslation('social')
    return (
        <div className='flex flex-col items-center gap-3'>
            <span className='relative flex items-center justify-center' style={FRAME}>
                {halo ? <CallHalo /> : null}
                <span className='rounded-full' style={speaking ? SPEAKING : undefined}>
                    <PersonAvatar
                        person={person}
                        className='shrink-0'
                        style={AVATAR}
                        initialClassName='text-title-1'
                        iconClassName='size-12'
                    />
                </span>
            </span>
            <span className='flex max-w-60 items-center gap-1.5 text-body font-semibold text-text-primary'>
                <span className='truncate' title={name}>
                    {name}
                </span>
                {muted ? (
                    <MicOff
                        className='size-3.5 shrink-0 text-text-secondary'
                        aria-label={t('call.micMuted', { name })}
                        role='img'
                    />
                ) : null}
                {speaking ? <span className='sr-only'>{t('call.speaking', { name })}</span> : null}
            </span>
        </div>
    )
}

/**
 * What came of the call (C-48 › Kết quả): their avatar and the words (refused,
 * busy, no answer, lost · 08:41, never connected; over · 03:15), "Gọi lại"
 * (the same kind of call) · "Đóng" where one may try again; the DM again after
 * 5 seconds, 2 for one over (`call-session`).
 */
function ResultStage({ result, person, name }: { result: CallResult; person: SocialPerson; name: string }) {
    const { t } = useTranslation('social')
    const { call } = useCallPress()
    const said = resultWords(t, result, name)
    return (
        <section
            aria-label={t('call.region', { name })}
            className='flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto bg-bg p-6'
        >
            <span className='flex items-center justify-center' style={FRAME}>
                <PersonAvatar
                    person={person}
                    className='shrink-0'
                    style={AVATAR}
                    initialClassName='text-title-1'
                    iconClassName='size-12'
                />
            </span>
            <p className='text-center text-title-2 font-semibold text-text-primary'>{said}</p>
            {result.buttons ? (
                <div className='flex items-center gap-2'>
                    <Button
                        variant='secondary'
                        size='sm'
                        onClick={() => void call(result.call.dmId, result.call.video)}
                    >
                        <Phone aria-hidden='true' />
                        {t('call.callAgain')}
                    </Button>
                    <Button variant='text' size='sm' onClick={dismissResult}>
                        {t('call.close')}
                    </Button>
                </div>
            ) : null}
        </section>
    )
}
