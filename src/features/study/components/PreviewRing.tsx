import type { ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import '../study.css'
import { useConnectionBanner } from '@/features/realtime'
import { accountTimeZone, timeIn } from '@/lib/time-zones'
import { useCycleLine } from '../hooks/useCycleLine'
import { useSessionClock } from '../hooks/useSessionClock'
import { minutesLeft, phaseGone, remainingMs, roundOf } from '../lib/phases'
import type { RoomSession } from '../types'
import { PhaseBadge } from './PhaseBadge'
import { SessionFace } from './RingFaces'
import { RhythmRing } from './RhythmRing'

/**
 * A study room's ring on its preview page (07 S-ROOM-01 `session-running`,
 * `idle`; C-18 › Chưa vào phòng): the seats of those in it (oneself not
 * among them), the session's phase and clock, or "Chưa có phiên học" /
 * "Phòng đang trống"; under it, with a session, who is in it and in which
 * phase, who controls it, and when it began. In another session already
 * (`elsewhere`, a dock showing its seconds), the ring says "còn N phút" in
 * place of a second clock. No buttons: one joins below.
 */
export default function PreviewRing({
    channelId,
    session,
    seats,
    people,
    hostName,
    nameOf,
    elsewhere
}: {
    channelId: string
    session: RoomSession | null
    seats: { id: string; seat: ReactNode }[]
    /** How many are in the room. */
    people: number
    /** The Host's name when in the room; null when there is none or they are not here. */
    hostName: string | null
    nameOf: (userId: string) => string
    elsewhere: boolean
}) {
    const { t } = useTranslation('study')
    const now = useSessionClock(session)
    const syncing = useConnectionBanner() !== null
    const { text: line } = useCycleLine(session, {
        channelId,
        me: '',
        nameOf,
        canResume: false,
        syncing
    })

    const face = !session ? (
        <p className='text-headline text-text-primary'>{t(people === 0 ? 'preview.empty' : 'ring.idle')}</p>
    ) : elsewhere ? (
        <MinutesFace session={session} now={now} line={line} />
    ) : (
        <SessionFace session={session} now={now} line={line} syncing={syncing} />
    )

    return (
        <div className='flex flex-col items-center gap-4'>
            <RhythmRing
                phase={session?.phase}
                gone={session ? phaseGone(session, now) : 0}
                seats={seats}
                seatsLabel={t('ring.seats', { count: people })}
            >
                {face}
            </RhythmRing>
            {session ? (
                <div className='flex flex-col items-center gap-1 text-center'>
                    <p className='text-body font-semibold text-text-primary'>
                        {previewLine(t, session, people, hostName)}
                    </p>
                    <p className='text-label text-text-secondary'>
                        {t('preview.startedAt', { time: timeIn(accountTimeZone(), new Date(session.startedAt)) })}
                    </p>
                </div>
            ) : null}
        </div>
    )
}

/**
 * In another session already: the phase and "còn 18 phút" (`title-1`), not
 * a second clock by the second (C-18); paused, no number (C-19 `list`). One
 * `timer` element for screen readers, its name changed each minute.
 */
function MinutesFace({ session, now, line }: { session: RoomSession; now: number; line: string }) {
    const { t } = useTranslation('study')
    const paused = session.status === 'paused'
    const minutes = minutesLeft(remainingMs(session, now))
    const left = minutes > 0 ? t('preview.left', { count: minutes }) : t('preview.underAMinute')
    const label = t('ring.timer', {
        phase: paused ? t('phase.paused') : t(`phase.${session.phase}`),
        round: roundOf(session),
        left: minutes > 0 ? t('minutes', { count: minutes }) : t('ring.underAMinute')
    })
    return (
        <div role='timer' aria-label={paused ? t('phase.paused') : label} className='flex flex-col items-center gap-1'>
            <PhaseBadge phase={session.phase} paused={paused} />
            {paused ? null : (
                <span aria-hidden='true' className='font-numeric text-title-1 tabular-nums text-text-primary'>
                    {left}
                </span>
            )}
            <span aria-hidden='true' className='max-w-[264px] text-label font-medium text-text-secondary'>
                {line}
            </span>
        </div>
    )
}

/**
 * The people line of the preview page (07 S-ROOM-01 › Nội dung chữ): how
 * many are in the room and in which phase, and, in focus or paused, who
 * controls it ("Chưa có người điều khiển" with none; nothing when the Host
 * is away from the room, their name unknown here).
 */
function previewLine(t: TFunction<'study'>, session: RoomSession, people: number, hostName: string | null): string {
    if (people === 0) return t('preview.empty')
    const phase = session.status === 'paused' ? 'paused' : session.phase
    const count = t(`preview.${phase}`, { count: people })
    if (session.phase !== 'focus' && session.status !== 'paused') return count
    if (session.hostId === null) return `${count} · ${t('preview.noHost')}`
    return hostName ? `${count} · ${t('preview.host', { name: hostName })}` : count
}
