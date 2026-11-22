import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import mascotHappy from '@/assets/mascot/runtime-happy-320.webp'
import mascotSleepy from '@/assets/mascot/runtime-sleepy-160.webp'
import { Mascot } from '@/components/brand/mascot/Mascot'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { studiedText } from '../lib/durations'
import { clockText, isLongClock, remainingMs, roundOf } from '../lib/phases'
import type { AnySession } from '../types'
import { PhaseBadge } from './PhaseBadge'

const ALWAYS = '(min-width: 0px)'

/** The ring's spoken name, again each minute (C-18 › Accessibility): "Tập trung, vòng 2, còn 18 phút". */
function useTimerLabel(session: AnySession, left: number): string {
    const { t } = useTranslation('study')
    const minutes = Math.floor(Math.ceil(left / 1000) / 60)
    return t('ring.timer', {
        phase: session.status === 'paused' ? t('phase.paused') : t(`phase.${session.phase}`),
        round: roundOf(session),
        left: minutes > 0 ? t('minutes', { count: minutes }) : t('ring.underAMinute')
    })
}

/**
 * The phase inside the ring (C-18): Runtime in a break (sleepy 80 in a
 * short one, happy 80 in a long one; never in focus, DESIGN.md › Mascot),
 * PhaseBadge `M`, what is left of the phase in `timer` (`timer-long` for a
 * phase of 100 minutes or more, chosen as it began), and the cycle line.
 * Syncing again, the number is `text-tertiary`. One `timer` element for
 * screen readers, its name changed each minute.
 */
export function SessionFace({
    session,
    now,
    line,
    syncing
}: {
    session: AnySession
    now: number
    line: string
    syncing: boolean
}) {
    const left = remainingMs(session, now)
    const label = useTimerLabel(session, left)
    const breakMood = session.phase === 'short_break' ? 'sleepy' : session.phase === 'long_break' ? 'happy' : null
    return (
        <div role='timer' aria-label={label} className='flex flex-col items-center gap-1'>
            {breakMood ? (
                <Mascot
                    mood={breakMood}
                    size={80}
                    still={breakMood === 'sleepy' ? mascotSleepy : mascotHappy}
                    loadWhen={ALWAYS}
                    className='mb-1'
                />
            ) : null}
            <PhaseBadge phase={session.phase} paused={session.status === 'paused'} />
            <span
                aria-hidden='true'
                className={cn(
                    'font-numeric tabular-nums',
                    isLongClock(session) ? 'text-timer-long' : 'text-timer',
                    syncing ? 'text-text-tertiary' : 'text-text-primary'
                )}
            >
                {clockText(left)}
            </span>
            <span aria-hidden='true' className='max-w-[264px] text-label font-medium text-text-secondary'>
                {line}
            </span>
        </div>
    )
}

/**
 * No session yet (C-18 `idle`): "Chưa có phiên học", and for one who may
 * start one "Bắt đầu Tập trung {N} phút" (the room's own cycle, started at
 * once) and "Chu kỳ khác" (S-ROOM-03); for anyone else, who may.
 */
export function IdleFace({
    focusMinutes,
    canStart,
    starting,
    onStart,
    onOtherCycle
}: {
    focusMinutes: number
    canStart: boolean
    starting: boolean
    onStart: () => void
    onOtherCycle: () => void
}) {
    const { t } = useTranslation('study')
    return (
        <div className='flex flex-col items-center gap-3'>
            <p className='text-headline text-text-primary'>{t('ring.idle')}</p>
            {canStart ? (
                <>
                    <Button type='button' onClick={onStart} aria-busy={starting || undefined}>
                        {t('ring.start', { count: focusMinutes })}
                    </Button>
                    <Button type='button' variant='text' size='sm' onClick={onOtherCycle}>
                        {t('ring.otherCycle')}
                    </Button>
                </>
            ) : (
                <p className='max-w-[240px] text-label text-text-secondary'>{t('ring.managersOnly')}</p>
            )}
        </div>
    )
}

/**
 * The session just ended (C-18 `ended`, D-49): Runtime happy 80, "Phiên học
 * đã kết thúc", one's own minutes in it (`stat` 32; under one, "Phiên này
 * chưa đủ 1 phút"), and today with the streak, once known.
 */
export function EndedFace({
    seconds,
    today
}: {
    seconds: number
    today: { seconds: number; streak: number } | undefined
}) {
    const { t } = useTranslation('study')
    return (
        <div className='flex flex-col items-center gap-1'>
            <Mascot mood='happy' size={80} still={mascotHappy} loadWhen={ALWAYS} className='mb-1' />
            <p className='text-headline text-text-primary'>{t('ring.ended')}</p>
            {seconds >= 60 ? (
                <p className='font-numeric text-stat tabular-nums text-text-primary'>{studiedText(t, seconds)}</p>
            ) : (
                <p className='text-body text-text-secondary'>{t('ring.underOne')}</p>
            )}
            {today ? (
                <p className='text-label text-text-secondary'>
                    {today.streak > 0
                        ? t('ring.today', { time: studiedText(t, today.seconds), count: today.streak })
                        : t('ring.todayNoStreak', { time: studiedText(t, today.seconds) })}
                </p>
            ) : null}
        </div>
    )
}
