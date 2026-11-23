import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode, type Ref } from 'react'
import { Loader2, Pause, Play, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import '../study.css'
import { Button } from '@/components/ui/button'
import { useConnectionBanner } from '@/features/realtime'
import { accountTimeZone } from '@/lib/time-zones'
import { cn } from '@/lib/utils'
import { useSessionCommand, useStartSession } from '../api/useSessionCommands'
import { useSoloSession } from '../api/useSoloSession'
import { useStudyToday } from '../api/useStudyToday'
import { useCommandWhenLive } from '../hooks/useCommandWhenLive'
import { useCycleLine } from '../hooks/useCycleLine'
import { useEndedHere } from '../hooks/useEndedHere'
import { useJustJoined } from '../hooks/useJustJoined'
import { usePhaseBreath } from '../hooks/usePhaseBreath'
import { usePhaseNews } from '../hooks/usePhaseNews'
import { useSessionClock } from '../hooks/useSessionClock'
import { useSessionNews } from '../hooks/useSessionNews'
import { studiedText } from '../lib/durations'
import { clockText, phaseGone, remainingMs, roundOf } from '../lib/phases'
import { endLine, peopleLine } from '../lib/room-lines'
import { dayStartOf, todaySecondsAt } from '../lib/today'
import { useSoloYield } from '../solo-yield.store'
import type { SessionCommand, StudyRoomView } from '../types'
import { ChangeCycleDialog, StartSessionDialog } from './CycleDialogs'
import { PhaseBadge } from './PhaseBadge'
import { EndedFace, IdleFace, SessionFace } from './RingFaces'
import { RhythmRing } from './RhythmRing'
import { SessionMenu, StopSessionDialog } from './SessionMenu'

/** What a room's round control takes (the voice feature's RoomControl, C-21): handed in, study knows no voice. */
export interface ControlProps {
    icon: ReactNode
    label: string
    hint: string
    onClick?: () => void
    'aria-busy'?: boolean
    'aria-haspopup'?: 'menu'
    /** Shown, its Tooltip saying why, but does nothing ("Đổi chu kỳ" while running, 08 S-STUDY-02). */
    disabled?: boolean
    className?: string
}

type Dialog = 'start' | 'change' | 'stop' | null

/**
 * A study room once joined (07 S-ROOM-02, S-ROOM-06 `study-room-idle`):
 * the ring view (RhythmRing with the seats, C-18) or, when the page shows
 * something else (the grid of D-55, a tile zoomed in, a screen shared:
 * `content`), the compact block over it; the lines under the ring; the
 * controls at the bottom, with the Host's (pause / resume, "Điều khiển")
 * for the Host and those who manage study rooms, and "Tiếp tục" for anyone
 * in a paused session with no Host (D-119).
 *
 * No session: the ring's track and the start, for one who may ("Bắt đầu
 * Tập trung 25 phút" at once with the room's cycle; "Chu kỳ khác", S-ROOM-03);
 * while one's Solo runs, asked first: it would end (08
 * `start-while-solo-confirm`, D-103).
 * Ended while one was here: the summary in the ring until a new session or
 * one leaves (D-49; never after a reload, D-231), the start under it.
 *
 * Under the people line, one's minutes today as they grow ("Bạn đã tập
 * trung 45 phút hôm nay", 07 Q5; from the first whole minute: D-224, D-231),
 * unless paused or with no Host, which say so there instead. Under them,
 * one's own camera's tile while it is on (`self`, 192 × 144, D-56): the ring
 * shows nobody else's.
 *
 * A change of phase under one's eyes: "Cả phòng thở ra" (`usePhaseBreath`),
 * on the ring or on the compact block.
 *
 * Toasts name who did what (`useSessionNews`); one's own doings show in
 * place. Syncing again (07 `syncing`), the ring's number is `text-tertiary`
 * and a Host's command pressed waits in `loading` for the socket, then goes.
 */
export default function StudyStage({
    room,
    me,
    joinedAt,
    people,
    seats,
    content,
    self,
    devices,
    leave,
    Control,
    barRef
}: {
    room: StudyRoomView
    me: string
    /** When one joined the room this time: a summary of a session ended before is not one's own. */
    joinedAt: string | null
    /** Everyone in the room, in the order shown, oneself first, with the names to say. */
    people: { id: string; name: string }[]
    seats: { id: string; seat: ReactNode }[]
    /** What the stage shows in place of the ring; null: the ring. */
    content: ReactNode | null
    /** One's own camera's tile in the ring view, while it is on (07 `camera-on`, D-56). */
    self?: ReactNode
    /** Mic, Camera, Share. */
    devices: ReactNode
    leave: ReactNode
    Control: ComponentType<ControlProps>
    barRef: Ref<HTMLDivElement>
}) {
    const { t } = useTranslation('study')
    const session = room.session
    const now = useSessionClock(session)
    const stage = useRef<HTMLDivElement>(null)
    usePhaseBreath(stage, session)
    const syncing = useConnectionBanner() !== null
    const others = people.length - 1

    // Names of everyone seen here: who paused or stopped may have left since.
    const [seen, setSeen] = useState<Record<string, string>>({})
    const unseen = people.filter((person) => seen[person.id] !== person.name)
    // Kept while rendering (react.dev, "storing information from previous renders").
    if (unseen.length > 0) setSeen({ ...seen, ...Object.fromEntries(unseen.map((person) => [person.id, person.name])) })
    const nameOf = useCallback(
        (userId: string) => seen[userId] ?? people.find((person) => person.id === userId)?.name ?? t('news.someone'),
        [seen, people, t]
    )
    useSessionNews(room.channelId, me, nameOf, session?.hostId ?? null)
    const said = usePhaseNews(session)
    useJustJoined(session, joinedAt)

    const ended = useEndedHere(room.channelId, session === null, joinedAt)
    const today = useStudyToday()
    const isHost = session?.hostId === me
    const canControl = session !== null && (isHost || room.canManage)
    const canResume = session?.status === 'paused' && (canControl || session.hostId === null)
    const { text: line, pressResume } = useCycleLine(session, {
        channelId: room.channelId,
        me,
        nameOf,
        canResume,
        syncing
    })
    // Read when a start comes back refused, maybe after the dialog that sent it closed: the room as it is then.
    const current = useRef<{ hostName: string | null } | null>(null)
    useEffect(() => {
        current.current = session ? { hostName: session.hostId ? nameOf(session.hostId) : null } : null
    })
    const roomNow = useCallback(() => current.current, [])
    const start = useStartSession(room.channelId, roomNow)
    const [dialog, setDialog] = useState<Dialog>(null)
    const close = useCallback(() => setDialog(null), [])
    // The session gone (stopped, ended by itself): its dialogs go with it; one came: the start's.
    if (!session && (dialog === 'change' || dialog === 'stop')) setDialog(null)
    if (session && dialog === 'start') setDialog(null)

    // A command pressed while syncing again waits for the socket (07 `syncing`); sent at once otherwise.
    const command = useSessionCommand(session)
    const { send, busy } = useCommandWhenLive<SessionCommand>(command.mutate, {
        pending: command.isPending,
        syncing,
        active: session !== null
    })

    const solo = useSoloSession().data?.session ?? null
    const askYield = useSoloYield((state) => state.ask)
    const startNow = () => {
        if (start.isPending) return
        if (solo) askYield({ kind: 'start', focusMinutes: room.cycle.focus, confirm: () => start.mutate(null) })
        else start.mutate(null)
    }
    const canStart = room.isStudyRoom && room.canStart
    const startButton = (size: 'default' | 'sm') =>
        canStart ? (
            <Button type='button' size={size} onClick={startNow} aria-busy={start.isPending || undefined}>
                {start.isPending ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                {t('ring.start', { count: room.cycle.focus })}
            </Button>
        ) : null

    const endText = ended && endLine(t, ended, me, nameOf)
    const todaySeconds =
        session && today.data ? todaySecondsAt(today.data, session, now, dayStartOf(now, accountTimeZone())) : 0
    const mine = ended?.summaries?.find((summary) => summary.userId === me)?.seconds ?? 0
    const face = session ? (
        <SessionFace session={session} now={now} line={line} syncing={syncing} />
    ) : ended ? (
        <EndedFace
            seconds={mine}
            today={today.data && { seconds: today.data.todaySeconds, streak: today.data.streak }}
        />
    ) : (
        <IdleFace
            focusMinutes={room.cycle.focus}
            canStart={canStart}
            starting={start.isPending}
            onStart={startNow}
            onOtherCycle={() => setDialog('start')}
        />
    )

    const paused = session?.status === 'paused'
    const main = session && (canControl || canResume) && (
        <Control
            icon={busy ? <Loader2 className='animate-spin' /> : paused ? <Play /> : <Pause />}
            label={paused ? t('controls.resume') : t('controls.pause')}
            hint={paused ? t('controls.resumeHint') : t('controls.pauseHint')}
            aria-busy={busy || undefined}
            className='size-14 border-0 bg-text-primary text-bg hover:bg-text-primary hover:bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))]'
            onClick={() => send(paused ? 'resume' : 'pause')}
        />
    )

    return (
        <div ref={stage} className='flex min-h-0 flex-1 flex-col'>
            <p className='sr-only' aria-live='polite'>
                {said}
            </p>
            {content === null ? (
                <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-4'>
                    <RhythmRing
                        phase={session?.phase}
                        gone={session ? phaseGone(session, now) : 0}
                        seats={seats}
                        seatsLabel={t('ring.seats', { count: people.length })}
                    >
                        {face}
                    </RhythmRing>
                    <div className='flex flex-col items-center gap-1 text-center'>
                        {session || !ended ? (
                            <p className='text-body font-semibold text-text-primary'>
                                {peopleLine(t, session, others)}
                            </p>
                        ) : (
                            <>
                                {endText ? (
                                    <p className='text-body font-semibold text-text-primary'>{endText}</p>
                                ) : null}
                                <div className='mt-2 flex items-center gap-4'>
                                    {startButton('default')}
                                    {canStart ? (
                                        <Button
                                            type='button'
                                            variant='text'
                                            size='sm'
                                            onClick={() => setDialog('start')}
                                        >
                                            {t('ring.otherCycle')}
                                        </Button>
                                    ) : null}
                                </div>
                            </>
                        )}
                        {paused && !pressResume ? (
                            <p className='text-label text-text-secondary'>{t('people.pausedNote')}</p>
                        ) : session && session.hostId === null && !paused ? (
                            <p className='text-label text-text-secondary'>{t('people.noHostNote')}</p>
                        ) : session && !paused && todaySeconds >= 60 ? (
                            <p className='text-label text-text-secondary'>
                                {t('people.today', { time: studiedText(t, todaySeconds) })}
                            </p>
                        ) : null}
                    </div>
                    {self}
                </div>
            ) : (
                <div className='flex min-h-0 flex-1 flex-col'>
                    <div className='flex shrink-0 px-6 pt-4'>
                        <div className='flex flex-col gap-1 rounded-button border px-4 py-3'>
                            {session ? (
                                <>
                                    <div className='flex items-center gap-3'>
                                        <PhaseBadge phase={session.phase} paused={paused} />
                                        <span
                                            className={cn(
                                                'font-numeric text-stat tabular-nums',
                                                syncing ? 'text-text-tertiary' : 'text-text-primary'
                                            )}
                                        >
                                            {clockText(remainingMs(session, now))}
                                        </span>
                                    </div>
                                    <span className='text-label text-text-secondary'>
                                        {t('ring.compact', { round: roundOf(session), count: people.length })}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className='text-headline text-text-primary'>
                                        {ended
                                            ? t('ring.compactEnded', { time: studiedText(t, mine) })
                                            : t('ring.idle')}
                                    </span>
                                    {startButton('sm')}
                                </>
                            )}
                        </div>
                    </div>
                    {content}
                </div>
            )}
            <div ref={barRef} className='flex shrink-0 items-start justify-center gap-4 px-6 pb-6 pt-2'>
                {devices}
                {main}
                {session && canControl ? (
                    <SessionMenu
                        session={session}
                        me={me}
                        hostName={session.hostId ? nameOf(session.hostId) : null}
                        people={people.length}
                        onSkip={() => send('skip')}
                        onChangeCycle={() => setDialog('change')}
                        onStop={() => setDialog('stop')}
                    >
                        <Control
                            icon={<SlidersHorizontal />}
                            label={t('controls.menu')}
                            hint={t('controls.menuHint')}
                            aria-haspopup='menu'
                        />
                    </SessionMenu>
                ) : null}
                <span className='w-6' aria-hidden='true' />
                {leave}
            </div>
            {dialog === 'start' ? (
                <StartSessionDialog
                    channelId={room.channelId}
                    roomCycle={room.cycle}
                    people={people.length}
                    roomNow={roomNow}
                    onClose={close}
                />
            ) : null}
            {dialog === 'change' && session ? (
                <ChangeCycleDialog
                    channelId={room.channelId}
                    session={session}
                    roomCycle={room.cycle}
                    nameOf={nameOf}
                    onClose={close}
                />
            ) : null}
            {dialog === 'stop' && session ? (
                <StopSessionDialog session={session} people={people.length} onClose={close} />
            ) : null}
        </div>
    )
}
