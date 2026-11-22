import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Info, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import '../study.css'
import { PhaseLeft, PhaseTag } from '@/components/shell/PhaseTag'
import { Button } from '@/components/ui/button'
import { useConnectionBanner } from '@/features/realtime'
import { useBrowserOnline } from '@/hooks/useBrowserOnline'
import { useSoloCommand, useStartSolo } from '../api/useSolo'
import { SOLO_PATH, useSoloSession } from '../api/useSoloSession'
import { useCommandWhenLive } from '../hooks/useCommandWhenLive'
import { useSessionClock } from '../hooks/useSessionClock'
import { minutesLeft, remainingMs } from '../lib/phases'
import { waitLeftMs } from '../lib/solo'
import { soloLine } from '../lib/solo-words'
import type { SoloCommand } from '../types'
import { SoloStartDialog } from './CycleDialogs'

const FIRST_SOLO_CYCLE = { focus: 25, shortBreak: 5, longBreak: null, longBreakEvery: null }

/**
 * The Study page's Solo block (08 S-STUDY-01): the one block with a frame.
 * None running: "Học một mình", what it is, "Bắt đầu Tập trung 50 phút" (the
 * last Solo's cycle, D-103) across the block, "Chu kỳ khác" under it; both
 * off with why in a room's session (`inRoom`, REQ-STUDY-05) or with no
 * network. Running or paused: its phase in minutes ("Tập trung · còn 31
 * phút"), the cycle line, "Mở". Its break over: "Hết giờ nghỉ", "Còn 8 phút
 * để học tiếp", "Học tiếp" (then its page) and "Mở". Starting goes to the
 * Solo page (`useStartSolo`).
 */
export default function SoloCard({ inRoom }: { inRoom: string | null }) {
    const { t } = useTranslation('study')
    const solo = useSoloSession()
    const session = solo.data?.session ?? null
    const now = useSessionClock(session)
    const online = useBrowserOnline()
    const syncing = useConnectionBanner() !== null
    const start = useStartSolo()
    const command = useSoloCommand(session)
    const { send, busy } = useCommandWhenLive<SoloCommand>(command.mutate, {
        pending: command.isPending,
        syncing,
        active: session !== null
    })
    const navigate = useNavigate()
    const [choosing, setChoosing] = useState(false)
    if (choosing && session) setChoosing(false)

    const startCycle = solo.data?.startCycle ?? FIRST_SOLO_CYCLE
    const refused = inRoom ? t('solo.blocked', { room: inRoom }) : online ? null : t('overview.solo.offline')
    const startNow = () => {
        if (!start.isPending && !refused) start.mutate(null)
    }

    return (
        <section aria-labelledby='solo-card-title' className='rounded-button border bg-surface-1 p-4'>
            <h2 id='solo-card-title' className='text-headline font-semibold text-text-primary'>
                {t('solo.title')}
            </h2>
            {session?.status === 'waiting' ? (
                <>
                    <p className='mt-2 text-label'>
                        <PhaseTag phase={session.phase} paused={false} waiting />
                    </p>
                    <p className='mt-1 text-label text-text-secondary'>{waitLeftLine(t, waitLeftMs(session, now))}</p>
                    <div className='mt-4 flex items-center gap-2'>
                        <Button
                            type='button'
                            size='sm'
                            aria-busy={busy || undefined}
                            onClick={() => {
                                send('continue')
                                // Syncing again, Học tiếp waits here for the socket: leaving would drop it.
                                if (!syncing) void navigate(SOLO_PATH)
                            }}
                        >
                            {t('solo.continue')}
                        </Button>
                        <Button asChild variant='text' size='sm'>
                            <Link to={SOLO_PATH}>{t('overview.solo.open')}</Link>
                        </Button>
                    </div>
                </>
            ) : session ? (
                <>
                    <p className='mt-2 text-label'>
                        <PhaseTag phase={session.phase} paused={session.status === 'paused'}>
                            {session.status === 'paused' ? null : (
                                <PhaseLeft minutes={minutesLeft(remainingMs(session, now))} />
                            )}
                        </PhaseTag>
                    </p>
                    <p className='mt-1 text-label text-text-secondary'>{soloLine(t, session, syncing)}</p>
                    <Button asChild variant='outline' size='sm' className='mt-4'>
                        <Link to={SOLO_PATH}>{t('overview.solo.open')}</Link>
                    </Button>
                </>
            ) : (
                <>
                    <p className='mt-1 text-label text-text-secondary'>{t('overview.solo.description')}</p>
                    <Button
                        type='button'
                        className='mt-4 w-full'
                        disabled={refused !== null || solo.isPending}
                        aria-busy={start.isPending || undefined}
                        onClick={startNow}
                    >
                        {start.isPending ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {t('ring.start', { count: startCycle.focus })}
                    </Button>
                    <Button
                        type='button'
                        variant='text'
                        size='sm'
                        className='mt-2'
                        disabled={refused !== null || solo.isPending}
                        onClick={() => setChoosing(true)}
                    >
                        {t('ring.otherCycle')}
                    </Button>
                    {refused ? (
                        <p className='mt-2 flex gap-1.5 text-label text-text-secondary'>
                            <Info className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
                            {refused}
                        </p>
                    ) : null}
                </>
            )}
            {choosing ? (
                <SoloStartDialog
                    startCycle={startCycle}
                    pending={start.isPending}
                    onClose={() => setChoosing(false)}
                    onStart={(cycle) => start.mutate(cycle, { onSuccess: () => setChoosing(false) })}
                />
            ) : null}
        </section>
    )
}

/** "Còn 8 phút để học tiếp", "Còn dưới 1 phút để học tiếp" (08 S-STUDY-01 `solo-waiting`): minutes, no seconds. */
function waitLeftLine(t: ReturnType<typeof useTranslation<'study'>>['t'], ms: number): string {
    const minutes = minutesLeft(ms)
    return minutes > 0 ? t('overview.solo.waitLeft', { count: minutes }) : t('overview.solo.waitUnderAMinute')
}
