import { Link } from 'react-router-dom'
import { Mic, MicOff, PhoneOff, Video, VideoOff, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import '../voice.css'
import { DOCK_BUTTON as BUTTON, DockFrame, dockLinkClass, type DockShape } from '@/components/shell/DockFrame'
import { PhaseTag } from '@/components/shell/PhaseTag'
import { IconButton } from '@/components/ui/icon-button'
import {
    clockText,
    phaseName,
    remainingMs,
    roundOf,
    sessionLineText,
    useSessionClock,
    type RoomSession
} from '@/features/study'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useLeaveRoom } from '../hooks/useLeaveRoom'
import { useModMuted } from '../hooks/useModMuted'
import { switchCamera, switchMic } from '../lib/session'
import type { VoiceRoom } from '../types'
import { useVoiceStore } from '../voice.store'

/**
 * The bar that keeps the room at hand away from its page (InRoomDock `voice`,
 * C-09, S-ROOM-06 `voice-only`): "In a room" (`+reconnecting`: "Reconnecting…"),
 * the room's name · how many people; with a study session (`room-session`,
 * S-ROOM-05), its phase and what is left of it counting each second, then
 * the room's name · its round (`DockSession`); Mic, Camera, then Leave apart at the
 * right (C-09; the frame `voice-only` lacks the Camera). Without SPEAK /
 * VIDEO, muted by a moderator (D-207), or blocked by the browser, a button
 * says why and does nothing (its help is on the room's page). The words open the room's page, with a
 * Tooltip "Open {room}". Its frame (`column`, `strip`) is the shell's
 * DockFrame, shared with the Solo's dock (D-234).
 *
 * Not on the page of the room itself (C-09): the caller leaves it out there.
 */
export default function InRoomDock({
    room,
    to,
    shape
}: {
    room: Pick<VoiceRoom, 'serverId' | 'channelId' | 'name' | 'canSpeak' | 'canVideo' | 'session'> & {
        count: number
        /** One's own row in the room's list says a moderator muted the mic (D-207). */
        modMuted: boolean
    }
    /** The room's page. */
    to: string
    shape: DockShape
}) {
    const { t } = useTranslation('voice')
    const phase = useVoiceStore((state) => state.call?.phase)
    const mic = useVoiceStore((state) => state.mic)
    const camera = useVoiceStore((state) => state.camera)
    const leave = useLeaveRoom(room)
    const modMuted = useModMuted(room.modMuted)
    const micHint = !room.canSpeak
        ? t('controls.noSpeak')
        : modMuted
          ? t('controls.modMutedHint')
          : mic === 'blocked'
            ? t('controls.micBlocked')
            : t(mic === 'on' ? 'controls.micOff' : 'controls.micOn')
    const micUsable = room.canSpeak && !modMuted && mic !== 'blocked'
    const cameraHint = !room.canVideo
        ? t('controls.noVideo')
        : camera === 'blocked'
          ? t('controls.cameraBlocked')
          : t(camera === 'on' ? 'controls.cameraOff' : 'controls.cameraOn')
    const cameraUsable = room.canVideo && camera !== 'blocked'
    const reconnecting = phase === 'reconnecting'
    const sub = reconnecting ? t('dock.reconnecting') : t('dock.people', { count: room.count })
    const { t: tShell } = useTranslation()
    // With a session, the link says its phase, the room and the round, in words apart (never the seconds).
    const sessionName = room.session
        ? [
              phaseName(tShell, room.session),
              room.name,
              reconnecting ? t('dock.reconnecting') : t('dock.round', { round: roundOf(room.session) })
          ].join(', ')
        : undefined

    return (
        <DockFrame shape={shape} label={t('dock.inRoom')}>
            {/* Within the dock: its session's minutes are read out as they change (C-09 › Accessibility). */}
            {(focused) => (
                <>
                    {room.session ? <DockMinutes session={room.session} announce={focused} /> : null}
                    <WithTooltip label={t('dock.open', { room: room.name })}>
                        <Link to={to} aria-label={sessionName} className={dockLinkClass(shape)}>
                            {room.session ? (
                                <DockSession
                                    session={room.session}
                                    name={room.name}
                                    reconnecting={reconnecting}
                                    strip={shape === 'strip'}
                                />
                            ) : (
                                <>
                                    <span className='flex items-center gap-1.5 text-body-sm font-semibold text-text-primary'>
                                        <Volume2 className='size-4 shrink-0 text-text-secondary' aria-hidden='true' />
                                        {t('dock.inRoom')}
                                    </span>
                                    <span className='flex min-w-0 gap-1 text-label'>
                                        <span className='truncate font-semibold text-text-secondary'>{room.name}</span>
                                        <span className='shrink-0 font-medium text-text-tertiary'>· {sub}</span>
                                    </span>
                                </>
                            )}
                        </Link>
                    </WithTooltip>
                    <div className={cn('flex items-center gap-1', shape === 'column' && 'px-1.5')}>
                        <WithTooltip label={micHint}>
                            <IconButton
                                label={micHint}
                                aria-disabled={micUsable ? undefined : true}
                                className={cn(BUTTON, !micUsable && 'text-text-tertiary')}
                                onClick={micUsable ? () => void switchMic(mic !== 'on') : undefined}
                            >
                                {micUsable && mic === 'on' ? <Mic /> : <MicOff />}
                            </IconButton>
                        </WithTooltip>
                        <WithTooltip label={cameraHint}>
                            <IconButton
                                label={cameraHint}
                                aria-disabled={cameraUsable ? undefined : true}
                                className={cn(BUTTON, !cameraUsable && 'text-text-tertiary')}
                                onClick={cameraUsable ? () => void switchCamera(camera !== 'on') : undefined}
                            >
                                {cameraUsable && camera === 'on' ? <Video /> : <VideoOff />}
                            </IconButton>
                        </WithTooltip>
                        {shape === 'column' ? <span className='flex-1' /> : null}
                        <WithTooltip label={t('controls.leave')}>
                            <IconButton label={t('controls.leave')} className={BUTTON} onClick={leave}>
                                <PhoneOff />
                            </IconButton>
                        </WithTooltip>
                    </div>
                </>
            )}
        </DockFrame>
    )
}

/**
 * The dock's words with a study session (InRoomDock `room-session`, C-09,
 * S-ROOM-05): PhaseBadge `S` (`body-sm` 600, the phase's colour) and what
 * is left, counting each second (`numeric-inline`, `tabular-nums`,
 * `text-primary` as the .pen's InRoomDock draws it, like the ring's number);
 * paused, "Tạm dừng 18:42" still, all `text-secondary` (`+paused`); then
 * the room's name · "Vòng 2" (`+reconnecting`: "Đang kết nối lại…"). The
 * link is named by the phase and the room, not the seconds (`DockMinutes`
 * says the minutes).
 */
function DockSession({
    session,
    name,
    reconnecting,
    strip
}: {
    session: RoomSession
    name: string
    reconnecting: boolean
    strip: boolean
}) {
    const { t } = useTranslation('voice')
    const now = useSessionClock(session)
    const paused = session.status === 'paused'
    return (
        <span className={cn('flex min-w-0', strip ? 'flex-1 items-center gap-2' : 'flex-col gap-1')}>
            <span className={cn('flex items-center gap-2 text-body-sm', !strip && 'justify-between')}>
                <PhaseTag phase={session.phase} paused={paused} />
                <span
                    aria-hidden='true'
                    className={cn(
                        'shrink-0 font-numeric text-numeric-inline tabular-nums',
                        paused ? 'text-text-secondary' : 'text-text-primary'
                    )}
                >
                    {clockText(remainingMs(session, now))}
                </span>
            </span>
            <span className='flex min-w-0 gap-1 text-label'>
                <span className='truncate font-semibold text-text-secondary'>{name}</span>
                <span className='shrink-0 font-medium text-text-tertiary'>
                    · {reconnecting ? t('dock.reconnecting') : t('dock.round', { round: roundOf(session) })}
                </span>
            </span>
        </span>
    )
}

/**
 * The session's minutes for a screen reader (C-09 › Accessibility): "Tập
 * trung · còn 18 phút", read out as the minute changes, and only while the
 * dock has the focus; outside the link, whose name stays put.
 */
function DockMinutes({ session, announce }: { session: RoomSession; announce: boolean }) {
    const { t } = useTranslation()
    const now = useSessionClock(session)
    return (
        <span className='sr-only' aria-live={announce ? 'polite' : 'off'}>
            {sessionLineText(t, session, now)}
        </span>
    )
}
