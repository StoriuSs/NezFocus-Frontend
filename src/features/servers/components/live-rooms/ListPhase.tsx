import { PhaseLeft, PhaseTag } from '@/components/shell/PhaseTag'
import { minutesLeft, remainingMs, type PhaseState } from '@/features/study'

/**
 * A phase on the Study pages' rows (PhaseBadge `S · list`, C-19, C-44): its
 * name and minutes left ("Tập trung · còn 18 phút"); "Tạm dừng" paused; "Hết
 * giờ nghỉ" for a Solo waiting. `now`: the row's clock (`useListClock`).
 */
export function ListPhase({ phase, now }: { phase: PhaseState; now: number }) {
    const paused = phase.status === 'paused'
    const waiting = phase.status === 'waiting'
    return (
        <span className='flex text-label'>
            <PhaseTag phase={phase.phase} paused={paused} waiting={waiting}>
                {paused || waiting ? null : <PhaseLeft minutes={minutesLeft(remainingMs(phase, now))} />}
            </PhaseTag>
        </span>
    )
}
