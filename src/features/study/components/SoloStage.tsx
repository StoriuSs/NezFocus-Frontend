import { useEffect, useRef, useState, type ComponentType } from 'react'
import { Loader2, Pause, Play, SkipForward, SlidersHorizontal, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import '../study.css'
import { Button } from '@/components/ui/button'
import { useConnectionBanner } from '@/features/realtime'
import { useToastEdge } from '@/hooks/useToastArea'
import { accountTimeZone, timeIn } from '@/lib/time-zones'
import { useSoloCommand, useStartSolo } from '../api/useSolo'
import { useSoloSession } from '../api/useSoloSession'
import { useStudyToday } from '../api/useStudyToday'
import { useCommandWhenLive } from '../hooks/useCommandWhenLive'
import { usePhaseNews } from '../hooks/usePhaseNews'
import { useSessionClock } from '../hooks/useSessionClock'
import { studiedText } from '../lib/durations'
import { phaseGone } from '../lib/phases'
import { waitLeftMs } from '../lib/solo'
import { soloLine } from '../lib/solo-words'
import { DAY_CAP_SECONDS, dayStartOf, todaySecondsAt } from '../lib/today'
import { useStudyStore, type SoloEnded } from '../study.store'
import type { SoloCommand } from '../types'
import { ChangeCycleDialog, SoloStartDialog } from './CycleDialogs'
import { EndedFace, IdleFace, SessionFace, WaitingFace } from './RingFaces'
import { RhythmRing } from './RhythmRing'
import type { ControlProps } from './StudyStage'

const FIRST_SOLO_CYCLE = { focus: 25, shortBreak: 5, longBreak: null, longBreakEvery: null }

const MAIN_CONTROL =
    'size-14 border-0 bg-text-primary text-bg hover:bg-text-primary hover:bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))]'

/**
 * The Solo page's stage (08 S-STUDY-02), as a room's (07 S-ROOM-02) but for
 * one: the ring with no seats, no Mic or Camera. Running or paused: the
 * phase and its number, "Bạn đã tập trung N phút hôm nay" (paused: "Đồng hồ
 * đứng yên, không tính phút"), and the controls "Bỏ qua pha" · Tạm dừng /
 * Tiếp tục · "Đổi chu kỳ" (only while paused, D-21) ··· "Dừng" (no question,
 * REQ-STUDY-05). Its break over: "Hết giờ nghỉ" counting down the 10 minutes,
 * "Học tiếp" under the ring (focused as the wait begins), Dừng alone.
 *
 * Ended while this tab was open (D-234): the summary in the ring and why
 * under it (stopped here, elsewhere at HH:MM, the wait not taken up, a room's
 * session), the start under it. None (opened, reloaded): "Học một mình" and
 * the start with the last Solo's cycle; in a room's session, why not
 * (`inRoom`, REQ-STUDY-05).
 *
 * The round controls are the voice feature's, handed in (`Control`). Not
 * here yet: the floating window (M7), the friends studying (M6, D-217).
 */
export default function SoloStage({
    Control,
    inRoom
}: {
    Control: ComponentType<ControlProps>
    /** The room whose session one takes part in: no Solo starts meanwhile. */
    inRoom: string | null
}) {
    const { t } = useTranslation('study')
    const solo = useSoloSession()
    const session = solo.data?.session ?? null
    const ended = useStudyStore((state) => state.soloEnded)
    const now = useSessionClock(session)
    const syncing = useConnectionBanner() !== null
    const today = useStudyToday()
    const start = useStartSolo()
    const command = useSoloCommand(session)
    const { send, busy } = useCommandWhenLive<SoloCommand>(command.mutate, {
        pending: command.isPending,
        syncing,
        active: session !== null
    })
    const said = usePhaseNews(session)
    const [dialog, setDialog] = useState<'start' | 'change' | null>(null)
    if (dialog === 'change' && !session) setDialog(null)
    if (dialog === 'start' && session) setDialog(null)

    const bar = useRef<HTMLDivElement>(null)
    useToastEdge('barTop', bar, session !== null)
    // Học tiếp has the focus as the wait begins on the page shown (08 S-STUDY-02 › Tương tác).
    const continueButton = useRef<HTMLButtonElement>(null)
    const waiting = session?.status === 'waiting'
    useEffect(() => {
        if (waiting) continueButton.current?.focus()
    }, [waiting])

    // Read refused: the first Solo's 25/5 still starts one (D-103), the dialog with it.
    const startCycle = solo.data?.startCycle ?? FIRST_SOLO_CYCLE
    const todaySeconds = today.data ? todaySecondsAt(today.data, session, now, dayStartOf(now, accountTimeZone())) : 0
    const todayLine =
        todaySeconds >= 60 ? (
            <p className='text-body font-semibold text-text-primary'>
                {t('people.today', { time: studiedText(t, todaySeconds) })}
            </p>
        ) : null
    const refused = inRoom ? t('solo.blocked', { room: inRoom }) : undefined
    const startNow = () => {
        if (!start.isPending && !inRoom) start.mutate(null)
    }

    const shownEnded = session ? null : ended
    const face = session ? (
        session.status === 'waiting' ? (
            <WaitingFace phase={session.phase} left={waitLeftMs(session, now)} />
        ) : (
            <SessionFace session={session} now={now} line={soloLine(t, session, syncing)} syncing={syncing} />
        )
    ) : shownEnded ? (
        <EndedFace
            seconds={shownEnded.session.countedSeconds ?? 0}
            today={today.data && { seconds: today.data.todaySeconds, streak: today.data.streak }}
            plainWhenShort
        />
    ) : solo.isPending ? null : (
        <IdleFace
            title={t('solo.title')}
            focusMinutes={startCycle.focus}
            canStart={!inRoom}
            refused={refused}
            starting={start.isPending}
            onStart={startNow}
            onOtherCycle={() => setDialog('start')}
        />
    )

    const paused = session?.status === 'paused'
    return (
        <div className='flex min-h-0 flex-1 flex-col'>
            {/* The break over has no phase of its own to announce: said as the wait begins. */}
            <p className='sr-only' aria-live='polite'>
                {waiting ? t('solo.waitingNews') : said}
            </p>
            <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-4'>
                <RhythmRing
                    phase={session && session.status !== 'waiting' ? session.phase : undefined}
                    gone={session && session.status !== 'waiting' ? phaseGone(session, now) : 0}
                    seats={[]}
                    seatsLabel={t('solo.title')}
                >
                    {face}
                </RhythmRing>
                <div className='flex flex-col items-center gap-2 text-center'>
                    {waiting ? (
                        <Button
                            ref={continueButton}
                            type='button'
                            size='lg'
                            className='h-12'
                            aria-busy={busy || undefined}
                            onClick={() => send('continue')}
                        >
                            {t('solo.continue')}
                        </Button>
                    ) : null}
                    {shownEnded ? (
                        <>
                            <p className='text-body font-semibold text-text-primary'>{endedLine(t, shownEnded)}</p>
                            {todaySeconds >= DAY_CAP_SECONDS ? (
                                <p className='text-label text-text-secondary'>{t('solo.dailyCap')}</p>
                            ) : null}
                            {inRoom ? (
                                <p className='text-label text-text-secondary'>{refused}</p>
                            ) : (
                                <div className='mt-1 flex items-center gap-4'>
                                    <Button type='button' onClick={startNow} aria-busy={start.isPending || undefined}>
                                        {start.isPending ? (
                                            <Loader2 className='animate-spin' aria-hidden='true' />
                                        ) : null}
                                        {t('ring.start', { count: startCycle.focus })}
                                    </Button>
                                    <Button type='button' variant='text' size='sm' onClick={() => setDialog('start')}>
                                        {t('ring.otherCycle')}
                                    </Button>
                                </div>
                            )}
                        </>
                    ) : paused ? (
                        <p className='text-body font-semibold text-text-primary'>{t('people.pausedNote')}</p>
                    ) : solo.isPending ? null : (
                        todayLine
                    )}
                </div>
            </div>
            {session ? (
                <div ref={bar} className='flex shrink-0 items-start justify-center gap-4 px-6 pb-6 pt-2'>
                    {waiting ? null : (
                        <>
                            <Control
                                icon={<SkipForward />}
                                label={t('solo.skip')}
                                hint={t('solo.skipHint')}
                                onClick={() => send('skip')}
                            />
                            <Control
                                icon={busy ? <Loader2 className='animate-spin' /> : paused ? <Play /> : <Pause />}
                                label={paused ? t('controls.resume') : t('controls.pause')}
                                hint={paused ? t('solo.resumeHint') : t('solo.pauseHint')}
                                aria-busy={busy || undefined}
                                className={MAIN_CONTROL}
                                onClick={() => send(paused ? 'resume' : 'pause')}
                            />
                            <Control
                                icon={<SlidersHorizontal />}
                                label={t('solo.changeCycle')}
                                hint={paused ? t('solo.changeCycleHint') : t('solo.pauseToChange')}
                                disabled={!paused}
                                onClick={() => setDialog('change')}
                            />
                            <span className='w-6' aria-hidden='true' />
                        </>
                    )}
                    <Control
                        icon={<Square />}
                        label={t('solo.stop')}
                        hint={t('solo.stopHint')}
                        onClick={() => send('stop')}
                    />
                </div>
            ) : null}
            {dialog === 'start' ? (
                <SoloStartDialog
                    startCycle={startCycle}
                    pending={start.isPending}
                    onClose={() => setDialog(null)}
                    onStart={(cycle) => start.mutate(cycle, { onSuccess: () => setDialog(null) })}
                />
            ) : null}
            {dialog === 'change' && session ? (
                <ChangeCycleDialog
                    channelId={null}
                    session={session}
                    nameOf={() => ''}
                    onClose={() => setDialog(null)}
                />
            ) : null}
        </div>
    )
}

/** Why the Solo ended, under its summary (08 S-STUDY-02 `ended`, `ended-expired`, edge `stopped-other-tab`). */
function endedLine(t: ReturnType<typeof useTranslation<'study'>>['t'], ended: SoloEnded): string {
    const { endedReason, endedAt } = ended.session
    const at = endedAt ? timeIn(accountTimeZone(), new Date(endedAt)) : ''
    if (endedReason === 'expired') return t('solo.expired', { time: at })
    if (endedReason === 'joined_room') return t('solo.joinedRoom')
    return ended.stoppedHere ? t('solo.stoppedHere') : t('solo.stoppedElsewhere', { time: at })
}
